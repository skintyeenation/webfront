// Electron main process — wraps the react-native-web build as a desktop app.
//
// dev:  loads the Expo web dev server (expo start --web → http://localhost:19006)
// prod: serves the exported static bundle (app/web-build/) over a loopback
//       http://localhost:<LOOPBACK_PORT> server — NOT file://.
//
// Why a loopback server instead of file://?
//   Microsoft Entra sign-in (src/store/modules/auth.ts) builds its OAuth
//   redirect_uri from `window.location.origin`. Under file:// that origin is
//   "file://", which Entra rejects with AADSTS500111 ("reply uri … has an
//   invalid scheme"). Serving over http://localhost gives a valid loopback
//   origin Entra accepts, so the redirect lands back in-app with the auth code.
//   The matching redirect URI (http://localhost:<port>/) is registered on the
//   SPA platform of the Entra app by scripts/setup-app-signin.sh.
//
// Cross-platform: the same main process packages for Windows, Linux (Ubuntu),
// and macOS via electron-builder (see package.json "build").

const { app, BrowserWindow, shell, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:19006';

// Loopback ports for the packaged app. We try several (not one) because on
// Windows, Hyper-V/WSL/Docker reserve large, machine-specific TCP port ranges —
// a single fixed port can be unbindable, the bind fails, and sign-in silently
// breaks under file:// (AADSTS500111). macOS/Linux don't reserve ports, so one
// would do there. EVERY port in this list MUST be registered as an Entra SPA
// redirect URI (trailing slash) in scripts/setup-app-signin.sh — OAuth redirect
// matching is exact. Keep the two lists in sync.
const LOOPBACK_PORTS = (process.env.ELECTRON_LOOPBACK_PORTS ||
  '8123,8124,8125,8126,8127,8128,8129,8130,8131,8132')
  .split(',').map((s) => Number(s.trim())).filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

// Minimal static file server on 127.0.0.1 for the exported web bundle. SPA
// fallback: anything that isn't a real file (incl. the OAuth callback at "/?
// code=…") serves index.html. Tries each port in `ports` and resolves to the
// base URL of the first that binds, or null if they all fail (only then does the
// caller fall back to file://, where sign-in won't work).
function startStaticServer(rootDir, ports) {
  const handler = (req, res) => {
    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      /* keep '/' on malformed URL */
    }
    // Resolve within rootDir and block path traversal.
    let filePath = path.normalize(path.join(rootDir, pathname));
    if (!filePath.startsWith(rootDir) || pathname === '/' ||
        !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(rootDir, 'index.html');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  };
  return new Promise((resolve) => {
    const tryPort = (i) => {
      if (i >= ports.length) {
        console.error(`[skintyee] loopback server could not bind any of: ${ports.join(', ')}`);
        resolve(null);
        return;
      }
      const port = ports[i];
      const server = http.createServer(handler);
      server.once('error', (err) => {
        console.error(`[skintyee] loopback :${port} failed — ${err.code || err.message}; trying next`);
        try { server.close(); } catch { /* ignore */ }
        tryPort(i + 1);
      });
      server.listen(port, '127.0.0.1', () => {
        console.log(`[skintyee] loopback server on http://localhost:${port}/`);
        resolve(`http://localhost:${port}/`);
      });
    };
    tryPort(0);
  });
}

function createWindow(loadTarget) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    backgroundColor: '#0b0f14',
    title: 'Skin Tyee',
    // Runtime window/taskbar icon (Linux + Windows + dev). macOS uses the
    // bundled .icns from electron-builder for the dock instead. NB: kept outside
    // electron/resources/ because electron-builder excludes buildResources from
    // the packaged app, which would break this path in the installed build.
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open target=_blank / external links in the OS browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (loadTarget && loadTarget.url) {
    win.loadURL(loadTarget.url);
  } else {
    // Fallback only: file:// works for everything except Entra sign-in.
    win.loadFile(path.join(__dirname, '..', 'web-build', 'index.html'));
  }
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(async () => {
  // Allow camera (receipt webcam capture via getUserMedia) + clipboard etc.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
  });

  let loadTarget = null;
  if (isDev) {
    loadTarget = { url: DEV_URL };
  } else {
    const base = await startStaticServer(path.join(__dirname, '..', 'web-build'), LOOPBACK_PORTS);
    if (base) {
      loadTarget = { url: base };
    } else {
      // All loopback ports failed → we can only fall back to file://, where
      // Entra sign-in is broken (file:// origin → AADSTS500111). Surface it
      // loudly instead of failing silently.
      console.error('[skintyee] no loopback port available — sign-in will be unavailable (file:// fallback)');
      try {
        const { dialog } = require('electron');
        dialog.showErrorBox('Skin Tyee — sign-in unavailable',
          `Could not start the local sign-in helper on any of ports ${LOOPBACK_PORTS.join(', ')}.\n\n` +
          'The app will open, but Microsoft sign-in will not work until one of those ports is free. ' +
          'Close other apps using them (or restart) and reopen Skin Tyee.');
      } catch { /* dialog unavailable */ }
    }
  }

  createWindow(loadTarget);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(loadTarget);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

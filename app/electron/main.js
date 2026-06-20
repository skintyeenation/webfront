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

// Fixed loopback port for the packaged app. MUST stay in sync with the
// http://localhost:<port>/ entry registered as an Entra SPA redirect URI in
// scripts/setup-app-signin.sh — OAuth redirect matching is exact.
const LOOPBACK_PORT = Number(process.env.ELECTRON_LOOPBACK_PORT || 8123);

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
// code=…") serves index.html. Resolves to the base URL, or null on failure
// (caller falls back to file://, so the app still opens without sign-in).
function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
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
    });
    server.on('error', (err) => {
      console.error(`[skintyee] loopback server failed on :${LOOPBACK_PORT} — ${err.code || err.message}`);
      resolve(null);
    });
    server.listen(LOOPBACK_PORT, '127.0.0.1', () => {
      resolve(`http://localhost:${LOOPBACK_PORT}/`);
    });
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
    const base = await startStaticServer(path.join(__dirname, '..', 'web-build'));
    if (base) loadTarget = { url: base };
    // base === null → loadTarget stays null → createWindow falls back to file://
  }

  createWindow(loadTarget);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(loadTarget);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

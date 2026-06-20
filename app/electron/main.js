// Electron main process — wraps the react-native-web build as a desktop app.
//
// dev:  loads the Expo web dev server (expo start --web → http://localhost:19006)
// prod: loads the exported static bundle (app/web-build/index.html) over file://
//
// Cross-platform: the same main process packages for Windows, Linux (Ubuntu),
// and macOS via electron-builder (see package.json "build").

const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:19006';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    backgroundColor: '#0b0f14',
    title: 'Skin Tyee',
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

  if (isDev) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'web-build', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Allow camera (receipt webcam capture via getUserMedia) + clipboard etc.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

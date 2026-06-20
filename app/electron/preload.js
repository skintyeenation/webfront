// Minimal preload — contextIsolation is on and the renderer is the standard
// react-native-web bundle (no privileged Node APIs needed). A small marker is
// exposed so app code could detect the desktop shell if ever needed.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('skintyeeDesktop', {
  isElectron: true,
  platform: process.platform, // 'win32' | 'linux' | 'darwin'
});

// Runs in an isolated JS context with access to a limited set of Node/
// Electron APIs, bridged into the loaded page (pulseworkspace.co.za) only
// through contextBridge - never a shared global scope (contextIsolation is
// on, see src/main/main.js). Nothing meaningful is exposed yet: the loaded
// page is a remote origin whose deploys this shell doesn't control, so
// anything added to `pulseDesktop` below becomes part of that page's
// contract with the desktop shell and deserves the same care as a public
// API, not something to bolt on casually.
//
// `process.versions` is safe to expose as-is - it's build/runtime metadata,
// not app data - and proves the bridge is wired correctly. Real IPC (e.g.
// update status once src/updater is implemented, native notifications)
// gets added here later, alongside matching ipcMain handlers in main.js.
//
// `versions.app` is this shell's own package version (0.2.1, etc.), not the
// remote Workspace web app's - the loaded page (pulse-platform's own
// package.json) has no way to know which desktop build it's running inside
// otherwise. Read directly from the packaged package.json rather than an
// ipcMain round trip to app.getVersion() - package.json ships inside the
// asar already (build.files in package.json), so this is a plain, static
// require, not a main-process call.

const { contextBridge } = require('electron');
const { version: appVersion } = require('../../package.json');

contextBridge.exposeInMainWorld('pulseDesktop', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    app: appVersion,
  },
});

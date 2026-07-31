// Reserved for Pulse Workspace Desktop's auto-update wiring - intentionally
// a no-op today. main.js already calls initAutoUpdater(mainWindow) once the
// main window exists, so a real implementation later is a change to this
// file alone; nothing in main.js needs to change.
//
// Left undecided on purpose: whether that implementation reaches for
// Electron's built-in autoUpdater (Squirrel.Windows, needs a signed build
// and an update server) or electron-updater (works against GitHub Releases
// or a plain static feed, more common for apps that aren't code-signed
// yet). That's a decision for when the feature is actually built.

function initAutoUpdater(mainWindow) {
  // Intentionally empty for now - see file header.
}

module.exports = { initAutoUpdater };

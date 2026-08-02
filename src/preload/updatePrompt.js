// Preload for the small "Update ready" dialog window (see
// src/updater/autoUpdater.js's createUpdatePromptWindow). Deliberately
// separate from src/preload/preload.js - that one belongs to the main
// window, which loads remote content; this one belongs to a window that
// only ever shows content this app shipped, with a narrow, purpose-built
// API to match. This is the second preload script the original foundation
// task's "prepare the architecture for future preload scripts" was
// anticipating.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulseUpdater', {
  restartNow: () => ipcRenderer.send('pulse-updater:restart-now'),
  dismiss: () => ipcRenderer.send('pulse-updater:dismiss'),
  // This window now opens as soon as a download starts (not just once it's
  // finished) - these two let the page react to the same download it's
  // showing progress for, without exposing all of ipcRenderer.
  onProgress: (callback) => ipcRenderer.on('pulse-updater:progress', (_event, percent) => callback(percent)),
  onReady: (callback) => ipcRenderer.on('pulse-updater:ready', (_event, version) => callback(version)),
});

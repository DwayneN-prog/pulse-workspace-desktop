// Pulse Workspace Desktop - automatic updates.
//
// Fully self-contained: main.js's only coupling to this file is the
// initAutoUpdater(mainWindow) call it already makes once the main window
// exists (see main.js's app.whenReady handler) - everything else,
// including this feature's own dialog window and IPC handlers, lives here,
// exactly as this file's previous no-op version documented would happen.
//
// Flow: check for updates on launch and periodically while running.
// electron-updater downloads silently in the background the moment one is
// found (autoDownload) - the user is only ever interrupted once, when it's
// actually ready to install, via the small branded dialog this file shows
// (index: src/renderer/update-prompt.html) offering "Restart Now" or
// "Later". Dismissing isn't a dead end: electron-updater applies an
// already-downloaded update automatically the next time the app quits
// normally (autoInstallOnAppQuit), so an update someone always dismisses
// still lands eventually.
//
// Requires a published release for there to be anything to find - see
// BUILDING_WINDOWS_RELEASE.md's "Automatic updates" section for how to
// publish one and how to verify this end to end.

'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.ico');
const UPDATE_PROMPT_PATH = path.join(__dirname, '..', 'renderer', 'update-prompt.html');
const UPDATE_PROMPT_PRELOAD = path.join(__dirname, '..', 'preload', 'updatePrompt.js');

// How often to check for updates while the app is already running, on top
// of the check that always happens at launch. Frequent enough that a
// release reaches everyone within a work session or two; infrequent enough
// not to be chatty against GitHub's API.
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

let updatePromptWindow = null;
let ipcHandlersRegistered = false;

// initialState drives update-prompt.html's *starting* markup via its query
// string, declaratively - not via the pulse-updater:ready IPC message
// (that's for live-updating a window that's already open and already
// finished loading, e.g. the normal update-available -> download-progress
// -> update-downloaded sequence below). Sending IPC to a window immediately
// after loadFile() races the page's own script actually running yet -
// still fire the IPC afterward for a window that already existed (it's
// been loaded this whole time), but never rely on it for a window's first
// paint.
function createUpdatePromptWindow(parentWindow, version, initialState) {
  if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
    updatePromptWindow.focus();
    return updatePromptWindow;
  }

  const win = new BrowserWindow({
    width: 380,
    height: 260,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Belongs to the main window, not a fully independent top-level
    // window - reasonable given it exists entirely because of something
    // that happened to that window's app.
    parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    // Not modal: "Later" is a genuinely fine choice (see this file's
    // header on autoInstallOnAppQuit), so the main window should stay
    // fully usable while this sits alongside it rather than blocking it.
    modal: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#060a12',
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      // Same security baseline as every other window in this app - see
      // src/main/main.js's webPreferences comment for the rationale.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: UPDATE_PROMPT_PRELOAD,
    },
  });

  win.loadFile(UPDATE_PROMPT_PATH, { query: { version: version || '', state: initialState || 'downloading' } });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (updatePromptWindow === win) updatePromptWindow = null;
  });

  updatePromptWindow = win;
  return win;
}

function registerIpcHandlersOnce() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.on('pulse-updater:restart-now', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.on('pulse-updater:dismiss', () => {
    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) updatePromptWindow.close();
  });
}

function initAutoUpdater(mainWindow) {
  // electron-updater reads app-update.yml, which electron-builder
  // generates (from package.json's build.publish) only inside a packaged
  // build. Checking during a plain `electron .` dev run would just throw
  // "cannot find app-update.yml" for no reason - there's nothing to check
  // against yet in that context.
  if (!app.isPackaged) {
    console.log('[autoUpdater] Skipping - not a packaged build.');
    return;
  }

  registerIpcHandlersOnce();

  // Downloads happen the moment an update is found, with no prompt - the
  // only interruption is the single "ready to restart" dialog once it's
  // actually installable (see the update-downloaded handler below).
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    // A background update check failing (offline, GitHub unreachable, no
    // release published yet) is routine, not something to interrupt
    // anyone's work over - logged for diagnostics only. But if a download
    // was actually in progress (the prompt window is open showing it), that
    // window is now stuck on a percentage that will never move - closing it
    // is better than leaving a frozen progress bar with no way forward.
    console.error('[autoUpdater] error:', err == null ? err : err.message);
    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) updatePromptWindow.close();
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[autoUpdater] Checking for updates...');
  });

  // Opens the prompt window immediately, in its default "downloading" state
  // (see update-prompt.html) - previously this stayed silent until the
  // download finished, so there was no visibility into a background
  // download that could take a while on a slow connection.
  autoUpdater.on('update-available', (info) => {
    console.log('[autoUpdater] Update available:', info.version);
    createUpdatePromptWindow(mainWindow, info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[autoUpdater] Already up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[autoUpdater] Downloading update... ${Math.round(progress.percent)}%`);
    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
      updatePromptWindow.webContents.send('pulse-updater:progress', progress.percent);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[autoUpdater] Update downloaded:', info.version);
    // The normal case: the window already exists and is visible, opened by
    // update-available above and running this whole time - safe to tell it
    // to flip state via IPC. The edge-case fallback (this fires without
    // that - e.g. the app started already mid-download) creates the window
    // fresh, straight into the ready state via the query string instead, so
    // there's no window whose very first paint depends on an IPC message
    // arriving before its own script has run.
    const alreadyOpen = updatePromptWindow && !updatePromptWindow.isDestroyed();
    const win = createUpdatePromptWindow(mainWindow, info.version, 'ready');
    if (alreadyOpen) win.webContents.send('pulse-updater:ready', info.version);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[autoUpdater] Initial check failed:', err.message);
  });

  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[autoUpdater] Periodic check failed:', err.message);
    });
  }, PERIODIC_CHECK_INTERVAL_MS).unref();
}

module.exports = { initAutoUpdater };

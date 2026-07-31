// Pulse Workspace Desktop - main process entry point.
//
// This file owns window creation, app lifecycle, and the security-relevant
// BrowserWindow settings. It composes two separate modules rather than
// growing to hold their logic inline:
//   - src/preload/preload.js - the renderer's only bridge to this process.
//   - src/updater/autoUpdater.js - reserved, currently a no-op (see that
//     file's header for why auto-updates aren't implemented yet).

'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, shell } = require('electron');
const { initAutoUpdater } = require('../updater/autoUpdater');

// The web app this desktop shell wraps. Hardcoded for now - no
// environment switching (staging/dev target) exists yet, and adding one
// isn't needed until there's a second environment to point at.
const WORKSPACE_URL = 'https://pulseworkspace.co.za';
const WORKSPACE_ORIGIN = new URL(WORKSPACE_URL).origin;

const WINDOW_TITLE = 'Pulse Workspace';
const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;
// Below this, the Workspace web app's own responsive layout drops its
// sidebar (see public/workspace.css's 880px breakpoint in the main
// pulse-platform repo) - floored a bit above that plus window chrome, so
// resizing down never lands the app in that half-collapsed in-between
// state.
const MIN_WINDOW_WIDTH = 1024;
const MIN_WINDOW_HEIGHT = 700;

const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.ico');

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: WINDOW_TITLE,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    // Matches the web app's own dark theme background, so there's no white
    // flash between the window frame appearing and the page finishing its
    // first paint.
    backgroundColor: '#060a12',
    // Paired with the 'ready-to-show' handler below - the window is built
    // hidden and only shown once it has something to display.
    show: false,
    // Falls back to Electron's default icon until a real .ico is added
    // here - not an error, just unbranded until then.
    icon: ICON_PATH,
    webPreferences: {
      // Security baseline for a window that loads remote, third-party-to-
      // Electron content (even though it's our own site, it's still a
      // normal web page, not trusted app code):
      //  - contextIsolation keeps preload.js's JS context separate from
      //    the loaded page's, so the page can never reach into Electron/
      //    Node internals through a shared global scope.
      //  - nodeIntegration disabled means the loaded page never gets
      //    direct Node access, regardless of what its own script does.
      //  - sandbox enabled runs the renderer under Chromium's OS-level
      //    sandbox - the same isolation a regular browser tab gets.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    },
  });

  // Removing the default menu bar (File/Edit/View/Window/Help) entirely,
  // not just hiding it on this window - this is a branded product shell,
  // not general-purpose browser chrome, and the default menu's
  // accelerators (Ctrl+R reload, Ctrl+Shift+I DevTools, etc.) aren't
  // appropriate to leave live by accident.
  Menu.setApplicationMenu(null);

  // Chromium sets the window title from the loaded page's own <title>
  // whenever it changes (e.g. "Pulse - The Modern Operations Platform" on
  // the landing page, "Dashboard - Pulse Workspace" once logged in) -
  // without this, the title bar would drift with whatever page is showing
  // instead of staying "Pulse Workspace" as a branded app shell should.
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  mainWindow.loadURL(WORKSPACE_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Any attempt to open a new window (target="_blank", window.open(), a
  // future "open in new tab" control) hands off to the OS default browser
  // instead of spawning a second, less-scrutinized Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Defense in depth: even though nothing in the app should navigate away
  // from pulseworkspace.co.za today, this stops the *window itself* from
  // ever being navigated to a different origin (e.g. a stray link), and
  // routes that link to the OS browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== WORKSPACE_ORIGIN) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Windows-specific: gives the app its own identity in the taskbar/Start
// menu/notification center, separate from Electron's default. Matches
// package.json's productName rather than its npm package name.
if (process.platform === 'win32') {
  app.setAppUserModelId('Pulse Workspace');
}

// A desktop app should have exactly one running instance - a second launch
// (e.g. double-clicking the shortcut while it's already open) should focus
// the existing window, not open a confusing second one pointed at the same
// session.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createMainWindow();
    initAutoUpdater(mainWindow);

    // macOS convention: clicking the dock icon with no windows open should
    // reopen one. Inert on Windows (the primary target) but correct to
    // include for a codebase that already runs on Electron's cross-platform
    // app lifecycle.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  // Windows/Linux convention: closing the last window quits the app.
  // macOS convention is to keep running until Cmd+Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

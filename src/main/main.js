// Pulse Workspace Desktop - main process entry point.
//
// This file owns window creation, app lifecycle, and the security-relevant
// BrowserWindow settings. It composes modules rather than growing to hold
// their logic inline:
//   - src/preload/preload.js - the renderer's only bridge to this process.
//     Unchanged by the splash/branding work below - the splash window
//     doesn't get one at all (see createSplashWindow).
//   - src/updater/autoUpdater.js - reserved, currently a no-op (see that
//     file's header for why auto-updates aren't implemented yet).
//   - src/renderer/splash/ - static local content (no preload, no remote
//     navigation), shown immediately on launch. A self-contained branding
//     component (see its own README) - this file's only coupling to it is
//     the file path below and the __pulseSplashReady() call in
//     revealMainWindow().
//   - src/renderer/connection-error.html - static local fallback shown in
//     the main window itself when loading the real app fails (see the
//     did-fail-load handler in createMainWindow) - offline, DNS failure,
//     server down, etc.

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
const SPLASH_PATH = path.join(__dirname, '..', 'renderer', 'splash', 'index.html');
const CONNECTION_ERROR_PATH = path.join(__dirname, '..', 'renderer', 'connection-error.html');
const SPLASH_WIDTH = 420;
const SPLASH_HEIGHT = 320;
// How long the main window takes to fade in once the splash hands off to
// it - long enough to read as an intentional transition, short enough not
// to feel like it's stalling. The splash's own fade-out timing is owned by
// splash.css/splash.js, not this file (see revealMainWindow).
const MAIN_FADE_IN_MS = 320;
const FADE_STEPS = 12;

let mainWindow = null;
let splashWindow = null;

function createSplashWindow() {
  const win = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Its own taskbar entry would flash in and out within a fraction of a
    // second and read as a glitch, not a second window - the main window's
    // entry is the only one that should ever appear.
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    // Same reasoning as the main window's backgroundColor below: paints
    // the correct color from frame zero, so there's nothing to flash
    // between "window exists" and "splash.html has rendered."
    backgroundColor: '#060a12',
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      // Same security baseline as the main window (see its webPreferences
      // comment) even though this content is local and static - there's
      // no reason for this window to be less isolated than the one that
      // loads remote content. No preload: splash.html is pure CSS/markup
      // with nothing to bridge to the main process.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(SPLASH_PATH);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (splashWindow === win) splashWindow = null;
  });

  return win;
}

// Animates a window's opacity from `from` to `to` over durationMs, stepped
// by hand - Electron has no CSS-level transition for a native window's own
// alpha, so this is the standard approach for a window-level (as opposed
// to in-page) fade. Returns a promise that resolves once the animation
// finishes, so callers can sequence work after it.
function animateWindowOpacity(win, from, to, durationMs) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) {
      resolve();
      return;
    }

    win.setOpacity(from);
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      if (win.isDestroyed()) {
        clearInterval(timer);
        resolve();
        return;
      }
      win.setOpacity(from + (to - from) * (step / FADE_STEPS));
      if (step >= FADE_STEPS) {
        clearInterval(timer);
        resolve();
      }
    }, durationMs / FADE_STEPS);
  });
}

// The one place "the app is ready to be seen" is decided - called once the
// main window has actually painted content (ready-to-show), and also from
// the did-fail-load fallback below so a network hiccup can't strand the
// user on the splash screen forever.
//
// Deliberately sequential, not concurrent: the splash (420x320) is much
// smaller than the main window (1400x900), both centered - fading the main
// window in at the same time the splash was fading out let the main
// window's content show through around the splash's edges before it had
// actually disappeared (visible as "the dashboard shows in the back while
// the splash is still showing"). Waiting for the splash to fully fade out
// and get destroyed *first*, only then showing the main window, means only
// one window is ever on screen at a time.
async function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const splash = splashWindow;
  if (splash && !splash.isDestroyed()) {
    try {
      // Runs in the splash page's own JS context (it has no preload, so
      // there's no contextBridge API to call instead) - safe because this
      // is local content this app shipped, not remote or untrusted. The
      // returned promise doesn't resolve until splash.js has let the
      // current light-sweep pass finish and faded its content out, so
      // there's nothing left on screen by the time this continues.
      await splash.webContents.executeJavaScript('window.__pulseSplashReady && window.__pulseSplashReady()');
    } catch {
      // The splash page didn't respond (e.g. still loading, or threw) -
      // fall through and close it anyway rather than leaving it stuck on
      // screen indefinitely.
    }
    if (!splash.isDestroyed()) splash.destroy();
  }

  if (mainWindow.isDestroyed()) return;
  mainWindow.show();
  await animateWindowOpacity(mainWindow, 0, 1, MAIN_FADE_IN_MS);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: WINDOW_TITLE,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    // Same center point as the splash window, so revealMainWindow()'s fade
    // reads as the splash dissolving into the app, not two unrelated
    // windows in different corners of the screen.
    center: true,
    // Matches the web app's own dark theme background, so there's no white
    // flash between the window frame appearing and the page finishing its
    // first paint.
    backgroundColor: '#060a12',
    // Paired with revealMainWindow() below - the window is built hidden
    // and only shown once it has something to display (or has definitively
    // failed to - see the did-fail-load handler).
    show: false,
    // Starts fully transparent so revealMainWindow()'s fade-in has
    // something to animate from - belt-and-braces alongside `show: false`,
    // not strictly load-bearing on its own. Windows/macOS only; ignored on
    // Linux, where this app isn't targeted anyway.
    opacity: 0,
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

  mainWindow.once('ready-to-show', revealMainWindow);

  // A failed load (offline, DNS hiccup, server down) still counts as
  // "ready to be seen" - stalling on the splash screen forever would be
  // worse. Electron does *not* show Chromium's own network-error
  // interstitial automatically the way a full browser tab would (that
  // surfaced as a plain blank window, with no message and no way to
  // recover short of restarting the app) - so this loads a local fallback
  // page with an explanation and a Retry button instead.
  mainWindow.webContents.on('did-fail-load', async (event, errorCode) => {
    // -3 is Chromium's ERR_ABORTED, fired for routine cases like a
    // redirect interrupting an in-progress load - not a real failure, and
    // not something that should end the splash screen early.
    if (errorCode === -3) return;

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.loadFile(CONNECTION_ERROR_PATH, { query: { code: String(errorCode) } });
      } catch {
        // Loading the *local* fallback page failed too (shouldn't happen -
        // it ships with the app) - fall through and reveal whatever state
        // the window is in rather than leaving it hidden.
      }
    }
    revealMainWindow();
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
    // Splash first, main window second: the splash is on screen at the
    // earliest possible moment, and createMainWindow()'s loadURL only
    // starts once the splash is already visible - there's no gap where
    // neither window exists yet.
    splashWindow = createSplashWindow();
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

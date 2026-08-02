// Pulse splash screen - behavior only. Styling lives in splash.css;
// markup lives in index.html. No Node/Electron APIs are used here on
// purpose: this window has no preload script (see main.js's
// createSplashWindow), so this file only ever touches the DOM and the
// standard browser animation APIs.

(function () {
  "use strict";

  var MESSAGES = [
    "Initializing...",
    "Connecting securely...",
    "Loading Workspace...",
    "Preparing your session...",
  ];
  var MESSAGE_INTERVAL_MS = 2200;
  var MESSAGE_FADE_MS = 260;

  // How long body.is-leaving's opacity transition takes (splash.css) - kept
  // in sync here so __pulseSplashReady's returned promise resolves only
  // once the fade has actually finished, not the instant it started.
  var LEAVE_FADE_MS = 450;

  // Upper bound on how long __pulseSplashReady will wait for the pulse
  // block's current pass to reach a loop boundary before giving up and
  // leaving anyway - the loader's own animation-duration is 1.6s
  // (splash.css's --loader-duration), so this leaves comfortable headroom
  // for a healthy animation to finish its current leg under this ceiling.
  var MAX_WAIT_FOR_CYCLE_MS = 1800;

  function startMessageRotation() {
    var el = document.getElementById("pulse-loader-message");
    if (!el) return;

    var index = 0;
    el.textContent = MESSAGES[0];

    setInterval(function () {
      el.classList.add("pulse-loader__message--swapping");
      setTimeout(function () {
        index = (index + 1) % MESSAGES.length;
        el.textContent = MESSAGES[index];
        el.classList.remove("pulse-loader__message--swapping");
      }, MESSAGE_FADE_MS);
    }, MESSAGE_INTERVAL_MS);
  }

  // The only hook the main process calls (via
  // webContents.executeJavaScript - see main.js's revealMainWindow). Local,
  // fully-trusted content talking to the process that created it, so a
  // direct function call is enough; no contextBridge/IPC round trip needed.
  //
  // Resolves once the splash is fully invisible, so the caller knows it's
  // safe to destroy this window without a visible cut.
  window.__pulseSplashReady = function () {
    return new Promise(function (resolve) {
      if (window.__pulseLeaving) {
        resolve();
        return;
      }
      window.__pulseLeaving = true;

      function leave() {
        document.body.classList.add("is-leaving");
        setTimeout(resolve, LEAVE_FADE_MS);
      }

      var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // The sliding block is the one continuously-running animation in the
      // loader (the four flip/squidge blocks share the same duration and
      // stay in phase with it) - waiting on this one element's iteration
      // boundary is enough to know the whole group has reached a clean
      // stopping point.
      var pulseBlock = document.querySelector(".pulse-loader__block:first-child");

      if (reducedMotion || !pulseBlock) {
        leave();
        return;
      }

      // Let the in-flight motion complete its current leg rather than
      // cutting it off mid-travel - finishing the motion reads as
      // intentional; freezing it mid-frame reads as a glitch.
      function onIteration() {
        pulseBlock.removeEventListener("animationiteration", onIteration);
        leave();
      }
      pulseBlock.addEventListener("animationiteration", onIteration);

      // Safety net: an animationiteration event that never fires (e.g. the
      // animation was somehow already stopped) must not hang the app on
      // the splash screen forever.
      setTimeout(function () {
        pulseBlock.removeEventListener("animationiteration", onIteration);
        leave();
      }, MAX_WAIT_FOR_CYCLE_MS);
    });
  };

  startMessageRotation();
})();

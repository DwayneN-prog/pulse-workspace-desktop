# Pulse splash screen

Self-contained branding component: `index.html` (markup), `splash.css`
(visuals), `splash.js` (message rotation + the readiness hook). No
dependency on anything else in this app beyond the logo asset path in
`index.html` - meant to be copyable into another Pulse product as this one
folder.

## Host app contract

The host's main process is responsible for:

1. Creating a frameless `BrowserWindow` and loading `index.html` into it -
   no preload script is required (see `main.js`'s `createSplashWindow`).
2. Once the real app window is ready to be shown, calling
   `window.__pulseSplashReady()` in the splash window's own JS context
   (e.g. via `webContents.executeJavaScript(...)` - safe here specifically
   *because* this is local, self-authored content, not remote or
   untrusted).
3. Awaiting the promise `__pulseSplashReady()` returns, then destroying the
   splash window. The promise doesn't resolve until the current ECG sweep
   has finished its pass and the fade-out transition has completed, so
   there's nothing left to see by the time it resolves.

## Customizing for another product

- Swap `assets/logo/pulse-logo.png` (referenced in both `index.html`'s
  `<img>` and `splash.css`'s `.ecg-fx` mask-image - both must point at the
  same file) for the target product's own logo. The light-sweep is masked
  against that same image, so it automatically follows any new mark's exact
  shape - but `.ecg-fx`'s `width`/`mask-size`, and `.ecg-fx__spike-glow`'s
  position, are measured pixel offsets from *this* logo (icon on the left
  ~42.5% of the image, wordmark on the right) and need re-measuring for a
  mark with different proportions.
- Edit the `MESSAGES` array in `splash.js` for different loading copy.
- Colors are CSS custom properties at the top of `splash.css`
  (`--bg`, `--text`, `--text-soft`, `--glow`).

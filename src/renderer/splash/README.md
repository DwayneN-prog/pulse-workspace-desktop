# Pulse splash screen

Self-contained branding component: `index.html` (markup), `splash.css`
(visuals), `splash.js` (message rotation + the readiness hook). No
dependency on anything else in this app beyond the logo asset path in
`index.html` - meant to be copyable into another Pulse product as this one
folder.

Uses Pulse Platform's own block-loader design (`.pulse-loader__*` - see
`pulse-platform/public/loading.css` for the canonical, fully-commented
version, reused across every Pulse surface: this splash, the workspace and
technician web apps' own `/loading` pages, and any future loading overlay).
Duplicated here rather than referenced, since this window loads local files
only - no network, no shared build with the pulse-platform repo - but kept
structurally identical (same class names, same custom properties) so the
two are easy to compare and keep in sync by hand.

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
   splash window. The promise doesn't resolve until the pulse block's
   current pass has reached a loop boundary and the fade-out transition has
   completed, so there's nothing left to see by the time it resolves.

## Customizing for another product

- Swap `assets/logo/pulse-logo.png` (referenced in `index.html`'s `<img>`)
  for the target product's own logo - it's rendered statically, with no
  masking or measurement dependency on its exact proportions, so any logo
  drops in cleanly.
- Edit the `MESSAGES` array in `splash.js` for different loading copy.
- Edit `.product-name`'s text in `index.html` for a different app name
  (e.g. "Pulse Technician") if this component is ever reused for another
  Pulse Electron shell.
- The one brand color is `--brand-accent` at the top of `splash.css` -
  every other color in the loader (the four trailing blocks' neutral, the
  glow) derives from it via `color-mix()`. This splash has no company
  session to read a per-company color from, so it's fixed to Pulse's own
  default (matches `lib/platformBranding.js`'s `PLATFORM_BRANDING.accentColor`
  in the main pulse-platform repo) - a logged-in web surface instead reads
  this same variable per-company.

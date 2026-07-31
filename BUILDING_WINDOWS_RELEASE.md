# Building a Windows release

How to produce a distributable installer for Pulse Workspace Desktop, and
where the pieces that make that possible live.

## Building a release

```
npm run dist
```

That's the whole command. It runs `electron-builder` against the `build`
block in `package.json`, which already has everything configured:
application identity, icon, and the NSIS installer's behavior (shortcuts,
install-directory choice, uninstaller, registry entries). Nothing else
needs to be passed on the command line.

`npm run pack` does the same packaging step but skips building the NSIS
installer itself (`--dir` - just produces `dist/win-unpacked/`) - faster,
useful when you only need to sanity-check the packaged app itself rather
than produce a real installer.

## Where installers are generated

Everything lands in `dist/` (via `build.directories.output` in
`package.json`):

- **`dist/PulseWorkspaceSetup.exe`** - the installer to distribute. Name is
  fixed (`build.nsis.artifactName`), not versioned in the filename - if
  you want versioned filenames for keeping multiple releases side by side,
  change `artifactName` to include `${version}`, e.g.
  `"PulseWorkspaceSetup-${version}.exe"`.
- `dist/PulseWorkspaceSetup.exe.blockmap` - used by `electron-updater` for
  differential update downloads once auto-updates are actually wired in
  (see below) - not needed for a plain manual install.
- `dist/win-unpacked/` - the unpacked app, same thing the installer
  installs, useful for quickly testing a build without installing it.
- `dist/latest.yml` - an `electron-updater` release-feed manifest,
  auto-generated because `build.publish` is configured (see below). Only
  matters once you're actually publishing releases somewhere
  `electron-updater` reads from.

`dist/` is gitignored - it's build output, not something to commit.

## Updating the version number

Bump `"version"` in `package.json` (semver: `MAJOR.MINOR.PATCH`) and run
`npm run dist` again. That one field is the single source of truth for:

- The installer's `FileVersion`/`ProductVersion` (Windows file
  properties).
- What shows next to the app name in Add/Remove Programs
  (`build.nsis.uninstallDisplayName` is `${productName} ${version}`).
- The version `electron-updater` will eventually compare against to decide
  whether an update is available.

Nothing else needs to change to bump a version - no other file hardcodes
it.

## Application icons

- **`assets/icons/icon.ico`** - the one icon file, referenced from three
  places that all need to agree if it's ever replaced:
  - `src/main/main.js` (`ICON_PATH`) - the running app's window/taskbar
    icon.
  - `package.json`'s `build.win.icon` - the packaged `.exe`'s icon.
  - `package.json`'s `build.nsis.installerIcon` /
    `build.nsis.uninstallerIcon` - the installer and uninstaller's own
    icons.
- `assets/logo/pulse-logo.png` and `assets/images/pulse-icon.png` are
  splash-screen and reference artwork respectively - not used by the
  installer.

## Code signing (not yet enabled)

The installer today is **unsigned** - Windows will show a
"Publisher: Unknown" / SmartScreen warning on install. Nothing needs to be
restructured to fix that later; electron-builder already runs its
Windows signing step on every build (visible in the `dist` output as
`signing with signtool.exe`) and simply no-ops when no certificate is
configured, which is the case now.

To turn signing on once a real certificate exists, either:

- Set the `CSC_LINK` (path or URL to the `.pfx`) and `CSC_KEY_PASSWORD`
  environment variables before running `npm run dist` - electron-builder
  picks these up automatically, no config changes needed, or
- Add `certificateFile` / `certificatePassword` under `build.win` in
  `package.json` directly.

Either way, this is a config/environment change only - not a code change.

## Automatic updates (not yet implemented)

`build.publish` in `package.json` already points at this project's GitHub
repo (`DwayneN-prog/pulse-workspace-desktop`), which is why `dist/latest.yml`
gets generated on every build - the release-feed manifest
`electron-updater` reads is already being produced, even though nothing
consumes it yet.

`src/updater/autoUpdater.js` is the reserved integration point - it
currently exports a no-op `initAutoUpdater(mainWindow)` that
`src/main/main.js` already calls once the main window exists. Wiring in
real updates later is:

1. `npm install electron-updater`.
2. Inside `initAutoUpdater`, call `autoUpdater.checkForUpdatesAndNotify()`
   (or the more granular `checkForUpdates()` + your own UI) from
   `electron-updater`.
3. Publish releases (`electron-builder --publish=always`, or upload
   `dist/PulseWorkspaceSetup.exe` + `dist/latest.yml` to a GitHub Release
   manually) so there's something for `electron-updater` to find.

No change to `main.js`'s call site, no change to the packaging config -
both are already in place.

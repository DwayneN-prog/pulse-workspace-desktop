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
  differential update downloads (see "Automatic updates" below) - not
  needed for a plain manual install.
- `dist/win-unpacked/` - the unpacked app, same thing the installer
  installs, useful for quickly testing a build (including a real
  auto-update check - see below) without installing it.
- `dist/latest.yml` - the `electron-updater` release-feed manifest,
  auto-generated because `build.publish` is configured. Needs to be
  uploaded alongside the installer to an actual GitHub Release for
  `electron-updater` to find - see "Automatic updates" below.

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

## Automatic updates

Implemented in `src/updater/autoUpdater.js` (still the same
`initAutoUpdater(mainWindow)` entry point `src/main/main.js` already
called when this was a no-op - nothing in `main.js` changed to enable
this).

**Flow:** on launch, and every 4 hours while running
(`PERIODIC_CHECK_INTERVAL_MS`), the app checks
`DwayneN-prog/pulse-workspace-desktop`'s GitHub Releases for a newer
version (via `build.publish` in `package.json` - the same config that's
been generating `dist/latest.yml` on every build). If one's found, it
downloads silently in the background. Once fully downloaded, a small
branded dialog (`src/renderer/update-prompt.html`) appears: **Restart
Now** installs it immediately (`autoUpdater.quitAndInstall()`); **Later**
dismisses it, and the update still installs automatically the next time
the app quits normally (`autoInstallOnAppQuit`) - dismissing is never a
dead end. Background check failures (offline, no release published yet)
are logged only, never shown to the user.

Skips entirely in dev mode (`electron .` / `npm start`) - `app-update.yml`
(what `electron-updater` reads to know where to check) only exists inside
a packaged build, generated by `electron-builder` from `build.publish`.
Checking without it would just throw.

**Publishing a release** is what makes there be anything to find:

```
npm run dist -- --publish=always
```

(requires a `GH_TOKEN` env var with `repo` scope - electron-builder
uploads directly to a new GitHub Release). Alternatively, run a plain
`npm run dist` and manually attach `dist/PulseWorkspaceSetup.exe`,
`dist/PulseWorkspaceSetup.exe.blockmap`, and `dist/latest.yml` to a GitHub
Release yourself - `electron-updater` just needs all three present on
*some* published release for the version in that release's tag to be
found.

**Verifying the check itself works** without needing a real newer release
to exist: run the packaged app directly - not `npm start` - and watch its
console output (see "Where installers are generated" above for
`win-unpacked/`). A `[autoUpdater] Checking for updates...` line followed
by either "Already up to date" or a real HTTP error confirms the feed
config and network path are correct, independent of whether a newer
version has actually been published yet.

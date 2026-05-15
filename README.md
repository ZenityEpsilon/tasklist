# Tasklist for OBS

Tasklist is a local stream overlay tool for managing orders, requests, or tasks during a broadcast. You control the list from the admin panel, while OBS shows a clean overlay page that stays synchronized automatically.

## Features

- Multiple games or task categories in one workspace.
- Separate game selection for editing and for the live OBS overlay.
- Drag and drop tasks within a game or between games.
- Quantity counters, completion state, and quick unit icons.
- Per-game display settings, including icon visibility.
- Color profiles for OBS, individual games, and the admin panel.
- Electron-based admin app that can run without a console window or sync server.
- OBS synchronization server starts only when you press Play.
- Local state persistence in the user's application data folder.

## Quick Start

1. Download and unpack the latest `tasklist-*.zip` release.
2. Run `Tasklist.exe`.

The admin panel opens as a desktop app without a console window. It does not start the OBS synchronization server until you press Play in the bottom navigation.

Use this URL for the OBS browser source:

```text
http://localhost:8080/obs
```

After pressing Play, the selected game becomes live and the local sync server starts for OBS.

For source builds, install Node.js 18 or newer and run `start.cmd` from the built application folder. If Electron is not available, `start.cmd` falls back to the browser admin page:

```text
http://localhost:8080/
```

Tasklist saves your games, tasks, and color profiles automatically on this computer. Manual import/export is not needed for normal use.

For source builds, you can also start the Electron admin app with:

```cmd
npm run electron
```

## OBS Setup

1. Add a `Browser` source in OBS.
2. Paste `http://localhost:8080/obs`.
3. Set the source size you need for your scene.
4. Press Play in the admin app to start synchronization.

Changes made in the admin panel are sent to OBS automatically.

## Color Profiles

Open the program settings to create and edit palettes. New profiles start from the original standard palette.

Profiles can be used as:

- the default OBS profile;
- a pinned profile for a specific game;
- the admin panel profile.

If a game has no pinned profile, OBS uses the default OBS profile.

## Changing the Port

The default port is `8080`. To use another port:

```cmd
set PORT=8081
start.cmd
```

The URLs then become:

```text
http://localhost:8081/
http://localhost:8081/obs
```

## Updates

When `start.cmd` runs, the app checks for updates and installs the latest available version automatically. No extra setup is required for normal use.

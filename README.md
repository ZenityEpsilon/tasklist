# Tasklist for OBS

Tasklist is a local stream overlay tool for managing orders, requests, or tasks during a broadcast. You control the list from the admin panel, while OBS shows a clean overlay page that stays synchronized automatically.

## Features

- Multiple games or task categories in one workspace.
- Separate game selection for editing and for the live OBS overlay.
- Drag and drop tasks within a game or between games.
- Quantity counters, completion state, and quick unit icons.
- Per-game display settings, including icon visibility.
- Color profiles for OBS, individual games, and the admin panel.
- Automatic synchronization between the admin panel and OBS through a local server.
- Local state persistence with JSON import and export.

## Quick Start

1. Install Node.js 18 or newer.
2. Open the application folder.
3. Run `start.cmd`.

The admin panel opens at:

```text
http://localhost:8080/
```

Use this URL for the OBS browser source:

```text
http://localhost:8080/obs
```

Keep the `start.cmd` window open while using the app.

## OBS Setup

1. Add a `Browser` source in OBS.
2. Paste `http://localhost:8080/obs`.
3. Set the source size you need for your scene.
4. Manage tasks from the admin panel.

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

# Tasklist

Tasklist is a local order list for stream/OBS workflows. The admin page edits the list, and the `/obs` page shows the overlay view. A small Node.js server keeps browser windows synchronized through HTTP and server-sent events.

## Requirements

- Windows
- Node.js 18 or newer
- PowerShell

## Development

Install dependencies:

```powershell
npm install
```

Run the Vite dev server:

```powershell
npm run dev
```

Build the distributable files:

```powershell
npm run build
```

Run the built app:

```powershell
npm run serve
```

## Distribution

The ready-to-run app is built into `dist/`. Users should run:

```cmd
start.cmd
```

By default the app starts on port `8080`:

- Admin: `http://localhost:8080/`
- OBS overlay: `http://localhost:8080/obs`

To use another port:

```cmd
set PORT=8081
start.cmd
```

## Private Release Updates

`start.cmd` runs `update.ps1` before starting the server. The updater checks the latest GitHub Release, compares it with local `VERSION`, downloads the matching zip asset, and replaces the app files.

Create `update-config.local.json` next to `start.cmd`:

```json
{
  "repo": "ZenityEpsilon/tasklist",
  "assetPattern": "tasklist-*.zip"
}
```

The `repo` value can also be written as `git@github.com:ZenityEpsilon/tasklist.git` or `https://github.com/ZenityEpsilon/tasklist`.

For a private repository, provide a token with access to the repository and releases. Either create `update-token.txt` next to `start.cmd`, or set an environment variable:

```powershell
$env:TASKLIST_GITHUB_TOKEN = "github_pat_..."
```

The old `NBK_GITHUB_TOKEN` and `NBK_GITHUB_REPO` names are still accepted for compatibility.

## Release Checklist

1. Update `public/VERSION` to the release version, for example `1.0`.
2. Run `npm run build`.
3. Create a zip from the contents of `dist`, not from the `dist` folder itself:

```powershell
Compress-Archive -Path dist\* -DestinationPath tasklist-1.0.zip -Force
```

4. Commit the source changes:

```powershell
git add .
git commit -m "Release 1.0"
```

5. Create and push the tag:

```powershell
git tag -a 1.0 -m "Release 1.0"
git push origin main
git push origin 1.0
```

6. Create a GitHub Release for tag `1.0`.
7. Upload `tasklist-1.0.zip` as a release asset.
8. Verify the release is marked as the latest release.

The updater uses GitHub's latest release endpoint, so a pushed git tag alone is not enough. There must be a GitHub Release with a zip asset.

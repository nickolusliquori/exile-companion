# Security

## What the app can access

- **Reads** your Path of Exile `Client.txt` log and the clipboard (to price-check items you copy with Ctrl+C). It never sends key presses or clicks to the game and never reads game memory.
- **Writes** only: its own settings and data folder, and loot filters named `ExileCompanion….filter` in your Path of Exile documents folder.
- **Network**: the price checker and account features only talk to `pathofexile.com`, `poe.ninja`, `poewiki.net`, `pobb.in` and `pastebin.com`. Updates come from this repository's GitHub Releases.
- **Local servers** (the GGG sign-in callback and the optional OBS stream page) listen on `127.0.0.1` only, so nothing on your network can reach them.

## How it's protected

- Every window runs with context isolation, the sandbox on and Node.js off. Pages can only use a small, fixed set of actions, and the main process ignores requests from anything other than the app's own pages.
- Each page has a strict Content-Security-Policy, so text from other players (trade whispers), the wiki, trade listings or build guides can't load scripts or send your data anywhere.
- New windows, navigation away from the app, embedded web views and device permissions (camera, microphone, location…) are all blocked. External links open in your browser and must be `https`.
- Your POESESSID and GGG sign-in tokens are encrypted with Windows' own data protection and are never included in backups or sync codes.
- Releases are built only by GitHub Actions from a version tag, with workflow actions pinned to exact commits and a committed lock file. Dependabot watches for vulnerable packages. The updater verifies each download against the SHA-512 checksum published with the release.

## Known limits

- The app isn't code-signed, so Windows can't verify the publisher and shows a SmartScreen warning.
- Auto-updates trust this GitHub repository. Keep two-factor authentication on the account that owns it.

## Reporting a problem

Please report security issues privately via GitHub's **Security → Report a vulnerability** on this repository rather than in a public issue.

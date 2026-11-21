# Security

Exile Companion handles two sensitive things: your Path of Exile session (POESESSID, or GGG sign-in tokens) and your PC. This page explains what the app can touch and how it's protected.

## What the app can access

- **Reads** your Path of Exile `Client.txt` log and the clipboard, to follow your play and price-check items you copy with Ctrl+C. It never sends key presses or clicks to the game and never reads game memory.
- **Writes** only its own settings and data folder, loot filters named `ExileCompanion….filter` in your Path of Exile documents folder, cheat-sheet images you add, and files you choose to save (backups, problem reports).
- **Network:** price checks and account features only talk to `pathofexile.com`, `poe.ninja`, `poewiki.net`, `pobb.in` and `pastebin.com`. Item pictures load from `web.poecdn.com`. Updates come from this repository's GitHub Releases. The crafting data ships with the app; the Craft lab makes no requests of its own.
- **Local servers** (the GGG sign-in callback and the optional OBS stream page) listen on `127.0.0.1` only, so nothing on your network can reach them.

## How it's protected

- **Isolated windows:** every window runs with context isolation, the sandbox on and Node.js off. Pages can only use a small, fixed set of actions, and the main process ignores requests from anything other than the app's own pages.
- **Content-Security-Policy on every page,** so text from other players (trade whispers), the wiki, trade listings or build guides can't load scripts or send your data anywhere. The automated checks fail a build if any page is missing it.
- **No escape routes:** new windows, navigation away from the app, embedded web views and device permissions (camera, microphone, location) are blocked. External links open in your browser and must be `https`.
- **Encrypted secrets:** your POESESSID and GGG sign-in tokens are encrypted with Windows' data protection (Electron `safeStorage`) and are never included in backups, sync codes or problem reports.
- **Private problem reports:** reports are built on your PC and shown to you in full before anything leaves it. User names, home folders, e-mail addresses, session IDs and tokens are removed, and an automated check tests that redaction on every build.
- **Trustworthy releases:** releases are built only by GitHub Actions when the version in `package.json` changes on `main`. Workflow actions are pinned to exact commits, dependencies come from a committed lock file, and Dependabot watches for vulnerable packages. The updater checks every download against the SHA-512 checksum published with the release.

## Known limits

- The app isn't code-signed, so Windows can't verify the publisher and shows a SmartScreen warning on install.
- Auto-updates trust this GitHub repository. The account that owns it should keep two-factor authentication on.
- The planned in-app browser (roadmap 1.9) will show external websites inside the app. It will run in its own sandboxed session with no access to the app's actions, your saved secrets or your files.

## Reporting a vulnerability

Please report security issues privately with GitHub's **Security → Report a vulnerability** on this repository, not in a public issue. Include the app version (Settings → Updates) and steps to reproduce.

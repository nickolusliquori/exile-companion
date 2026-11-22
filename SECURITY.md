# Security

Exile Companion handles two sensitive things: your Path of Exile session (POESESSID, or GGG sign-in tokens) and your PC. This page explains what the app can touch and how it's protected.

## What the app can access

- **Reads** your Path of Exile `Client.txt` log to follow your play, and the clipboard **once each time you press the price hotkey** (Ctrl+D after copying an item with Ctrl+C), as GGG's developer guidelines require. It never watches the clipboard in the background or reads the screen. It never sends key presses or clicks to the game and never reads game memory.
- **Writes** only its own settings and data folder, loot filters named `ExileCompanion….filter` in your Path of Exile documents folder, cheat-sheet images you add, and files you choose to save (backups, problem reports).
- **Network:** price checks and account features only talk to `pathofexile.com`, `poe.ninja`, `poewiki.net`, `pobb.in` and `pastebin.com`. Item pictures load from `web.poecdn.com`. Updates come from this repository's GitHub Releases. The crafting data ships with the app; the Craft lab makes no requests of its own.
- **Local servers:** the GGG sign-in callback and the optional OBS stream page listen on `127.0.0.1` only, so nothing on your network can reach them.
- **Phone screen (optional, off by default)** is the one server that listens on your home network, so your phone can reach it. It is read-only (GET only, no way to send anything to the app or the game), answers private network addresses only (10.x, 172.16–31.x, 192.168.x), and every request must carry a random 18-byte key from the link or QR code (compared in constant time). "New link" replaces the key, and the key is never included in problem reports.

## How it's protected

- **Isolated windows:** every window runs with context isolation, the sandbox on and Node.js off. Pages can only use a small, fixed set of actions, and the main process ignores requests from anything other than the app's own pages.
- **Content-Security-Policy on every page,** so text from other players (trade whispers), the wiki, trade listings or build guides can't load scripts or send your data anywhere. The automated checks fail a build if any page is missing it.
- **No escape routes:** the app's own windows can't open new windows, navigate away or embed web views, and device permissions (camera, microphone, location) are blocked. Links must be `https`.
- **In-app browser in a sandbox:** web pages run in a separate session (`persist:web`) with no preload script, so they can't reach the app's actions, your saved secrets or your files. Only an allowlist of Path of Exile sites loads inside the app (tested on every build); any other link asks first and opens in your own browser. Downloads and pop-ups are blocked, and the only permission granted is clipboard writing for those sites (the trade site's whisper button). Its cookies stay in that session; Settings → Clear browser data removes them. The browser pinned over the game (Ctrl+Shift+B) is the same sandboxed view in an always-on-top window: it only shows and hides, and never sends anything to the game.
- **Recent price checks stay in memory:** the last 20 items you copied are held by the running app only, never written to disk, synced or put in problem reports, and are gone when it closes.
- **Media mini player in its own sandbox:** the YouTube/Twitch player uses a separate session (`persist:media`) with no preload script, limited to YouTube, YouTube Music, Twitch, Kick and SoundCloud (plus Google's sign-in pages). No permissions are granted and downloads are blocked. Its controls run inside that page, never in the game.
- **Now playing uses Windows' own media controls:** one Windows PowerShell process (started with a fixed, built-in script) reads what's playing and can play, pause or skip. It accepts only those three commands, and you can turn it off on the Media page.
- **League data from this repo is data only:** the app may fetch `data/*.json` from this repository on raw.githubusercontent.com (no other path on that host). Every field is type- and length-checked, older or malformed files are ignored, and nothing from it is ever run as code.
- **Encrypted secrets:** your POESESSID and GGG sign-in tokens are encrypted with Windows' data protection (Electron `safeStorage`) and are never included in backups, sync codes or problem reports.
- **Local log, redacted as it's written:** `logs/app.log` records errors from the app's own pages (not websites in the in-app browser), crashes and startup times. Home folders, user names, session IDs, tokens and e-mail addresses are removed before anything reaches the file. It's capped at two 512 KB files and never sent anywhere; it only leaves your PC inside a problem report you save yourself.
- **Private problem reports:** reports are built on your PC and shown to you in full before anything leaves it. User names, home folders, e-mail addresses, session IDs and tokens are removed, and an automated check tests that redaction on every build.
- **Trustworthy releases:** releases are built only by GitHub Actions when the version in `package.json` changes on `main`. Workflow actions are pinned to exact commits, dependencies come from a committed lock file, and Dependabot watches for vulnerable packages. The updater checks every download against the SHA-512 checksum published with the release.

## Known limits

- The app isn't code-signed, so Windows can't verify the publisher and shows a SmartScreen warning on install.
- Auto-updates trust this GitHub repository. The account that owns it should keep two-factor authentication on.
- Pages in the in-app browser are only as trustworthy as the sites themselves; the sandbox keeps them away from the app and your files, but anything you type into a site goes to that site.

## Reporting a vulnerability

Please report security issues privately with GitHub's **Security → Report a vulnerability** on this repository, not in a public issue. Include the app version (Settings → Updates) and steps to reproduce.

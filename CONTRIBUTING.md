# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

The quickest way is **Settings → Report a problem** in the app: it fills in the version, your system and recent errors (with account secrets and your user name removed) and can open a GitHub issue for you. You can also open an issue by hand with the **Problem report** template.

Security problems: please report them privately, as described in [SECURITY.md](SECURITY.md).

## Suggesting a feature

Open an issue describing what you want to do in the game and what gets in the way. Check the [roadmap](README.md#roadmap) first; it may already be planned.

## Ground rules for changes

- **Read-only toward the game, following [GGG's developer guidelines](https://www.pathofexile.com/developer/docs).** The app may read the game's log file, and the clipboard only once per manual key press (never on a timer). It must never send key presses or clicks to the game, read game memory, touch game files, or automate actions. Follow GGG's rate-limit headers, never commit credentials, and keep GGG's disclaimer visible. Every price check starts from the player's own Ctrl+C.
- **No secrets in the repository.** Never commit tokens, POESESSIDs or keys. Secrets are encrypted at runtime with Electron's `safeStorage`.
- **Keep the security settings.** Every window runs with context isolation, the sandbox on and Node.js off; every page has a Content-Security-Policy; new network hosts must be added to the allowlist in `main.js` deliberately.
- **Plain language in the interface.** Short sentences, the game's own terms, and a fix-it button when something is missing.

## Working on the code

```
npm install
npm start          # run from source
npm run check      # automated checks; run before every commit
```

`npm run check` must pass. Add a check in `scripts/check.js` for anything that can break silently (parsers, odds, clipboard handling, redaction).

The project layout is described in the README under [For developers](README.md#for-developers).

## Releasing

1. Add a section for the new version at the top of [CHANGELOG.md](CHANGELOG.md), headed `## [x.y.z] - YYYY-MM-DD`.
2. Bump `version` in `package.json` (and the two version fields in `package-lock.json`).
3. Push to `main`. GitHub Actions runs the checks, builds the installer and publishes the release, using the changelog section as its notes.

New features ship as regular releases and are tested in game afterwards; problems found are fixed in a patch release (for example `1.8.1`). If a private test build is ever needed, a version such as `1.8.0-beta.1` is published as a pre-release that auto-update ignores.

Commits to `main` are what users receive, so keep `main` releasable.

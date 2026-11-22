# Game and league data

Two JSON files here let installed copies of the app pick up patch and league changes between releases. Both are **data only**: the app checks every field's type and length, ignores anything malformed or older than its built-in copy, shows text escaped, and never runs anything from here. Change `v` (a date, `YYYY-MM-DD`) whenever you edit a file; `npm run check` validates both.

## game.json

Read at startup (at most every 6 hours, and from Settings → Game data → Check for data updates).

- `patch` and `name`: the current patch (e.g. `3.31`) and league name, shown in the title and used by the Game data panel to flag data built for an older patch.
- `notices`: short announcements shown once on Home (`id`, `title`, `body`, optional `level`: `info` or `warn`).
- `strats`: atlas farming strategies (replaces the built-in list).
- `progressTips`: atlas progression tip text by step id.
- `mapmods`: map-mod `label`, in-game search `frag` and `why` text by id (the build rules stay in the app).

Regenerate it from the app's built-in tables with `node scripts/export-game.js YYYY-MM-DD`.

## league.json

`league.json` is read by installed copies of the app (League page) so league details can be corrected between releases, for example when a patch changes Betrayal rewards or Threads.

- The app fetches it at most every 6 hours from `raw.githubusercontent.com/nickolusliquori/exile-companion/main/data/`. That is the only path on that host the app may request.
- It is **data only**: the app checks every field's type and length, ignores anything malformed or older than its built-in copy, and shows the text escaped. No code is ever loaded from here.
- Fields: `threads` (Thread types), `intervention` (Intervention reward text), `syn` (each Syndicate member's Transportation / Fortification / Research rewards, `c` marks divisions that changed this league), `presets` (Betrayal starter plans), `artifacts` and `artifactVendor` (Expedition currencies and where to spend them).

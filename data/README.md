# League data

`league.json` is read by installed copies of the app (League page) so league details can be corrected between releases, for example when a patch changes Betrayal rewards or Threads.

- The app fetches it at most every 6 hours from `raw.githubusercontent.com/nickolusliquori/exile-companion/main/data/`. That is the only path on that host the app may request.
- It is **data only**: the app checks every field's type and length, ignores anything malformed or older than its built-in copy, and shows the text escaped. No code is ever loaded from here.
- Change `v` (a date, `YYYY-MM-DD`) whenever you edit the file. `npm run check` validates it.
- Fields: `threads` (Thread types), `intervention` (Intervention reward text), `syn` (each Syndicate member's Transportation / Fortification / Research rewards, `c` marks divisions that changed this league), `presets` (Betrayal starter plans), `artifacts` and `artifactVendor` (Expedition currencies and where to spend them).

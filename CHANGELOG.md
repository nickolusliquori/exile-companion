# Changelog

What changed in each release, newest first. Installed copies update themselves; see the [Releases page](https://github.com/nickolusliquori/exile-companion/releases) for the installers. Planned releases are on the [roadmap](README.md#roadmap).

## [1.12.0] - 2026-11-21

### Added
- **Build tools page** (Character → Build tools):
  - **Timeless jewels:** pick Lethal Pride, Brutal Restraint, Militant Faith, Elegant Hubris or Heroic Tragedy, a seed, a conqueror and a jewel socket. You see what every notable and keystone in its radius becomes, and what the small passives get. Timeless jewels in your goal build fill in with one click. **Find seeds** ranks all seeds by how many notables (or only the ones in your goal tree) get the results you tick. **Search this seed on trade** opens the trade search. Uses Path of Building's lookup tables, loaded only when you open the tool (8 MB). Glorious Vanity isn't included yet.
  - **Cluster jewels:** every enchant for small, medium and large cluster jewels, the notables each one can roll, how likely each notable is and the item level it needs. Enchants that fit your goal build's skill are suggested, and notables that match its damage type are highlighted.
  - **Gem levelling profit:** gems worth buying low and selling levelled, or levelled with 20% quality, from uncorrupted poe.ninja prices including the Gemcutter's Prism cost. Filter by skill, support or awakened gems, and set a minimum number of listings.
  - **Meta check:** opens poe.ninja's builds for your goal build's main skill, next to a summary of your build's main links, uniques and keystones to compare. poe.ninja doesn't allow apps to read its build data, so the comparison happens on their page.
- Search (Ctrl+K) entries for the timeless jewel lookup, cluster jewel notables and gem levelling profit.

### Changed
- Imported Path of Building builds now remember which tree socket each jewel sits in.

## [1.11.0] - 2026-11-21

### Added
- **League page** (Play → League), built for 3.30's Threads:
  - **Threads per map:** set what goes in the map device and see the cost per map from poe.ninja prices. Free Threads from a Shaped Region of the same type come off the cost. Warns when you go over the 8-Thread cap, or use more than one type with Unwavering Vision. Shows the Frayed Thread price next to the average Thread price.
  - **What your maps return:** uses your session log to show, per strategy, average profit, Thread spend, return per chaos spent on Threads, and profit per hour.
  - **Betrayal board:** the 3.30 reward table for all 17 members, with 3.30 changes highlighted. Record each member's current division and rank and where you want them, or pick a starter plan (Threads and Ancient Orbs, crafting benches, gems, uniques). The page then lists the moves you still need.
  - **Expedition:** what 100 Exotic Coinage, Burial Medallions, Scrap Metal and Astragali are worth, plus the 3.30 vendor changes (Gwennen, Rog, Tujen).
  - **Heist, Labyrinth and Thread sources:** 3.30 notes (Whakano, Blueprints, Rogue's Markers), a poelab shortcut, and where Threads drop.
- Search (Ctrl+K) entries: "Plan Threads per map" and "Betrayal board".

### Fixed
- The first time the Browser page opened from a shortcut (for example "Open poe.ninja"), it could load the default site instead of the one you picked.
- The trading map search leaves "More Threads" map lines alone, and the loot filter preview uses a Thread sample in place of a Scarab.

## [1.10.0] - 2026-11-21

- **New: Trading page** (Economy → Trading).
  - **Map search builder:** tick the map mods you won't run and set a minimum quantity, rarity or pack size; it writes the shortest search that hides every tier of those mods and nothing else, worked out from the 3.30 mod texts and all 232 map names (like poe.re). Shows the length against the game's 250-character limit, and saves searches.
  - **Vendor and stash searches:** ready-made searches for 3- and 4-links, the chromatic recipe, movement speed, +1 gems and 6-sockets.
  - **Dump-tab pricer:** prices every item in a stash tab with poe.ninja and gives a `~b/o` note (chaos or divines, with an undercut you choose) to copy onto each item; lists what's worth vendoring and what needs a Ctrl+C check (desktop).
  - **Currency flip watcher:** currencies with the biggest gap between buyers and sellers, filtered by gap and number of listings, with optional notifications every 15 minutes (desktop).
  - **Collections:** divination card set progress (and what it costs to finish) and the uniques you own, from your stash (desktop).
- **Fixed** before release: two name clashes with the Maps page that would have mixed up checkboxes and data.

## [1.9.2] - 2026-11-21

- **Fixed:** Cloudflare's "verify you are human" check still looped in the in-app browser. The browser presented itself as plain Chrome, and Cloudflare rejects that inside Electron apps because the browser's other signals don't match. It now uses Electron's own identity, which passes. A release check keeps it that way.

## [1.9.1] - 2026-11-21

- **Fixed:** the in-app browser looped on Cloudflare's "verify you are human" check (for example on the trade site). The browser's site guard also blocked frames inside the page, including Cloudflare's checkbox; it now only applies to the page itself, as a normal browser does. A release check covers this.
- **New:** while Cloudflare's check is showing, the browser bar offers **Open in my browser** in case it gets stuck.

## [1.9.0] - 2026-11-21

- **New: in-app browser** (Economy → Browser). The trade site, currency exchange, poe.ninja, the wiki, poedb, poelab, Craft of Exile, FilterBlade, poe.re and pobb.in open inside the app, with back, forward, reload, an address bar that also searches the wiki, and quick links.
- **Links open there:** "Open on trade" in the price window, trade and wiki links across the app, and the wiki hotkey all open in the app's browser and bring the app to the front. Switch this off in Settings → Web links to keep using your own browser.
- **Stays signed in:** log into pathofexile.com once and the trade site remembers you, inside the app only. Settings → **Clear browser data** signs you out.
- **Isolated:** web pages run in their own sandboxed session with no access to the app, your files or your saved POESESSID. Only the sites above load in the app; any other link asks first and opens in your own browser. Downloads and pop-up windows are blocked; the trade site's "copy whisper" button still works.
- **Checks:** the release checks now start main.js with a stand-in for Electron, so a startup error can't ship.

## [1.8.1] - 2026-11-21

- **Fixed:** picking a filter in the loot filter editor did nothing for files with an apostrophe in the name, which includes every NeverSink filter ("NeverSink's filter - …"). The same fix applies to the Shopping list's filter add-on.
- **New:** the editor shows the exact folder it reads filters from, with **Refresh list**, **Open filter folder** and **Choose file…** (for a filter stored somewhere else, such as a OneDrive Documents folder). If a filter can't be read, it says why.

## [1.8.0] - 2026-11-21

- **New: Loot filter editor** (Economy → Loot filter). Open the NeverSink filter you use (from your game's filter folder, or any .filter file in the web version) and:
  - browse every rule by section, with a preview label for each and a search;
  - show, hide or minimise a rule and change its text size, text, border and background colours, drop sound and volume, light beam and minimap icon;
  - see a **loot preview** of 36 typical endgame drops run through the edited filter, including which ones it hides; click a label to edit the rule that styles it;
  - **re-tier** currency, divination cards and uniques with today's poe.ninja prices, choosing which moves to apply (desktop);
  - highlight your goal build's bases, uniques and gems, hide weapon types your build doesn't use, and hide the lowest tiers of currency, cards, uniques or maps.
- Saves as `ExileCompanion-<name>.filter` next to the original, which is never changed. Edits are remembered per filter, with undo and reset.

## [1.7.1] - 2026-11-21

- **Fixed:** the Craft lab simulator now notices target mods you tick after opening the page (it kept saying "tick target mods first").
- **Improved:** "Bench craft instead" lists only the best bench craft for each target instead of every tier.
- **Docs:** a full README with screenshots and the roadmap, this changelog, contributing and security guides, and issue templates. Release notes now come from this changelog.

## [1.7.0] - 2026-11-21

Crafting emulator and simulator in the Craft lab.

- **Emulator:** a game-style item you craft on with Transmutation, Alteration, Augmentation, Regal, Alchemy, Chaos, Exalted, Annulment, Scouring, Divine, any essence that fits, the fossils you ticked and bench crafts. Mods roll real values, target mods are marked, every step can be undone and spending is tallied.
- **Simulator:** build a plan from up to 8 steps (an action plus "once" or "until N targets hit") or start from a preset (Chaos spam, Alt → Regal → Exalt, Alt → Regal → bench craft, essence spam, fossil spam). It finishes 2,000 items with the plan and reports the average, median and lucky and unlucky 1-in-10 costs, plus the average currency used.

## [1.6.1] - 2026-11-21

- **Fixed:** a second Ctrl+C on the same item opens a price check again. Electron 45 reads the clipboard in a way that undid the marker the app uses to tell repeat copies apart; the app now uses a marker that survives it. An automated test covers both clipboard behaviours.

## [1.6.0] - 2026-11-21

- **Updated:** Electron 33 → 45 and electron-builder 25 → 26, with clipboard and encryption code updated for the new versions. Secrets saved by earlier versions still decrypt.
- **Changed:** releases are uploaded with GitHub's own CLI; pre-release versions are marked as pre-releases so auto-update skips them.
- **Changed:** builds run on Node 22 with the latest pinned GitHub Actions.

## [1.5.0] - 2026-11-21

- **New: Craft lab** (Economy → Craft lab). Mod pools from the game files (patch 3.30.0.4) for any base, item level and up to two influences, with tiers, roll ranges, required item level, spawn weights and share of rolls. Tick target mods and the lowest tier you'd accept for the chance per try and average cost of Chaos spam, essences that force a target, fossil combos, Alteration spam and Alt + Regal. Bench crafts covering a target are listed.
- **New:** "Work out the odds in the Craft lab" on the Crafting page loads that item with its mods as targets.

## [1.4.0] - 2026-11-21

- **New: Report a problem** (Settings or Ctrl+K). Describe what went wrong; the app adds its version, your system, status, settings and recent errors, shows you exactly what's included, and lets you copy it, save it or open a GitHub issue. POESESSID, sign-in tokens, user names and e-mail addresses are removed.
- **New:** the first error in a session offers a "Report it" button.
- **New:** a GitHub issue template.

## [1.3.0] - 2026-11-21

- **New:** splash screen while the app loads; every window and the taskbar use the app icon.
- **New:** hover any gear item for a game-style tooltip with item level, influences, implicits and explicit, crafted and fractured mods.
- **New:** icons on the section buttons, pages and card titles.
- **New:** compact mode for small screens and side monitors.
- **Improved:** phone layout of the web version: a header that tucks away while scrolling, one card per row, bigger buttons, a reachable search button.

## [1.2.0] - 2026-11-21

- **New:** first-run setup wizard (goal build, current character, Client.txt, overlay hotkey test).
- **New:** Settings page with a hotkey recorder, your GGG account, Discord and notifications, updates, backups, phone sync and the stream overlay.
- **New:** empty cards explain what's missing with a button that fixes it; every card has a ? explainer.
- **New:** undo for removed map log entries, cleared sessions, cheat sheets, price alerts, dismissed trade requests and a removed current character.

## [1.1.0] - 2026-11-21

- **New:** pages grouped into Home, Character, Play, Economy and Settings.
- **New:** Home page with character progress, what to do next, session stats, live status and quick actions.
- **New:** Ctrl+K (or /) searches every page, card, gear item and action.

## [1.0.1] - 2026-11-21

- **Fixed:** a price check opened only once when the same item was copied again.

## [1.0.0] - 2026-11-21

First public release of the Windows app, installed from GitHub with automatic updates.

- **Builds:** goal and current builds from Path of Building codes or pobb.in and pastebin links; progress toward the goal; shopping list; passive and atlas tree viewers.
- **Leveling:** a 10-act speed route with gem rewards, act splits from the game log and quest-gem reminders.
- **Mapping:** atlas strategy for your build, map mods to avoid, map completion, a pinnacle boss checklist and divination cards by map.
- **In game:** overlay, live game log, Ctrl+C price checks with an upgrade check, map checker, crafting helper, wiki lookup, trade whispers and cheat sheets.
- **Account:** live character sync, stash net worth, stash finds, currency trends, price alerts and a sales tracker.
- **Also:** notifications, Discord status, session recaps, backups, phone sync and an OBS stream overlay.

[1.10.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.10.0
[1.9.2]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.9.2
[1.9.1]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.9.1
[1.9.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.9.0
[1.8.1]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.8.1
[1.8.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.8.0
[1.7.1]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.7.1
[1.7.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.7.0
[1.6.1]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.6.1
[1.6.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.6.0
[1.5.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.5.0
[1.4.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.4.0
[1.3.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.3.0
[1.2.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.2.0
[1.1.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.1.0
[1.0.1]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.0.1
[1.0.0]: https://github.com/nickolusliquori/exile-companion/releases/tag/v1.0.0

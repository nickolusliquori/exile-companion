# Changelog

What changed in each release, newest first. Installed copies update themselves; see the [Releases page](https://github.com/nickolusliquori/exile-companion/releases) for the installers. Planned releases are on the [roadmap](README.md#roadmap).

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

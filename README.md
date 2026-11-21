# Exile Companion (desktop)

The Exile Companion app for Path of Exile 3.30, as a Windows desktop app with:

- **In-game overlay**: a see-through panel over the game. In campaign zones it shows the act's next steps, gem rewards and whether you're getting full XP. In maps it shows a map timer, deaths, your session rate and your map-mod search.
- **Live log**: follows `Client.txt` as you play. Zone changes, level-ups, act splits and finished maps update by themselves, with no uploading.
- **Price check**: hover an item in game and press **Ctrl+C** (the game's own copy). A price window opens next to your cursor showing poe.ninja values and the cheapest live trade listings. For rares, it searches by the item's best mods and lets you adjust them.

**Account features (Account tab)**

- **Live character sync**: pulls gear, gems, passives and level from GGG and makes them your Current build. It works with a **public** profile (the same import Path of Building uses) and can run automatically every few minutes.
- **Net worth**: values your stash tabs with poe.ninja prices and charts the total over time (manual or every 30/60 min).
- **Stash finds**: rares in your stash that beat your current gear on the guide's key mods (with tab and position), plus rares worth price-checking.
- **Currency trends**: GGG's hourly currency exchange data for the last 24 hours, with a 24h change for each currency.

**More**

- **Upgrade check** in every price check: stat changes against the item you're wearing, warnings when resistances would drop below 75%, and how many of the guide's key mods it has.
- **Trade requests** from whispers, on the overlay and the Desktop tab, with copy buttons for /invite, /tradewith, "sold" and /kick (you paste them; nothing is sent for you).
- **Notifications**: gem and tree reminders on level-up, new act targets, buyers arriving, map and net-worth milestones.
- **Discord status**: class, level and zone or map on your Discord profile.
- **Loot filter for your build** (Shopping list tab): writes `ExileCompanion.filter` = rules for your goal bases, uniques' bases and needed gems + your usual filter.
- **Atlas notables** (Atlas tab) for your chosen farm from GGG's 3.30 atlas data. The Progress tab names the passives you still need.

**Quality-of-life**

- **Map checker**: Ctrl+C on a map shows "Run it / Reroll it", flagging mods your build should avoid, plus quantity, rarity and pack size.
- **Crafting helper**: press **Ctrl+Alt+C** (the game's advanced copy) on a rare to see each mod's tier and roll, open prefixes/suffixes, and what to do next (bench craft, lock a side, Divine the rolls).
- **Wiki lookup**: Ctrl+Alt+W opens the poewiki page of the item you last copied (also a Wiki button in the price window).
- **Session recaps**: saved when you close the app: maps, div/hour, levels, acts, deaths, best map.
- **Time to next level**: estimated from your recent level-ups (overlay and Campaign tab). XP per hour from character sync.
- **Price alerts**: set a target price on Shopping list uniques and gems (or any item) and get notified when poe.ninja drops to it.
- **Sales tracker**: compares net worth snapshots to log priced items that sold.
- **Guide notes on the overlay**: shows your PoB notes section for your current level or act.
- **Sync with your phone**: Session tab → create a code (progress fits in a QR code) and paste it into the web version.
- **Stream overlay**: a local page for an OBS Browser Source with your class, level, map timer and stats.

**Trees, atlas and bosses**

- **Skill tree viewer** (Trees tab): GGG's 3.30 tree with your passives vs the guide (shared / to take / to refund), guide stages, search, and hover details.
- **Atlas tree viewer**: nodes coloured by mechanic with your farm highlighted. Click to mark nodes, read your tree from your account (GGG sign-in), or compare with a plan link from GGG's atlas planner.
- **Atlas map completion** (Maps tab): maps you've run from your game log against this league's map list (from poe.ninja).
- **Pinnacle boss checklist** with readiness checks and your own notes.
- **Cost to finish** (Progress tab): poe.ninja prices for missing uniques and gems, optionally rares via the trade site, cheapest first.
- **Overlay pages**: Ctrl+Shift+P flips between Now, Build, Gear, Atlas, Session and Trades.
- **Cheat sheets**: your own images over the game with Ctrl+Shift+H.
- **Backup & restore**, plus automatic daily backups (last 7).

**Game data**

- **Chat command readouts**: type `/passives`, `/deaths` or `/played` in game and the answers are read from your log. Skill-point quests get ticked off, and deaths and playtime show on the Campaign tab.
- **7-day price trends** from poe.ninja in price checks, net worth and price alerts. Net worth now also covers maps, incubators, vials, base types, tinctures, relics and more.
- **Wiki panel** in price checks for uniques, gems and divination cards (from the Path of Exile wiki's data API).
- **Divination cards by map** (Maps tab): area-restricted cards from the wiki with poe.ninja prices, a lookup by map, and "cards that drop here" on the overlay.
- **News & patch alerts** from pathofexile.com/news.
- **Item art** in your gear, stash finds and net worth lists (from GGG's item data).
- **Import from links**: paste a pobb.in or pastebin link straight into the import box.

Everything from the web version (build import, goal vs current, shopping list, campaign, maps, atlas, crafting, session log) is included.

## Install

1. Open the [latest release](https://github.com/nickolusliquori/exile-companion/releases/latest) and download **Exile-Companion-Setup-x.y.z.exe**.
2. Run it. Windows SmartScreen will warn that the app is from an unknown publisher (it isn't code-signed): click **More info → Run anyway**.
3. In Path of Exile set **Options → Graphics → Display mode: Windowed Fullscreen**. True fullscreen hides overlays.

**Updates are automatic.** The app checks GitHub for new releases on start and every 6 hours, downloads them in the background and installs them when you restart (there's also a *Restart & update* button). Your builds and progress are kept.

## For developers

```
npm install
npm start          # run from source
npm run check      # syntax, security-policy and parser checks
npm run dist:local # build an installer on your own PC (skips exe signing tools)
```

**Releasing a new version:** bump `version` in `package.json` (e.g. `1.0.0` → `1.0.1`) and push to `main`. You can even do it in the GitHub website's editor.

GitHub Actions builds the Windows installer and publishes the release; installed apps pick it up automatically.

## Hotkeys (change them on the Desktop tab)

| Key | What it does |
|---|---|
| Ctrl+C (in game, over an item) | Price check (the game copies the item; the app reads the clipboard) |
| Ctrl+D | Re-open the last price check |
| Ctrl+Shift+O | Show / hide the overlay |
| Ctrl+Shift+I | Overlay click mode: move it, tick steps, press buttons (press again or *Done* to go back to click-through) |
| Ctrl+Shift+F | Copy the overlay's current search (vendor gems or map mods), then paste it in game with Ctrl+V |
| Ctrl+Alt+C (in game) | Advanced copy: price check plus mod tiers in the crafting helper |
| Ctrl+Alt+W | Open the wiki page of the item you last copied |
| Ctrl+Shift+P | Next overlay page |
| Ctrl+Shift+H | Show the next cheat sheet (hides after the last) |
| Esc | Close the price window |

## Where your data lives

- Settings: `%APPDATA%\exile-companion\config.json`
- Builds, progress and map log: inside the app's own storage (separate from the web version in your browser).

## Rules

The app only reads your log file and clipboard. It never sends key presses or clicks to the game and never reads game memory. Price checks start from the game's own Ctrl+C, so it's one key press, one action. GGG doesn't certify third-party tools and can change its policy at any time.

## Troubleshooting

- **Overlay not visible over the game**: switch the game to Windowed Fullscreen. Use *Overlay → Reset position* in the menu if it's off-screen.
- **"Client.txt not found"**: Desktop tab → *Find Client.txt* or *Choose file…*. It's in the game folder under `logs`.
- **Price check says rate-limited**: the trade site limits searches. Wait the number of seconds shown.
- **A hotkey doesn't work**: another program may use it. Pick a different one on the Desktop tab.
- **Prices missing for a new league**: set the league name on the Desktop tab exactly as the trade site shows it.

## Credits

Atlas and passive tree data come from GGG's official [atlastree-export](https://github.com/grindinggear/atlastree-export) (3.30.0c) and [skilltree-export](https://github.com/grindinggear/skilltree-export) (3.30.0). Gem, quest-reward and area data come from [exile-leveling](https://github.com/HeartofPhos/exile-leveling) by HeartofPhos (MIT License). Prices come from pathofexile.com/trade and poe.ninja.

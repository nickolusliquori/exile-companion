# Changelog

What changed in each release, newest first. Installed copies update themselves; see the [Releases page](https://github.com/nickolusliquori/exile-companion/releases) for the installers. Planned releases are on the [roadmap](README.md#roadmap).

## [1.41.0] - 2026-11-23

### Added
- **Upgrade finder ranked by Path of Building** (Character → Build tools): the top trade results for a slot now go through your own Path of Building and are ranked by real value per divine (DPS% + 0.7 × EHP%), with DPS, EHP, life and resistance changes for each item compared with what you wear. Items that don't beat your gear are left out. Turn it off to rank by stat weights as before.
- **Support gems by Path of Building** (Build tools → Support gems): what each support in your main skill really adds, what one more level of the skill gem is worth, and every compatible support tried in place of your weakest one, with poe.ninja prices. "Total" and "Hits" are shown separately, and supports whose gain comes mostly from an added damage-over-time effect (like Decay) are flagged so they don't mislead.
- The Windows test run checks both with the real Path of Building: trade items read exactly like Ctrl+C text, and the build is restored after the gem comparison.

## [1.40.0] - 2026-11-23

### Changed
- **Desktop tools is organised into sections** with buttons at the top to jump to each: In game (game log, overlay, price check, Path of Building numbers, cheat sheets), Trading (trade requests, stash highlight, chat scanner, price alerts), Streaming and phone (OBS page, phone screen, Twitch) and News and rules.
- The phone screen, Twitch and Path of Building cards moved from Settings to Desktop tools, where the 1.36–1.39 notes said they were. **Settings** now holds only settings: general, hotkeys, characters, account and data, updates, backups and sync, also in sections.
- The newer cards (Path of Building numbers, stash highlight, chat scanner, phone screen, Twitch, characters, game data, playing by the rules) got their "?" explanations.

## [1.39.0] - 2026-11-23

### Added
- **Path of Building numbers in the price check:** when you price check gear (rings, amulets, belts, armour, weapons, shields, quivers), the popup shows what it would do to your build: DPS, life, energy shield, EHP, resistances and movement speed, for the best slot it fits (and the other ring slot), compared with what you wear. The numbers come from your own Path of Building Community install, run in the background against your imported current character (or your goal build), so they match Path of Building's own item comparison. The first check after starting takes a few seconds while Path of Building loads; after that it's almost instant. Turn it off or pick Path of Building's folder in Desktop tools → Path of Building numbers. (This shipped quietly inside 1.38.0; these are its proper notes.)
- The app now includes LuaJIT (MIT) and two small headless helper files from Path of Building (MIT) to run it; see THIRD_PARTY_NOTICES.md.
- The Windows test run now downloads Path of Building and checks an item comparison end to end.

## [1.38.0] - 2026-11-23

### Added
- **Loot per map** (Play → Session): pick up to four tabs you drop loot into, and each time you enter a new map the app counts what was added since the previous map and prices it with poe.ninja. You get each map's loot (top items, rares counted separately, time spent) and a "Which maps pay" table with average loot, average time and value per hour by map. Re-entering the same map through a portal doesn't count again; "Count this map now" closes the last map when you stop. It reads one tab per map entry (needs your POESESSID), and each character keeps its own history.
- The Windows test run now also checks that the Twitch client ID can start a sign-in.

## [1.37.0] - 2026-11-23

### Added
- **Twitch chat commands** (Desktop tools → Twitch chat commands): sign in with Twitch (a short code you approve on twitch.tv/activate) and your chat can use **!build** (class, main skill and your guide link), **!level**, **!map**, **!deaths**, **!profit**, **!league** and **!commands**, plus your own text commands (like !discord). Each command can be turned off, with a cooldown and an optional mods-only mode; replies are threaded to the person who asked. Sign in with a separate bot account and set your channel if you prefer. The app only reads chat and posts those replies.
- !build uses the pobb.in / pastebin link you imported your goal build from (or one you set), per character.
- The Windows test run now also opens an anonymous Twitch chat connection.

## [1.36.0] - 2026-11-22

### Added
- **Phone screen** (Desktop tools → Phone screen): see the overlay's information on your phone while you play: where you are, leveling steps and gems, this map, your session and goal, mods you skip, trade requests, net worth, build progress and price alerts. Scan the QR code with your phone's camera on the same Wi-Fi. It's off by default and read-only; the link carries a private key (New link makes the old one stop working), and only devices on your home network are answered. If Windows asks about the firewall, allow private networks only.
- The Windows test run now also checks that the phone screen refuses requests without the key.

## [1.35.1] - 2026-11-22

### Fixed
- **Price check stuck on the previous item, or doing nothing.** Checks could overlap: a slow earlier check finished last and drew over the new item, and the new item's name only appeared once side lookups had finished. Now each Ctrl+D shows the new item at once, and an older check stops (no more trade requests) and can never draw over it.
- The automatic "loosen the search" for rares now makes at most two extra searches and skips them when the trade site's rate limit is close, so a few checks in a row no longer use up GGG's limit.
- When the trade site's rate limit makes a check wait, the popup says so with a countdown instead of looking stuck.
- Ctrl+D without a new Ctrl+C now says "No new item copied" and keeps the current result instead of quietly searching the last item again; pressing it again on the same item within a minute doesn't search again.
- Closing the app normally, or restarting for an update, could count as a failed start, so a couple of quick restarts started the app in safe mode with hotkeys off. Only real crashes count now.

## [1.35.0] - 2026-11-22

### Added
- **Automatic cheat sheets** (Desktop tools → Cheat sheets → Open automatically): choose a sheet for the Labyrinth, Heist contracts, Delve, the Sanctum, Simulacrum, any map, your hideout, or any zone whose name contains a word. It opens when you enter one and closes when you leave (optional). The hotkey still cycles through all your sheets.

## [1.34.0] - 2026-11-22

### Added
- **Sell in bulk** (Economy → Trading → Dump-tab pricer): after pricing a tab, group the same items, untick what you're keeping, set a bulk discount, and copy a ready post for TFT / Discord (each item, price each, total, divine rate and your character name) or a trade-chat line that fits the chat limit. Rares, unpriced items and Chaos Orbs are left out. You post it yourself.

## [1.33.0] - 2026-11-22

### Added
- **Chat scanner** (Desktop tools): alerts when trade, global, local, party or guild chat mentions your keywords, on the overlay, as a Windows notification and/or with a sound. Keywords match anywhere in any case; add `-word` to skip messages with that word, or write `/regex/`. Recent matches have Copy whisper and Ignore buttons, and repeated messages alert once. It reads chat from your game log only and never sends anything.
- The game log reader now understands public chat lines (with guild tags) without mistaking debug lines for chat.

## [1.32.0] - 2026-11-22

### Added
- **Stash highlight for trades:** when someone buys from you, the app outlines the item on a see-through grid over your stash, using the tab and position from their whisper, with the item, price and buyer beside it. Line the grid up with your stash once (Desktop tools → Stash highlight); after that, "Show in stash" on a trade request, Ctrl+Shift+G (latest trade; press again to hide), or automatically when the buyer arrives in your hideout. Quad tabs work by name, and any position past 12 uses the quad grid. It only draws over the game and never reads your screen.

## [1.31.0] - 2026-11-22

### Added
- **Gwennen gambling search** (Economy → Trading): from today's poe.ninja prices, a search for Gwennen's shop that highlights only the bases that can be a valuable unique. Choose the price and whether any unique or every unique on the base must reach it; the table shows each base's best unique and how many uniques share it. 6-links, replicas and relics aren't counted, and the search never matches common tooltip words.
- **Every gem in your goal build** as stash/vendor searches in the trading tools (the Campaign page still has the ones you can buy by your current act).
- **More searches on the overlay's Tools page:** your latest Gwennen search, your build's gems and the leveling vendor searches sit next to your saved searches, ready to copy in game.

## [1.30.0] - 2026-11-22

### Changed
- **Fonts are bundled** with the app (Cinzel and Source Sans 3, SIL Open Font License) instead of loading from Google Fonts, so the app looks the same offline and starts without that request. The pages no longer allow any font or style from Google.
- **The main window's code is split** into a stylesheet and ten scripts by area (`app/css/app.css`, `app/js/`), down from one 620 KB file. Nothing changes in how the app works; future fixes are smaller and safer. Checked page by page (same text on all 20 pages, same functions) and with the Windows test run.

## [1.29.0] - 2026-11-22

### Added
- **Characters:** keep several characters, each with its own goal and current builds, campaign progress, atlas, owned gear, boss notes, level times and map log. Prices, trading, the loot filter and settings stay shared. Switch from the character button in the top bar, Ctrl+K ("Switch to …"), or Settings → Characters, where you can also rename and remove them (with undo).
- When the game log shows you playing another saved character, the app offers to switch, and that character's level-ups aren't recorded on the one you have open.
- The Windows test run now also creates a second character and switches back.

## [1.28.0] - 2026-11-22

### Added
- **Windows test run:** every release is now opened on a real Windows machine (GitHub Actions) before it's published. The test goes through every page, the overlay, price check, pinned browser and media player windows, reading a game log, Windows' media controls and the text size settings, and the release stops if anything fails or logs an error. Pull requests (such as the weekly data update) get the same test.
- **Overlay text size** (Settings → Look and feel), separate from the app's. The overlay window grows or shrinks to fit when you change it.

### Fixed
- At text sizes other than 100%, the in-app browser was placed in the wrong spot. Text size now scales each window by itself (main window, price check, overlay), and the old zoom from 1.27 is reset once.
- The price check popup now grows with the text size instead of cutting content off.

## [1.27.0] - 2026-11-22

### Added
- **Text size** (Settings → Look and feel): 90% to 150%, or Ctrl + plus / minus / 0 anywhere in the app. Applies to the main window and the price check popup.
- **Higher contrast:** brighter secondary text and borders, a stronger focus outline, and items you already own are no longer dimmed as much.
- **Colorblind-friendly colors:** good/bad/warning become blue/orange/yellow across the app, the tree view, the overlay and the price check. Changes apply to open windows straight away.
- **Keyboard and screen readers:** a "Skip to the page" link, arrow keys (and Home/End) to move between sections and pages, pages announced as tab panels, and every field now has a name screen readers can read.

### Fixed
- A saved state with missing parts (an old or damaged save) could crash the Home page; missing parts now get their defaults.
- The tour's spotlight is placed correctly at any text size.

## [1.26.0] - 2026-11-22

### Added
- **Local log:** errors from every app window, page crashes, stalls and startup times go to `logs\app.log` in the app's folder (redacted as written, two 512 KB files at most). Settings → Open log folder; Report a problem now includes the last lines.
- **Crash recovery:** a window that crashes reloads by itself and you get a notice. If it keeps crashing (3 times in 5 minutes), it stops and suggests safe mode.
- **Safe mode:** if the app doesn't finish starting twice in a row, it starts without the overlay, price window, hotkeys, media, Discord, streaming and graphics acceleration, and Home explains what happened. Settings has Restart in safe mode / Restart normally. Updates still install in safe mode, so a fix can arrive.

### Changed
- The startup check now also runs the app's "ready" code in normal and safe mode.

## [1.25.0] - 2026-11-22

### Added
- **Starter mode:** new installs show only the main pages (Home, Build, Progress, Campaign, Maps, Session, Settings). Opening any other page from Ctrl+K or a link unlocks it; "＋ All pages" in the top bar or Settings → Look and feel shows everything. Existing installs keep all pages.
- **"No build yet?"** in the setup wizard: links to Maxroll, Mobalytics and poe.ninja builds with a short explanation of where to find a Path of Building code, plus "Just leveling for now" to continue without a build.
- **Guided tour:** an 8-step spotlight walk through sections, search and the Home cards, offered at the end of the wizard and available in Settings and Ctrl+K ("Take the tour").
- **In-game hints:** one-time overlay hints on your first zone (overlay hotkeys) and first map (price check and quick tools), using your configured hotkeys. Reset them in Settings.

### Changed
- The startup check now also verifies that `UI` and `GAME` are declared before any top-level use.

## [1.24.0] - 2026-11-22

### Added
- **Game data pipeline:** a weekly GitHub Actions job fetches GGG's passive and atlas tree exports, the RePoE game-data export and Path of Building's timeless and cluster jewel data. It regenerates the app's data files, runs all checks and opens a pull request when something changed, noting a new patch and what to review. Files whose data didn't change are left alone, so quiet weeks produce nothing. The same update runs locally with `scripts/update-data.sh`, and `data/sources.json` records what was used.
- `scripts/trees.py` regenerates the passive and atlas tree data (it reproduces the shipped files exactly).
- Settings → Game data now reads each data set's version from the data itself.

### Changed
- The tree data files record their GGG export version. The cluster jewel generator picks Path of Building's newest tree automatically.

## [1.23.0] - 2026-11-22

### Added
- **Follows new leagues automatically:** the app checks GGG's league list at startup and every 6 hours. When a new challenge league launches, or the one you use has ended, price checks and prices switch to it and you get a notification. Tick **Keep this league** in Settings to stay on one (for example Standard or Hardcore). Before this, the league saved on first run was kept forever.
- **New-league checklist on Home:** confirm the new league (or stay on the old one), check for game data updates, start a fresh session (the old league's map count and net worth are archived), import this league's build and reset campaign progress, each with undo.
- **Game data that updates between releases** (`data/game.json`): the patch label, atlas farming strategies, progression tips, map-mod wording and short announcements on Home. As with league data, only checked text and numbers are used, and older or malformed files are ignored.
- **Settings → Game data:** every data set the app uses, where it comes from and its version, with anything built for an older patch flagged, plus a "Check for data updates" button.
- The title bar shows the current patch and your league.

## [1.22.0] - 2026-11-22

### Changed
- **Price checks now start with Ctrl+C, then Ctrl+D** (or your price hotkey). GGG's developer guidelines allow reading the clipboard only once per manual key press. The old automatic mode read it in the background several times a second, so it has been removed. The hotkey reads it once, when you press it.
- GGG's disclaimer ("This product isn't affiliated with or endorsed by Grinding Gear Games in any way.") now shows at the bottom of the app.
- README rewritten: everything the app does as of this release, and a section on how it follows GGG's Terms of Use and developer guidelines.

## [1.21.0] - 2026-11-22

### Added
- **Overlay Tools page** on **Ctrl+Shift+Space** (changeable in Settings): opens the overlay straight into click mode with
  - your **saved stash searches** from the Trading page plus chaos/regal recipe searches, copied with one click to paste into the stash search box;
  - a **stopwatch** with laps;
  - **notes** that are kept between sessions.
  Press the hotkey again to leave click mode. It's also reachable with the overlay's page hotkey.

### Fixed
- The overlay's now-playing bar no longer shows empty buttons when nothing is playing.

## [1.20.0] - 2026-11-22

### Added
- **Trade companion upgrades** (Desktop tools → Trade requests, and the overlay):
  - **You're buying:** whispers you send to sellers are listed too, with copy buttons to visit their hideout, ask if it's still for sale, or say thanks.
  - **Price hints from poe.ninja:** bulk offers that are well under market are flagged, and so is your own listing if it's priced far below market.
  - **Custom quick replies:** add, rename or remove reply buttons, with {name}, {item} and {price} filled in for each request.
- **Vendor recipe tracker** (Account page): counts full rare sets for the Chaos Orb recipe (lowest item level 60–74) and Regal Orb recipe (all 75+) in the tabs you include in net worth, with the payout (doubled for unidentified sets), what the next set still needs, and stash searches to copy that highlight the pieces.

## [1.19.0] - 2026-11-22

### Added
- **Mark map mods in the price window:** Ctrl+C a map, then click any mod to mark it as a warning (⚠), then danger (⛔), then clear. Marks are remembered by wording for every map, and danger marks (plus your build's avoid list) turn the verdict to "Reroll it". The Maps page lists your marks so you can remove them.
- The map check also shows quality, delirious and "More …" rewards (currency, maps, divination cards, Threads) next to quantity, rarity and pack size.
- **Item links in the price window:** **poedb** next to Wiki, and **Craft lab**, which opens the item in the main window's Craft lab with its base, item level, influences and mods filled in.

## [1.18.1] - 2026-11-22

### Fixed
- **Price check now finds items with similar prefixes and suffixes**, not just the same base. The first search ticks every matched prefix and suffix (except low-value ones such as reduced attribute requirements or light radius) and asks for listings with most of them, using the trade site's "count" filter. "Open on trade site" opens that same search. You can switch between **at least N** and **all** of the ticked mods.
- Mods whose wording differs slightly from the trade site's (signs, "(Local)", "reduced" vs "increased") are now matched instead of being silently dropped. "Reduced" mods are searched as the negative values the trade site expects.
- If nothing is listed, the search loosens step by step (fewer mods needed, then minimums lowered by 20%) and tells you what it changed, instead of returning nothing.
- If an item's mods can't be matched at all, the popup now says so instead of quietly searching by base only.
- **Magic items** are searched by their mods too (they used to get no search). The base is worked out from the name ("Glinting Ruby Ring of the Lynx" → Ruby Ring).

## [1.18.0] - 2026-11-22

### Added
- **League data updates between releases:** the League page (Betrayal rewards, Threads, Expedition) now checks this project's GitHub repo for newer data (`data/league.json`), so mid-league corrections arrive without installing anything. Only checked text and lists are used; anything malformed or older is ignored. The Betrayal card shows which data version you're on.
- **Saved trade searches** (Economy → Trading): every trade search you open in the app's browser goes into a recent list. Click **☆ Save search** in the browser bar (or Save in the list) to keep one, rename it and open it again later.
- **Net worth graph:** choose 24 hours, 7 days or all, in divines (at each snapshot's divine price) or chaos, with the change over the range and the average per day. Home shows your latest net worth and the 24-hour change.

## [1.17.0] - 2026-11-22

### Added
- **Media page** (Settings → Media, desktop app):
  - **Now playing:** shows what's playing anywhere in Windows (Spotify, Apple Music, Netflix or YouTube in your browser, Stremio…) with previous, play/pause and next, using Windows' own media controls. The overlay shows it too; its buttons work in click mode. It can be turned off.
  - **Mini player over the game:** an always-on-top player for YouTube, YouTube Music, Twitch, Kick and SoundCloud, opened with **Ctrl+Shift+M** or from the Media page. Paste a link, play/pause, skip, mute, set the volume and how see-through it is. **Click-through** lets clicks pass to the game. It opens without taking focus from the game and remembers its size and position. It signs in separately from your Path of Exile sites.
  - New optional hotkeys in Settings: play/pause music, and mini player click-through.
- Netflix, Hulu, Paramount+, Disney+, Apple Music and similar can't play in the mini player (they need copy protection the app doesn't have). Play them in your browser or their app and control them under Now playing.

## [1.16.0] - 2026-11-22

### Added
- **Deeper price checks for rare items** in the price popup:
  - A **maximum** next to each mod's minimum, so you can search a range.
  - **Tier and roll badges** (for example "T1 S" with a bar showing where the roll sits in its range) when you copy the item with **Ctrl+Alt+C**. A tip appears when you use plain Ctrl+C.
  - **Range presets** (80%, 90%, 100%) that reset every minimum at once.
  - **Totals for life and resistances:** combines the ticked life and resistance mods into the trade site's total life, total elemental resistance and total chaos resistance, the way most people search for rings, amulets and armour.
  - **Item level** (this level or higher) and **any base** (search the whole item class instead of this exact base) filters.

## [1.15.0] - 2026-11-22

### Added
- **Upgrade finder** (top of Character → Build tools): scores each gear slot (helmet, body, gloves, boots, belt, amulet, rings) by the stats your build values. Weights start from your goal build: life or energy shield, resistances you haven't capped, attack or spell stats for your main skill, movement speed on boots. You can change any of them. **Search** or **Check all slots** asks the trade site for items scoring at least 10% more than what you wear, with an optional max price, and ranks them by score gained per divine. Copy a seller's whisper or open the search on the trade site.

### Changed
- Trade site requests are now paced using the rate limits GGG publishes with each response, so price checks and searches wait their turn instead of getting the app temporarily blocked.

## [1.14.0] - 2026-11-21

### Added
- **Three themes** (Settings → Look and feel), switched instantly and remembered:
  - **Dark minimal** (new default): near-black with one gold accent, flat panels, more spacing, plain headings.
  - **Modern:** neutral charcoal with a blue accent.
  - **Path of Exile:** the gold-trimmed, game-style look from earlier versions.
- **Light animations:** pages and cards fade in, sub-menus slide in, dialogs and notices pop in, buttons press down. They turn off with the new Animations switch or when Windows "reduce motion" is on.
- **Loading feedback:** a thin bar at the top while the app fetches prices or data, and shimmering placeholders while a page loads.
- **Minimal sounds:** a soft click on buttons and a short cue (plus a shake) when a required field is left empty. On by default at low volume; switch them off or set the volume in Settings. The sounds are generated in the app, with no audio files.

### Changed
- Checkbox labels keep the box next to the text instead of wrapping it onto its own line.
- The overlay, price window and pinned browser keep their own compact style for now.

## [1.13.0] - 2026-11-21

### Added
- **Browser over the game:** press **Ctrl+Shift+B**, or click **Pin over game** on the Browser page, to show the in-app browser in an always-on-top window over Path of Exile (Windowed Fullscreen). It has back, forward, reload, an address bar, a see-through slider and a button to move the page back into the app. **Esc** or the hotkey hides it. It shares the in-app browser's sign-ins, uses the same site allowlist and sandbox, and only shows and hides: nothing is sent to the game. The hotkey can be changed in Settings.
- **Recent price checks** on Home: the last 20 items you copied in game. Click one to open its price check again without hovering it. Kept in memory only and cleared when the app closes.
- **Session goals** (Session page): set a target in divines, chaos, maps or hours. Progress counts maps you log and stash sales from when you set it, and shows on Home, the Session page and the overlay. You get a notification once it's reached (or when your planned time is up).
- Search (Ctrl+K) entries: "Set a session goal", "Recent price checks", "Pin the browser over the game".

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

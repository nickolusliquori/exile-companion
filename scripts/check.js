// Repository checks: script syntax, Content-Security-Policy in every page, log parser behaviour.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
let failures = 0;
const pending = [];
const fail = (msg) => { console.error("✗ " + msg); failures++; };
const ok = (msg) => console.log("✓ " + msg);

for (const f of ["main.js", "preload.js", "lib/logtail.js", "lib/ggg.js", "lib/discord.js", "lib/clip.js", "lib/diag.js", "lib/files.js", "lib/webhosts.js", "lib/crashlog.js", "lib/qr.js", "lib/twitch.js", "lib/pob.js"]) {
  try { new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: f }); ok(`${f} parses`); }
  catch (e) { fail(`${f}: ${e.message}`); }
}

const appDir = path.join(root, "app");
// index.html with its split-out scripts and styles put back in place, for checks that read the main window's code
const readIndex = () => fs.readFileSync(path.join(appDir, "index.html"), "utf8")
  .replace(/<script src="(js\/[\w.-]+\.js)"><\/script>/g, (m, f) => "<script>\n" + fs.readFileSync(path.join(appDir, f), "utf8") + "\n</script>")
  .replace(/<link rel="stylesheet" href="(css\/[\w.-]+\.css)">/g, (m, f) => "<style>\n" + fs.readFileSync(path.join(appDir, f), "utf8") + "\n</style>");
for (const f of fs.readdirSync(appDir).filter((x) => x.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(appDir, f), "utf8");
  if (!/http-equiv="Content-Security-Policy"/.test(html)) fail(`${f}: missing Content-Security-Policy`);
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, i = 0;
  while ((m = re.exec(html))) {
    try { new vm.Script(m[1], { filename: `${f}#script${i}` }); } catch (e) { fail(`${f} script ${i}: ${e.message}`); }
    i++;
  }
  ok(`${f}: ${i} inline script(s) parse, CSP present`);
}
for (const f of fs.readdirSync(path.join(appDir, "js")).filter((x) => x.endsWith(".js"))) {
  try { const src = fs.readFileSync(path.join(appDir, "js", f), "utf8"); new vm.Script(src, { filename: "js/" + f }); assert(/^(\/\/[^\n]*\n)*"use strict";/.test(src), "starts with use strict"); ok(`app/js/${f} parses`); }
  catch (e) { fail(`app/js/${f}: ${e.message}`); }
}
{ // index.html loads every split script, in order, and nothing else is left over
  const h = fs.readFileSync(path.join(appDir, "index.html"), "utf8"), tags = [...h.matchAll(/<script src="js\/([\w.-]+)"><\/script>/g)].map((m) => m[1]);
  const files = fs.readdirSync(path.join(appDir, "js")).filter((x) => x.endsWith(".js")).sort();
  if (JSON.stringify(tags) !== JSON.stringify(files)) fail("index.html script tags don't match app/js: " + tags.join(",") + " vs " + files.join(","));
  else ok(`index.html loads all ${files.length} main-window scripts in order`);
}
for (const f of fs.readdirSync(appDir).filter((x) => x.endsWith(".js"))) {
  try { new vm.Script(fs.readFileSync(path.join(appDir, f), "utf8"), { filename: f }); ok(`app/${f} parses`); }
  catch (e) { fail(`app/${f}: ${e.message}`); }
}

// chat lines: channels, guild tags, and debug lines that only look like chat
try {
  const { parseEvents } = require(path.join(root, "lib", "logtail.js"));
  const T = "2026/11/22 12:00:00 1 ab ";
  const ev = parseEvents([
    T + "[INFO Client 9] $<GLD> Seller_1: WTS Mageblood 150 div",
    T + "[INFO Client 9] #Talker: anyone doing carries?",
    T + "[INFO Client 9] %Partyguy: ready",
    T + "[INFO Client 9] &Guildie: gz",
    T + "[INFO Client 9] LocalDude: hi",
    T + "[INFO Client 9] @From <ABC> Buyer: Hi, I would like to buy your Headhunter Leather Belt listed for 100 divine in Standard",
    T + "[INFO Client 9] : You have entered Hideout.",
    T + "[INFO Client 9] Connecting to instance server at 1.2.3.4:6112",
    T + "[DEBUG Client 9] Something: not chat",
    T + "[INFO Client 9] Got Instance Details from login server",
  ].join("\n"));
  const chats = ev.filter((e) => e.type === "chat");
  assert.strictEqual(chats.map((c) => c.ch + ":" + c.name).join(","), "trade:Seller_1,global:Talker,party:Partyguy,guild:Guildie,local:LocalDude", "chat channels: " + JSON.stringify(chats));
  assert.strictEqual(chats[0].text, "WTS Mageblood 150 div");
  assert(ev.some((e) => e.type === "whisper" && e.name === "Buyer") && ev.some((e) => e.type === "system"), "whispers and system lines unchanged");
  ok("chat lines: trade, global, party, guild and local chat; debug lines aren't chat");
} catch (e) { fail("chat lines: " + e.message); }

try {
  const { parseEvents, parseTrade } = require(path.join(root, "lib", "logtail.js"));
  const ev = parseEvents([
    '2026/11/20 20:00:00 1 a [DEBUG Client 1] Generating level 79 area "MapWorldsDig" with seed 9',
    "2026/11/20 20:00:05 1 a [INFO Client 1] : Zap (Deadeye) is now level 85",
    "2026/11/20 20:00:06 1 a [INFO Client 1] : Zap has been slain.",
    '2026/11/20 20:00:07 1 a [INFO Client 1] @From Buyer: Hi, I would like to buy your Hyrri\'s Ire Zodiac Leather listed for 95 chaos in Covens of Umbra (stash tab "~price"; position: left 3, top 7)',
    "2026/11/20 20:00:08 1 a [INFO Client 1] : You have died 12 times.",
  ].join("\n"));
  assert.deepStrictEqual(ev.map((e) => e.type), ["zone", "level", "death", "whisper", "system"]);
  assert.strictEqual(ev[0].id, "MapWorldsDig");
  assert.strictEqual(ev[1].level, 85);
  assert.strictEqual(ev[3].trade.amount, "95");
  assert.strictEqual(ev[3].trade.left, 3);
  assert.ok(parseTrade("Hi, I'd like to buy your 10 Divine Orb for my 1800 Chaos Orb in Covens of Umbra.").bulk);
  ok("log parser tests pass");
} catch (e) { fail("log parser: " + e.message); }

try {
  const { createClipWatcher } = require(path.join(root, "lib", "clip.js"));
  const item = "Item Class: Rings\r\nRarity: Rare\r\nDread Spiral\r\nVermillion Ring\r\n--------\r\nItem Level: 84";
  const isItem = (t) => /^Item Class: /m.test(t) && /^Rarity: /m.test(t);
  // Electron 33 returns text unchanged; Electron 44+ may turn \r\n into \n and drop a trailing break
  const models = { "as-is": (s) => s, normalising: (s) => s.replace(/\r\n/g, "\n").replace(/\n+$/, "") };
  pending.push((async () => {
    for (const [name, readBack] of Object.entries(models)) {
      for (const copied of [item, item + "\r\n"]) {
        let board = "", shown = 0;
        const w = createClipWatcher({ read: async () => readBack(board), write: async (t) => { board = t; }, isItem, onItem: () => shown++ });
        await w.prime();
        for (let i = 0; i < 4; i++) {
          board = copied;                       // the game's Ctrl+C
          for (let k = 0; k < 3; k++) await w.poll();
        }
        assert.strictEqual(shown, 4, `${name}: expected 4 price checks for 4 copies, got ${shown}`);
        board = "some chat text"; await w.poll();
        w.expect("search text"); board = "search text";
        assert.strictEqual(await w.poll(), false, "app's own copy must not trigger");
      }
    }
    ok("repeat price checks work with both clipboard behaviours");
  })().catch((e) => fail("clip: " + e.message)));
} catch (e) { fail("clip: " + e.message); }

// problem reports must never leak secrets or the Windows user name
try {
  const { redact, sanitizeCfg } = require(path.join(root, "lib", "diag.js"));
  const ctx = { home: "C:\\Users\\Nick", user: "Nick" };
  const sample = "Error at C:\\Users\\Nick\\AppData\\x.js; POESESSID=0123456789abcdef0123456789abcdef; Bearer abcdefghijkl123; mail nick@example.com; /home/nick/file";
  const r = redact(sample, ctx);
  for (const bad of ["Nick", "0123456789abcdef0123456789abcdef", "abcdefghijkl123", "nick@example.com", "/home/nick"]) if (r.includes(bad)) throw new Error("leaked " + bad + " in: " + r);
  const c = sanitizeCfg({ accountName: "Nick#1234", contact: "nick@example.com", logPath: "C:\\Users\\Nick\\Client.txt", priceOnCopy: true, poesessid: "x" }, ctx);
  if (c.accountName || c.contact || c.poesessid || /Nick/.test(JSON.stringify(c))) throw new Error("sanitizeCfg leaked: " + JSON.stringify(c));
  ok("problem reports redact secrets and user names");
} catch (e) { fail("diag: " + e.message); }

// craft lab engine: spawn weights, tiers, fossils and odds look sane on a known base
try {
  const ctx = { console, performance, Math, setTimeout, S: {}, save() {}, toast() {}, emptyBox: (m) => m, $: () => null, NINJA: null, DESK: null };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "craftdata.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "craftlab.js"), "utf8"), ctx);
  const T = ctx.CraftLab._test, b = T.baseByName("Vaal Regalia");
  assert(b, "Vaal Regalia missing");
  const rows = T.groupRows(T.makePool(b, 86, [], []));
  const life = rows.find((r) => r.grp === "IncreasedLife");
  assert(life && life.tiers.length >= 8, "life tiers missing");
  assert(T.groupRows(T.makePool(b, 86, ["shaper"], [])).length > rows.length, "influence adds no mods");
  const pri = ctx.CRAFTDATA.fossils.find((f) => f.n === "Pristine Fossil");
  assert(T.groupRows(T.makePool(b, 86, [], [pri])).find((r) => r.grp === "IncreasedLife").share > life.share * 2, "Pristine Fossil doesn't favour life");
  assert.strictEqual(T.norm("+98 to maximum Life"), T.norm("+(90-99) to maximum Life"));
  const fire = rows.find((r) => r.grp === "FireResistance");
  const m = T.methods({ base: b, ilvl: 86, infl: [], fossils: [], targets: [{ key: life.key, g: "p", grp: life.grp, minTier: 3 }, { key: fire.key, g: "s", grp: fire.grp, minTier: 3 }] }, { "Chaos Orb": 1 });
  const chaos = m.find((x) => x.name === "Chaos Orb spam");
  assert(chaos && chaos.p > 0.002 && chaos.p < 0.2, "chaos odds out of range: " + (chaos && chaos.p));
  // emulator operations and the simulator
  const T2 = ctx.CraftLab._test2, cx = T2.ctxFor({ base: b, ilvl: 86, infl: [] });
  const it = T2.blankItem(); T2.OPS.alch.run(it, cx, true);
  assert(it.r === "r" && it.mods.length >= 4 && it.mods.every((x) => x.text && !/\(\d/.test(x.text)), "alchemy should give a rare with rolled values");
  const n = it.mods.length; T2.OPS.annul.run(it); assert.strictEqual(it.mods.length, n - 1, "annulment removes one mod");
  const st2 = { base: b, ilvl: 86, infl: [], fossils: [], targets: [{ key: life.key, g: "p", grp: life.grp, minTier: 3 }, { key: fire.key, g: "s", grp: fire.grp, minTier: 3 }] };
  const sim = T2.simulateOnce(st2, cx, [{ a: "alch", u: "once" }, { a: "chaos", u: "all" }], { "Chaos Orb": 1 }, 400);
  assert(sim.ok && sim.cost > 0, "simulator should finish a chaos-spam plan");
  ok(`craft lab engine works (${ctx.CRAFTDATA.v}, ${Object.keys(ctx.CRAFTDATA.mods).length} mods)`);
} catch (e) { fail("craft lab: " + e.message); }

// main.js must start: load it with a stand-in for Electron in a separate process
try {
  const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "load-main.js")], { encoding: "utf8", timeout: 20000 });
  if (r.status !== 0 || !/present\)/.test(r.stdout)) throw new Error((r.stderr || r.stdout || "no output").split("\n").slice(0, 6).join(" | "));
  ok("main.js starts (" + r.stdout.trim().split(":").pop().trim() + ")");
} catch (e) { fail("main.js startup: " + e.message); }

// main.js "app is ready" code, in normal and safe mode (stand-in Electron, temporary folder)
try {
  const os = require("os"), cp = require("child_process");
  const run = (dir, args = []) => { const r = cp.spawnSync(process.execPath, [path.join(__dirname, "load-main.js"), ...args], { encoding: "utf8", timeout: 20000, env: { ...process.env, EC_TEST_DIR: dir } });
    const line = (r.stdout || "").trim().split("\n").pop(); try { return JSON.parse(line); } catch (e) { throw new Error((r.stderr || r.stdout || "no output").slice(0, 300)); } };
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), "ec-ready-"));
  const n = run(d1); assert(n.ready && !n.safe && !n.noGpu, "normal start"); assert(!n.errors.length, "errors while starting: " + n.errors.join(" | "));
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "ec-ready-"));
  const sm = run(d2, ["--safe-mode"]); assert(sm.safe && sm.noGpu && !sm.errors.length, "--safe-mode starts safe without errors: " + sm.errors.join(" | "));
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), "ec-ready-"));
  run(d3); run(d3); const third = run(d3); assert(third.safe, "two unfinished starts lead to safe mode");
  for (const d of [d1, d2, d3]) fs.rmSync(d, { recursive: true, force: true });
  ok("main.js ready code runs clean in normal and safe mode; safe mode follows two unfinished starts");
} catch (e) { fail("main.js ready/safe mode: " + e.message); }

// in-app browser: only allowlisted https sites open inside the app
try {
  const { webHostAllowed } = require(path.join(root, "lib", "webhosts.js"));
  for (const u of ["https://www.pathofexile.com/trade/search/Standard", "https://poe.ninja/economy", "https://www.poewiki.net/wiki/Headhunter", "https://pobb.in/abc"]) assert(webHostAllowed(u), "should allow " + u);
  for (const u of ["http://www.pathofexile.com/", "https://evil-pathofexile.com/", "https://pathofexile.com.evil.io/", "https://user:pw@poe.ninja/", "file:///C:/x", "javascript:alert(1)", "https://example.com/"]) assert(!webHostAllowed(u), "should block " + u);
  const { blockNavigation } = require(path.join(root, "lib", "webhosts.js"));
  assert(!blockNavigation("https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x", false), "frames inside a page (Cloudflare's check) must not be blocked");
  assert(blockNavigation("https://example.com/", true), "the page itself leaving the allowlist is blocked");
  assert(blockNavigation("https://example.com/", undefined), "unknown frame type is treated as the page");
  assert(!blockNavigation("https://www.pathofexile.com/trade", true), "allowlisted page loads");
  const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert(/mediaView = makeWebView\(sendMedia, PROFILES\.media\)/.test(mainSrc), "the media player uses the guarded factory with its own site list");
  assert(/pinView = makeWebView\(sendPin\)/.test(mainSrc) && /webView = makeWebView\(sendMain\)/.test(mainSrc), "both web views use the same guarded factory");
  assert(!/clipHistory[^\n]*(saveCfg|writeFile|store)/.test(mainSrc), "clipboard history stays in memory");
  assert(!/setUserAgent\(/.test(fs.readFileSync(path.join(root, "main.js"), "utf8")), "don't rewrite the browser's user agent: Cloudflare's human check loops when it's changed");
  ok("in-app browser opens only allowlisted https sites; frames such as Cloudflare's check are left alone; user agent untouched");
} catch (e) { fail("web hosts: " + e.message); }

// filter file names: keep NeverSink's apostrophe, never allow folders or non-filter files
try {
  const { safeFilterName } = require(path.join(root, "lib", "files.js"));
  assert.strictEqual(safeFilterName("NeverSink's filter - 2-SEMI-STRICT.filter"), "NeverSink's filter - 2-SEMI-STRICT.filter");
  assert.strictEqual(safeFilterName("..\\..\\Windows\\evil.filter"), "evil.filter");
  assert.strictEqual(safeFilterName("../../etc/passwd"), "");
  assert.strictEqual(safeFilterName('bad<>:"|?*name.filter'), "badname.filter");
  ok("filter file names keep apostrophes and stay inside the filter folder");
} catch (e) { fail("filter names: " + e.message); }

// loot filter editor: parse, round trip, edits, evaluator and re-tiering on a small NeverSink-style filter
try {
  const ctx = { console, S: {}, save() {}, toast() {}, emptyBox: (m) => m, $: () => null, DESK: null };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "filterlab.js"), "utf8"), ctx);
  const T = ctx.FilterLab._test;
  const text = [
    "#===", "# [[3900]] Currency - Regular Currency Tiering", "#===",
    'Show # %D5 $type->currency $tier->t1exalted', '\tClass == "Stackable Currency"', '\tBaseType == "Divine Orb" "Mirror of Kalandra"', "\tSetFontSize 45", "\tSetTextColor 255 0 0 255", "\tPlayAlertSound 6 300", "",
    'Show # %D4 $type->currency $tier->t2divine', '\tClass == "Stackable Currency"', '\tBaseType == "Orb of Annulment" "Exalted Orb"', "\tSetFontSize 45", "",
    'Show # $type->currency $tier->t4chaos', '\tClass == "Stackable Currency"', '\tBaseType == "Chaos Orb" "Orb of Alchemy" "Vaal Orb"', "\tSetFontSize 40", "",
    'Hide # $type->currency $tier->t9armour', '\tClass == "Stackable Currency"', '\tBaseType == "Armourer\'s Scrap"', "\tSetFontSize 30", "",
  ].join("\n");
  const m = T.parse(text);
  assert.strictEqual(m.blocks.length, 4, "should find 4 rules");
  assert.strictEqual(T.serialize(m), text, "an unedited filter must be written back unchanged");
  const ev = (mm, base) => T.evaluate(mm, { name: base, cls: "Stackable Currency", base });
  assert.strictEqual(ev(m, "Divine Orb").block.tags.tier, "t1exalted");
  assert.strictEqual(ev(m, "Armourer's Scrap").vis, "Hide");
  const m2 = T.build(text, [{ k: "vis", b: 3, v: "Show" }, { k: "act", b: 2, key: "PlayEffect", args: ["Red"] }, { k: "act", b: 0, key: "PlayAlertSound", args: null }], "");
  assert.strictEqual(ev(m2, "Armourer's Scrap").vis, "Show", "show/hide edit");
  assert.deepStrictEqual([...ev(m2, "Chaos Orb").style.effect], ["Red"], "beam edit");
  assert(!/PlayAlertSound 6/.test(T.serialize(m2)), "removed sound must be gone");
  const P = { cur: { "Divine Orb": 200, "Mirror of Kalandra": 90000, "Orb of Annulment": 40, "Exalted Orb": 30, "Chaos Orb": 1, "Orb of Alchemy": 150, "Vaal Orb": 1.5, "Armourer's Scrap": 0.02 }, ex: {}, items: {} };
  const plan = T.retierPlan(m, "currency", P);
  assert(plan.moves.some((x) => x.item === "Orb of Alchemy" && x.to.tags.tier !== "t4chaos"), "an expensive item should move up");
  assert(!plan.moves.some((x) => x.item === "Chaos Orb"), "Chaos Orb never moves");
  const m3 = T.build(text, plan.moves.map((x) => ({ k: "move", b: x.from.idx, to: x.to.idx, item: x.item })), "");
  assert.strictEqual(m3.failed, 0, "re-tier moves apply");
  assert.notStrictEqual(ev(m3, "Orb of Alchemy").block.tags.tier, "t4chaos", "moved item is styled by its new tier");
  assert(/^ExileCompanion-/.test(T.saveName("NeverSink's filter - 2-SEMI-STRICT.filter")), "saved name must start with ExileCompanion");
  ok("loot filter editor works (parse, round trip, edits, preview, re-tiering)");
} catch (e) { fail("loot filter: " + e.message); }

// trading tools: map search fragments, number rules, buyout notes
try {
  const ctx = { console, S: {}, save() {}, toast() {}, emptyBox: (m) => m, $: () => null, DESK: null };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "mapmods.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "tradetools.js"), "utf8"), ctx);
  const T = ctx.TradeTools._test, all = ctx.MAPMOD_DATA.mods;
  const chosen = all.filter((f) => /Thorns reflecting|cannot Regenerate|less Recovery Rate of Life|to all maximum Resistances/.test(f.x));
  assert(chosen.length >= 4, "map mods missing");
  const r = T.avoidTokens(chosen, all);
  assert(!r.missed.length, "every chosen mod gets a fragment");
  const norm = (t) => t.toLowerCase().replace(/[+-]?\d+(\.\d+)?/g, "#");
  assert(chosen.every((f) => f.v.every((v) => r.tokens.some((t) => norm(v).includes(t)))), "fragments hit every tier of a chosen mod");
  const clash = all.filter((f) => !chosen.includes(f)).concat(ctx.MAPMOD_DATA.names.map((n) => ({ v: [n] }))).filter((f) => f.v.some((v) => r.tokens.some((t) => norm(v).includes(t))));
  assert(!clash.length, "fragments must not hit other mods or map names: " + JSON.stringify(clash.slice(0, 3)));
  for (const n of [1, 9, 10, 85, 100, 250]) { const re = new RegExp("^" + T.geq(n) + "$"); for (let i = 0; i < 1100; i++) assert.strictEqual(re.test(String(i)), i >= n, `geq(${n}) wrong at ${i}`); }
  assert.strictEqual(T.noteFor(12.7, { div: 200 }, 5).text, "~b/o 12 chaos");
  assert(/divine$/.test(T.noteFor(450, { div: 200 }, 5).text), "large prices are noted in divines");
  assert.strictEqual(T.noteFor(0.5, { div: 200 }, 0), null, "items under 1 chaos get no note");
  // Gwennen: bases with a valuable unique, fragments that hit only those bases and no tooltip words
  const L = (name, baseType, c, extra) => ({ name, baseType, chaosValue: c, ...(extra || {}) });
  const lines = [L("Headhunter", "Leather Belt", 9000), L("Wurm's Molt", "Leather Belt", 1), L("Mageblood", "Heavy Belt", 20000), L("Bisco's Leash", "Heavy Belt", 2),
    L("Kaom's Heart", "Glorious Plate", 300), L("Tabula Rasa", "Simple Robe", 40), L("Belly of the Beast", "Full Wyrmscale", 15),
    L("Lifesprig", "Driftwood Wand", 1), L("Replica Headhunter", "Leather Belt", 500), L("Kaom's Heart", "Glorious Plate", 5000, { links: 6 }),
    L("Ventor's Gamble", "Gold Ring", 30), L("Andvarius", "Gold Ring", 5), L("Le Heup of All", "Iron Ring", 4), L("Relic Thing", "Simple Robe", 900, { detailsId: "relic-thing" })];
  const g = T.gwennenSearch(lines, { min: 100, mode: "any" });
  assert.strictEqual(JSON.stringify(g.picks.map((p) => p.base).sort()), JSON.stringify(["Glorious Plate", "Heavy Belt", "Leather Belt"]), "bases with a unique worth 100c+ (6-links, replicas, relics ignored): " + g.picks.map((p) => p.base));
  const allBases = [...new Set(lines.map((l) => l.baseType))];
  const re = new RegExp(g.strings[0].slice(1, -1), "i");
  for (const b of allBases) assert.strictEqual(re.test(b), ["Glorious Plate", "Heavy Belt", "Leather Belt"].includes(b), "search vs base " + b);
  for (const w of ["Armour: 553", "Item Class: Belts", "Rarity: Unique", "Unidentified", "Requires Level 68", "Chaos Orb"]) assert(!re.test(w), "search must not hit tooltip text: " + w);
  assert.strictEqual(JSON.stringify(T.gwennenSearch(lines, { min: 100, mode: "all" }).picks.map((p) => p.base)), '["Glorious Plate"]', "'every unique' mode");
  const sub = T.gwennenFragment("Ring", ["Gold Ring", "Iron Ring"]); assert(!sub.clean && sub.also.length === 2, "a base inside other bases' names is flagged");
  const many = Array.from({ length: 160 }, (_, i) => L("U" + i, "Base Number " + i + " Thing", i % 2 ? 1 : 500));
  const gm = T.gwennenSearch(many, { min: 100 }); assert(gm.strings.length > 1 && gm.strings.every((x) => x.length <= 250), "long lists split under the 250-character limit");
  const res = gm.strings.map((x) => new RegExp(x.slice(1, -1), "i"));
  for (let i = 0; i < 160; i++) assert.strictEqual(res.some((r) => r.test("Base Number " + i + " Thing")), i % 2 === 0, "split searches hit exactly the wanted bases (" + i + ")");
  // bulk selling: groups the same items (rares skipped), discount, readable post, chat line under 280 characters
  const grp = T.bulkGroups([{ name: "Chaos Shard", qty: 10, total: 5 }, { name: "Chaos Shard", qty: 5, total: 2.5 }, { name: "Divine Orb", qty: 2, total: 400 }, { name: "Rare Ring", qty: 1, total: 50, rare: true }, { name: "Junk", qty: 1, total: null }, { name: "Chaos Orb", qty: 40, total: 40 }]);
  assert.strictEqual(grp.map((g) => g.qty + "x " + g.name).join(","), "2x Divine Orb,15x Chaos Shard", "groups by name; rares, unpriced and Chaos Orbs skipped");
  const post = T.bulkPost(grp, { disc: 10, div: 200, league: "Umbra", ign: "Me", fmt: "tft" });
  assert(/^WTS Umbra \(bulk\)/.test(post) && /2x Divine Orb: 0\.9 div each \(1\.8 div\)/.test(post) && /Total: 1\.8 div, 10% under poe\.ninja \(1 div = 200c\)/.test(post) && /IGN: Me$/.test(post), "TFT post: " + post);
  const many2 = Array.from({ length: 60 }, (_, i) => ({ name: "Some Long Item Name " + i, qty: 3, each: 2, total: 6 }));
  const chat = T.bulkPost(many2, { disc: 0, div: 200, fmt: "chat" }); assert(chat.length <= 280 && /\+more/.test(chat), "chat line fits: " + chat.length);
  ok(`trading tools work (${all.length} map mod families, ${ctx.MAPMOD_DATA.names.length} map names; Gwennen search; bulk posts)`);
} catch (e) { fail("trading tools: " + e.message); }

// league tools: Thread costs, map return, Betrayal board
try {
  const ctx = { console, S: {}, save() {}, toast() {}, emptyBox: (m) => m, $: () => null, DESK: null };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "league.js"), "utf8"), ctx);
  const L = ctx.LeagueTools._test;
  assert.strictEqual(L.MEMBERS.length, 17, "17 Syndicate members");
  assert.strictEqual(L.THREADS.length, 10, "10 Thread types");
  const pr = L.threadPrices({ cur: { "Legion Thread": 5 }, ex: { "Breach Thread": 2 } });
  assert.strictEqual(pr.Legion, 5); assert.strictEqual(pr.Breach, 2); assert.strictEqual(pr.Abyss, null);
  let r = L.planCost({ Legion: 4, Breach: 2 }, pr, {});
  assert.strictEqual(r.total, 6); assert.strictEqual(r.cost, 24); assert(!r.warn.length);
  r = L.planCost({ Legion: 4 }, pr, { free: 2, freeType: "Legion" });
  assert.strictEqual(r.cost, 10, "free Threads come off the cost");
  r = L.planCost({ Legion: 6, Breach: 3 }, pr, {});
  assert(r.warn.length === 1 && /cap of 8/.test(r.warn[0]), "over the cap warns");
  r = L.planCost({ Legion: 10 }, pr, { uv: true });
  assert(!r.warn.length, "Unwavering Vision allows 10 of one type");
  assert(L.planCost({ Legion: 4, Breach: 1 }, pr, { uv: true }).warn.some((w) => /one Thread type/.test(w)));
  assert.deepStrictEqual(Array.from(L.planCost({ Abyss: 1 }, pr, {}).missing), ["Abyss"]);
  const ret = L.mapReturn([{ strat: "Legion", profit: 100, threads: 4, dur: 360000 }, { strat: "Legion", profit: 60, threads: 4 }, { strat: "Harvest", profit: 30, threads: 0 }], 5);
  assert.strictEqual(ret[0].strat, "Legion"); assert.strictEqual(ret[0].avgProfit, 80); assert.strictEqual(ret[0].spend, 20); assert.strictEqual(ret[0].perChaos, 4);
  assert.strictEqual(ret[1].perChaos, null, "no Thread spend gives no ratio");
  for (const [k, p] of Object.entries(L.PRESETS)) for (const [m, d] of Object.entries(p.t)) { assert(L.MEMBERS.includes(m), k + ": unknown member " + m); assert("TFRI".includes(d)); }
  const adv = L.boardAdvice({ Rin: { d: "R", r: 3 }, Riker: { d: "T" }, Tora: { d: "F" } }, { Rin: "R", Riker: "F" });
  const by = Object.fromEntries(adv.map((a) => [a.m, a]));
  assert.strictEqual(by.Rin.ok, true); assert.strictEqual(by.Riker.ok, false); assert(/Fortification/.test(by.Riker.text));
  assert.strictEqual(by.Tora.ok, false, "a member blocking a wanted slot is flagged");
  assert(!/scarab/i.test(L.MEMBERS.map((m) => ["T", "F", "R", "I"].map((d) => L.reward(m, d)).join(" ")).join(" ")), "no Scarab rewards left in 3.30 table");
  assert(L.changed("Rin", "R") && L.changed("Aisling", "I") && !L.changed("Aisling", "R"));
  ok("league tools work (Thread costs, map return, Betrayal board)");
} catch (e) { fail("league tools: " + e.message); }

// build tools: timeless jewels (against the raw table), cluster notables, gem profit
try {
  const zlib = require("zlib");
  const ctx = { console, S: {}, save() {}, toast() {}, emptyBox: (m) => m, $: () => null, DESK: null, atob, DecompressionStream, Response, Blob, Uint8Array };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["timelessdata.js", "clusterdata.js", "buildtools.js"]) vm.runInContext(fs.readFileSync(path.join(appDir, f), "utf8"), ctx);
  const B = ctx.BuildTools._test, T = ctx.TIMELESS;
  assert.deepStrictEqual(Object.keys(T.jewels).sort(), ["Brutal Restraint", "Elegant Hubris", "Heroic Tragedy", "Lethal Pride", "Militant Faith"]);
  assert(B.seedOk(T.jewels["Elegant Hubris"], 2000) && B.seedOk(T.jewels["Elegant Hubris"], 160000) && !B.seedOk(T.jewels["Elegant Hubris"], 2010), "Elegant Hubris seeds step by 20");
  assert(!B.seedOk(T.jewels["Lethal Pride"], 9999) && B.seedOk(T.jewels["Lethal Pride"], 18000));
  assert.deepStrictEqual(Object.assign({}, B.parseTimeless("Carved to glorify 7253 new faithful converted by High Templar Avarius")), { jewel: "Militant Faith", seed: 7253, conq: "Avarius" });
  assert.strictEqual(B.parseTimeless("Commissioned 81320 coins to commemorate Cadiro").jewel, "Elegant Hubris");
  assert.strictEqual(B.parseTimeless("Commanded leadership over 10531 warriors under Akoya").conq, "Akoya");
  assert.strictEqual(B.parseTimeless("Adds 10 to 20 Fire Damage"), null);
  const kinds = {}; let checked = 0;
  for (const [name, j] of Object.entries(T.jewels)) {
    const raw = zlib.inflateSync(Buffer.from(j.data, "base64")); const size = (j.max - j.min) / j.step + 1;
    assert.strictEqual(raw.length, size * T.notables.length, name + " table size");
    for (let k = 0; k < 400; k++) {
      const r = (k * 7919) % T.notables.length, seed = j.min + j.step * ((k * 104729) % size);
      const res = B.lookup(T, raw, name, seed, T.notables[r]);
      const b = raw[r * size + (seed - j.min) / j.step], g = j.l2g[b] != null ? j.l2g[b] : b;
      assert.strictEqual(res.gid, g); assert(res.node && res.node.id, "result has a passive");
      (kinds[name] = kinds[name] || new Set()).add(res.kind); checked++;
    }
  }
  assert.deepStrictEqual([...kinds["Lethal Pride"]], ["add"], "Lethal Pride only adds stats to notables");
  assert.deepStrictEqual([...kinds["Elegant Hubris"]], ["replace"], "Elegant Hubris replaces notables");
  assert(Object.values(T.keystones).every((v) => v && v.n && v.s.length), "every conqueror has a named keystone");
  assert(!B.clusterSuggest({ elems: ["lightning"] }).some((x) => /Resistance/.test(x.name)), "only damage enchants are suggested");
  assert(Object.values(T.jewels).every((j) => j.trade.length === 3));
  pending.push((async () => {
    const r = await B.seedSearch(T, "Militant Faith", Object.keys(T.sockets).find((k) => T.sockets[k].length > 20), ["templar_notable_devotion"], null);
    assert(r.length && r[0].n >= r[r.length - 1].n, "seed search returns ranked seeds");
    ok(`build tools work (${checked} timeless lookups match the raw tables, ${ctx.CLUSTERDATA.notables.length} cluster notables, gem profit)`);
  })().catch((e) => fail("build tools (seed search): " + e.message)));
  const L = B.clusterNotables("affliction_lightning_damage");
  assert(L.length > 5 && L.some((n) => n.n === "Stormrider"), "lightning large cluster notables");
  const sumP = L.filter((n) => n.t === "P").reduce((a, n) => a + n.share, 0); assert(Math.abs(sumP - 1) < 1e-9, "prefix shares add up to 100%");
  assert(B.clusterSuggest({ elems: ["lightning"], minion: false, dot: false }).some((x) => x.name === "Lightning Damage" && x.size === "Large"));
  const gems = B.gemProfits({ "Arc": [{ variant: "1", chaosValue: 1, listingCount: 50 }, { variant: "20", chaosValue: 10, listingCount: 40 }, { variant: "20/20", chaosValue: 30, listingCount: 30 }, { variant: "21/20c", chaosValue: 200, listingCount: 30 }], "Thin": [{ variant: "1", chaosValue: 1, listingCount: 2 }, { variant: "20", chaosValue: 99, listingCount: 2 }] }, 0.5, 10);
  assert.strictEqual(gems.length, 1, "thin markets are filtered out");
  assert.strictEqual(gems[0].profit, 19, "best plan: level 1 to 20/20 with 20 Gemcutter's (30 - 1 - 10)");
  assert.deepStrictEqual(Object.assign({}, B.gemVariant({ variant: "21/20c", chaosValue: 5 })), { lvl: 21, q: 20, c: true, price: 5, n: 0 });
} catch (e) { fail("build tools: " + e.message); }

// look and feel: three themes, early theme script, motion and sound settings
try {
  const css = fs.readFileSync(path.join(appDir, "theme.css"), "utf8"), html = readIndex();
  for (const t of ["minimal", "modern"]) assert(css.includes(`html[data-theme="${t}"]{`), "colour set for " + t);
  assert(/<link rel="stylesheet" href="theme.css">/.test(html), "theme stylesheet linked");
  assert(html.indexOf("document.documentElement.dataset.theme=t") < html.indexOf("<body"), "theme applied before the page paints");
  assert(/prefers-reduced-motion: reduce/.test(html) && /html\.no-motion|html:not\(\.no-motion\)/.test(css), "animations respect reduce motion");
  const { THEMES } = { THEMES: (html.match(/const THEMES=(\[.*?\]\]);/) || [])[1] };
  assert(THEMES && ["minimal", "modern", "poe"].every((k) => THEMES.includes(`"${k}"`)), "settings offer all three themes");
  assert(!/new Audio\(|\.mp3|\.wav/.test(html), "sounds are synthesized, no audio files");
  ok("look and feel: 3 themes, applied before paint, motion respects Windows settings, sounds synthesized");
} catch (e) { fail("look and feel: " + e.message); }

// trade rate limiter and upgrade finder
try {
  const { createLimiter, parseRules, groupOf } = require(path.join(root, "lib", "ratelimit.js"));
  assert.deepStrictEqual(parseRules("8:10:60,15:60:120"), [{ max: 8, period: 10 }, { max: 15, period: 60 }]);
  assert.strictEqual(groupOf("https://www.pathofexile.com/api/trade/search/Standard"), "trade-search");
  assert.strictEqual(groupOf("https://www.pathofexile.com/api/trade/fetch/a,b?query=x"), "trade-fetch");
  let t = 0; const L = createLimiter({ now: () => t });
  L.learn("trade-search", (h) => ({ "x-rate-limit-rules": "Ip", "x-rate-limit-ip": "5:10:60,15:60:120" })[h]);
  for (let i = 0; i < 4; i++) { assert.strictEqual(L.waitFor("trade-search"), 0, "first requests go straight out"); L.sent("trade-search"); t += 100; }
  const w = L.waitFor("trade-search"); assert(w > 9000 && w <= 10100, "waits for the 10 s window before the 5th: " + w);
  t += w; assert.strictEqual(L.waitFor("trade-search"), 0, "free again after the window");
  for (let i = 0; i < 20; i++) { t += L.waitFor("trade-search"); L.sent("trade-search"); }
  const recent = L._groups.get("trade-search").sent.filter((x) => t - x < 60000).length; assert(recent <= 14, "never more than max-1 in the 60 s window: " + recent);
  assert.strictEqual(L.waitFor("trade-fetch"), 0, "groups are paced separately");

  const ctx = { console, S: {}, save() {}, toast() {}, emptyBox: (m) => m, $: () => null, DESK: null };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "upgrades.js"), "utf8"), ctx);
  const U = ctx.Upgrades._test;
  const w1 = U.defaultWeights({ esBased: false, elems: ["lightning"], minion: false }, { res: { fire: 75, cold: 60, lightning: 75, chaos: -30 } }, "Lightning Arrow Mirage Archer Elemental Damage with Attacks");
  assert(w1.life && !w1.es && w1.coldRes > w1.fireRes, "uncapped resistances weigh more");
  assert(w1.atkSpeed && w1.addsLightning && !w1.castSpeed, "attack build gets attack stats");
  const w2 = U.defaultWeights({ esBased: true, elems: ["cold"], minion: false }, { res: {} }, "Frostbolt Controlled Destruction Spell Echo");
  assert(w2.es && w2.castSpeed && w2.incCold && !w2.atkSpeed, "spell ES build gets spell stats");
  const ring = { implicits: [{ text: "+20 to maximum Energy Shield" }], mods: [{ text: "+70 to maximum Life" }, { text: "+40 to Strength" }, { text: "+12% to all Elemental Resistances" }, { text: "+30% to Fire and Cold Resistances" }, { text: "Adds 10 to 50 Lightning Damage to Attacks" }, { text: "+15% to Cold and Chaos Resistances" }] };
  const sc = U.score(U.itemLines(ring), { life: 1, fireRes: 1, coldRes: 1, lightningRes: 1, chaosRes: 1, addsLightning: 2 }, "Ring 1");
  assert.strictEqual(sc.parts.life, 90, "life includes half of strength");
  assert.deepStrictEqual([sc.parts.fireRes, sc.parts.coldRes, sc.parts.lightningRes, sc.parts.chaosRes], [42, 57, 12, 15], "resistances count dual and all-res mods");
  assert.strictEqual(sc.parts.addsLightning, 30, "added damage uses the average");
  assert.strictEqual(sc.total, 90 + 42 + 57 + 12 + 15 + 60);
  assert.strictEqual(U.score(["30% increased Movement Speed"], { move: 2 }, "Gloves").total, 0, "movement speed only counts on boots");
  const { q, used } = U.query({ life: "pseudo.pseudo_total_life", fireRes: "pseudo.x" }, { life: 1, fireRes: 1.2, move: 2 }, "Helmet", "armour.helmet", 120.4, 3);
  assert.strictEqual(used, 2, "only stats with a trade id and allowed on the slot are searched");
  assert.strictEqual(q.query.stats[0].type, "weight"); assert.strictEqual(q.query.stats[0].value.min, 120);
  assert.strictEqual(q.query.filters.trade_filters.filters.price.max, 3);
  const P = { div: 200, cur: { "Exalted Orb": 10 } };
  const ranked = U.rank([{ item: { name: "A", typeLine: "Ring", explicitMods: ["+80 to maximum Life"] }, listing: { price: { amount: 1, currency: "divine" } } }, { item: { name: "B", typeLine: "Ring", explicitMods: ["+60 to maximum Life"] }, listing: { price: { amount: 20, currency: "chaos" } } }, { item: { name: "C", typeLine: "Ring", explicitMods: ["+10 to maximum Life"] }, listing: { price: { amount: 1, currency: "chaos" } } }], { life: 1 }, "Ring 1", 40, P);
  assert.deepStrictEqual(ranked.map((r) => r.name), ["B Ring", "A Ring"], "ranked by gain per divine; worse items dropped");
  assert.strictEqual(U.toChaos({ amount: 3, currency: "exalted" }, P), 30);
  ok("trade requests are paced by GGG's rules; upgrade finder scores, searches and ranks correctly");
} catch (e) { fail("upgrade finder: " + e.message); }

// media: mini player sites and the Windows "now playing" bridge (with a stand-in for PowerShell)
try {
  const { mediaHostAllowed, webHostAllowed } = require(path.join(root, "lib", "webhosts.js"));
  for (const u of ["https://www.youtube.com/watch?v=x", "https://music.youtube.com/", "https://www.twitch.tv/x", "https://accounts.google.com/signin"]) assert(mediaHostAllowed(u), "player allows " + u);
  for (const u of ["https://www.netflix.com/", "https://www.hulu.com/", "https://music.apple.com/", "https://web.stremio.com/", "https://www.pathofexile.com/trade", "http://www.youtube.com/"]) assert(!mediaHostAllowed(u), "player blocks " + u);
  assert(!webHostAllowed("https://www.youtube.com/"), "the Path of Exile browser doesn't open media sites");
  const { createMedia, appName } = require(path.join(root, "lib", "media.js"));
  assert.strictEqual(createMedia({ platform: "linux" }).now instanceof Function, true);
  const { EventEmitter } = require("events");
  let fake, written = [], args = null;
  const spawnFn = (cmd, a) => { args = a; fake = new EventEmitter(); fake.stdout = new EventEmitter(); fake.stdout.setEncoding = () => {}; fake.stderr = new EventEmitter();
    fake.stdin = { write: (x) => { written.push(x.trim()); const c = x.trim();
      setTimeout(() => fake.stdout.emit("data", c === "quit" ? "" : JSON.stringify({ app: "Spotify.exe", title: "Song", artist: "Band", status: c === "toggle" ? "Paused" : "Playing", canNext: true, canPrev: true }) + "\r\n"), 5); } };
    fake.kill = () => {}; setTimeout(() => fake.stdout.emit("data", '{"ready":true}\r\n'), 1); return fake; };
  const M = createMedia({ platform: "win32", spawnFn });
  pending.push((async () => {
    const a = await M.now(); assert.strictEqual(a.title, "Song"); assert.strictEqual(a.appName, "Spotify"); assert.strictEqual(a.status, "Playing");
    const b = await M.command("toggle"); assert.strictEqual(b.status, "Paused");
    const c = await M.command("rm -rf"); assert(c.error, "unknown commands are refused");
    assert(args.includes("-EncodedCommand") && !written.some((w) => w.length > 20), "script goes in encoded; stdin only carries short commands");
    assert(!written.includes("rm -rf"));
    M.stop();
    ok("media: player limited to non-DRM sites; Windows now-playing bridge answers, controls and refuses unknown commands");
  })().catch((e) => fail("media bridge: " + e.message)));
  assert.strictEqual(createMedia({ platform: "darwin" }) && appName("AppleInc.AppleMusicWin_x!App"), "Apple Music");
} catch (e) { fail("media: " + e.message); }

// index.html: nothing at the top level uses DESK before it is declared (that stops the whole page)
try {
  const html = readIndex();
  const at = html.indexOf("const DESK=");
  const before = html.slice(0, at).split("\n").filter((l) => /^(if\s*\(\s*DESK|DESK\.|addEventListener\([^)]*DESK)/.test(l));
  assert(at > 0 && !before.length, "top-level DESK use before its declaration: " + before.map((l) => l.slice(0, 60)).join(" | "));
  for (const name of ["UI", "GAME"]) {
    const decl = html.indexOf(`const ${name}=`); assert(decl > 0, name + " declared");
    const early = html.slice(0, decl).split("\n").filter((l) => new RegExp(`^(if\\s*\\(\\s*!?${name}\\.|${name}\\.[a-z]+\\s*=)`).test(l));
    assert(!early.length, `top-level ${name} use before its declaration: ` + early.map((l) => l.slice(0, 60)).join(" | "));
  }
  ok("index.html declares DESK, UI and GAME before any top-level use");
} catch (e) { fail("index.html load order: " + e.message); }

// league data published in the repo (data/league.json): valid, not older than the built-in copy, and applied safely
try {
  const ctx = { console, S: {}, save() {}, toast() {}, emptyBox: (m) => m, $: () => null, DESK: null };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(appDir, "league.js"), "utf8"), ctx);
  const L = ctx.LeagueTools._test;
  const pub = JSON.parse(fs.readFileSync(path.join(root, "data", "league.json"), "utf8"));
  assert(L.validData(pub), "data/league.json has the expected shape");
  assert(pub.v >= L.BUILT_V, `data/league.json (${pub.v}) is not older than the app's built-in data (${L.BUILT_V})`);
  const clone = () => JSON.parse(JSON.stringify(pub));
  let bad = clone(); bad.threads = "Legion"; assert(!L.validData(bad), "threads must be a list");
  bad = clone(); bad.syn.Rin.R = { html: "<b>" }; assert(!L.validData(bad), "rewards must be text");
  bad = clone(); bad.presets.x = { name: "X", t: { Nobody: "R" } }; assert(!L.validData(bad), "presets only name real members");
  bad = clone(); bad.v = "yesterday"; assert(!L.validData(bad), "version must be a date");
  const older = clone(); older.v = "2026-01-01"; assert(!L.applyData(older), "older data is ignored");
  const newer = clone(); newer.v = "2099-01-01"; newer.threads = newer.threads.concat(["Delve"]); newer.syn.Rin.R = "Updated reward";
  assert(L.applyData(newer, "test"), "newer valid data is applied");
  assert(L.cur().THREADS.includes("Delve") && L.reward("Rin", "R") === "Updated reward", "the page uses the new data");
  ok(`league data: data/league.json (${pub.v}) is valid; newer data applies, bad or older data is ignored`);
} catch (e) { fail("league data: " + e.message); }

// trade companion hints and vendor recipe sets (functions pulled out of index.html into a sandbox)
try {
  const html = readIndex();
  const cut = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a + 1); assert(a > 0 && b > a, "section " + from); return html.slice(a, b); };
  const fam = cut("const BASE_FAMILY=", "\nfunction stashFinds");
  const code = fam + "\n" + cut("/* ---------- trades (log whispers) ----------", "/* ---------- reminders (notifications) ---------- */");
  const ctx = { console, S: {}, fmt: (v) => String(Math.round(v)), stripTags: (x) => x, esc: (x) => x, $: () => null, ACCT: {}, DESK: null };
  vm.createContext(ctx);
  vm.runInContext(code + "\n;this.__t={recipeSets,recipeSlot,fairHint,tradeCmds,fillReply,quadTab,latestStashTrade,TRADES,chatRules,chatMatch};", ctx);
  const T = ctx.__t;
  // stash highlight: quad tabs by name, and the latest trade with a position (a buyer who has arrived comes first)
  ctx.S.quadTabs = ["Sell"]; assert(T.quadTab("sell") && !T.quadTab("Dump"), "quad tabs by name, any case");
  T.TRADES.push({ name: "a", t: 1, tab: "x", left: 1, top: 1 }, { name: "b", t: 3, tab: "x", left: 2, top: 2 }, { name: "c", t: 2, tab: "x", left: 3, top: 3, joined: true }, { name: "d", t: 9 });
  assert.strictEqual(T.latestStashTrade().name, "c", "a buyer in your hideout comes first"); T.TRADES.length = 0;
  // chat scanner rules
  const R = T.chatRules(["Mageblood -wtb", "carry", "/\\bmirror (service|tier)\\b/", "/[broken/"]);
  const C = { on: true, ch: { trade: true, global: true }, ignore: ["Spammer"] };
  const m = (ch, name, text) => T.chatMatch({ type: "chat", ch, name, text }, C, R);
  assert.strictEqual(m("trade", "A", "WTS Mageblood 150 div"), "Mageblood");
  assert.strictEqual(m("trade", "A", "WTB mageblood"), null, "-word excludes");
  assert.strictEqual(m("global", "B", "selling CARRY for uber elder"), "carry", "any case");
  assert.strictEqual(m("global", "B", "mirror service open"), "/\\bmirror (service|tier)\\b/", "regex keywords");
  assert.strictEqual(m("local", "B", "carry"), null, "channels you didn't pick are skipped");
  assert.strictEqual(m("trade", "Spammer", "carry"), null, "ignored names");
  ctx.S.logChar = "Me"; assert.strictEqual(m("trade", "Me", "carry"), null, "your own messages"); ctx.S.logChar = null;
  assert.strictEqual(T.chatMatch({ type: "chat", ch: "trade", name: "A", text: "carry" }, { ...C, on: false }, R), null, "off means off");
  const P = { cur: { "Chaos Orb": 1, "Divine Orb": 200 }, ex: { "Divine Orb": 200 }, items: { "Headhunter": [{ chaosValue: 3000 }] } };
  assert.strictEqual(T.fairHint({ dir: "in", bulk: true, item: "10 Divine Orb", amount: "1500", currency: "Chaos Orb" }, P).cls, "bad", "bulk offer 25% under is flagged");
  assert.strictEqual(T.fairHint({ dir: "in", bulk: true, item: "1 Divine Orb", amount: "205", currency: "Chaos Orb" }, P).cls, "", "fair bulk offer");
  assert(/under poe.ninja/.test(T.fairHint({ dir: "in", item: "Headhunter Leather Belt", amount: "5", currency: "divine" }, { ...P, items: { "Headhunter Leather Belt": [{ chaosValue: 3000 }] } }).text), "underpriced listing is flagged");
  assert.strictEqual(T.fairHint({ dir: "in", item: "Some Rare", amount: "5", currency: "chaos" }, P), null, "no hint without a market price");
  assert.strictEqual(T.fillReply("@{name} {item} for {price}", { name: "Bob", item: "Doom Loop", amount: "3", currency: "divine" }), "@Bob Doom Loop for 3 divine");
  assert(T.tradeCmds({ dir: "out", name: "Seller", item: "X" }).some(([l, c]) => c === "/hideout Seller"), "buying gets a hideout button");
  const W = (name, ilvl, unid, extra) => ({ slot: name, ilvl, unid: !!unid, ...(extra || {}) });
  const full = (ilvl, unid) => ["helmet", "body", "gloves", "boots", "belt", "amulet", "ring", "ring", "weapon2"].map((s) => W(s, ilvl, unid));
  let r = T.recipeSets([...full(65, true), ...full(80, false)]);
  assert.strictEqual(r.chaos.length, 1); assert.strictEqual(r.regal.length, 1); assert(r.chaos[0].unid && !r.regal[0].unid);
  r = T.recipeSets(full(70, false).filter((x) => x.slot !== "gloves"));
  assert.strictEqual(r.sets.length, 0); assert.deepStrictEqual(Array.from(r.missing), ["gloves"]);
  r = T.recipeSets([...full(70).filter((x) => x.slot !== "weapon2"), W("weapon1", 70), W("shield", 70)]);
  assert.strictEqual(r.sets.length, 1, "one-hander plus shield counts as the weapon");
  r = T.recipeSets(full(55));
  assert.strictEqual(r.sets.length, 0, "below item level 60 doesn't count");
  assert.strictEqual(T.recipeSlot({ baseType: "Two-Stone Ring" }), "ring");
  assert.strictEqual(T.recipeSlot({ baseType: "Thicket Bow", properties: [{ name: "Bow" }] }), "weapon2");
  assert.strictEqual(T.recipeSlot({ baseType: "Vaal Regalia", w: 2, h: 3, properties: [{ name: "Energy Shield" }] }), "body");
  ok("trade companion price hints and quick replies; chaos/regal recipe sets counted correctly");
} catch (e) { fail("trade companion / recipes: " + e.message); }

// GGG developer guidelines: no background clipboard polling, required disclaimer shown, no credentials in code
try {
  const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8"), html = readIndex();
  assert(!/setInterval\([^)]*clip/i.test(mainSrc) && !/clipWatch\.poll\(/.test(mainSrc), "the clipboard is never read on a timer");
  assert(/bind\(cfg\.priceHotkey[\s\S]{0,80}clipRead\(\)/.test(mainSrc), "price checks read the clipboard from the hotkey");
  assert(html.includes("This product isn't affiliated with or endorsed by Grinding Gear Games in any way."), "GGG's disclaimer is shown in the app");
  assert(/oauthClientId: ""/.test(mainSrc) && !/client_secret/.test(mainSrc + fs.readFileSync(path.join(root, "lib", "ggg.js"), "utf8")), "no OAuth client id or secret is shipped in code");
  ok("GGG guidelines: clipboard read once per key press, disclaimer shown, no credentials in code");
} catch (e) { fail("GGG guidelines: " + e.message); }

// new leagues: league picker, and data/game.json (patch label, strategies, tips, map-mod wording) validated and applied safely
try {
  const { pickLeague } = require(path.join(root, "lib", "league.js"));
  const L = (ids) => ids.map((id) => ({ id, realm: "pc" }));
  assert.strictEqual(pickLeague(L(["Umbra", "Hardcore Umbra", "Standard", "Hardcore"]), {}).league, "Umbra", "first run picks the softcore challenge league");
  assert.strictEqual(pickLeague(L(["Ashes", "Hardcore Ashes", "Standard"]), { current: "Umbra", lastChallenge: "Umbra" }).league, "Ashes", "an ended league moves to the new one");
  assert.strictEqual(pickLeague(L(["Ashes", "Umbra", "Standard"]), { current: "Umbra", lastChallenge: "Umbra" }).reason, "launched", "a new launch is followed");
  assert.strictEqual(pickLeague(L(["Ashes", "Standard"]), { current: "Standard", lastChallenge: "Umbra" }).league, "Standard", "a deliberate Standard choice is kept");
  assert.strictEqual(pickLeague(L(["Ashes", "Standard"]), { current: "Umbra", lastChallenge: "Umbra", pinned: true }).league, "Umbra", "a pinned league is kept");
  assert.strictEqual(pickLeague(L(["SSF Ashes", "Ruthless Ashes", "Ashes"]), {}).league, "Ashes", "SSF and Ruthless are skipped");
  assert.strictEqual(pickLeague([], { current: "Umbra" }).league, "Umbra", "offline or empty list keeps the current league");
  const html = readIndex();
  const grab = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a + 1); assert(a > 0 && b > a, "section " + from); return html.slice(a, b); };
  const tables = ["MAPMODS", "STRATS", "PROGRESS"].map((n) => { const a = html.indexOf(`const ${n}=[`); return html.slice(a, html.indexOf("\n];", a) + 3); }).join("\n");
  const mod = grab("/* ---------- game data: patch label", "// announcements from data/game.json");
  const ctx = { console, S: {}, LIVE: { cfg: {} }, $: () => null, document: { title: "" }, DESK: null, store: { get: () => null, set() {} }, renderAll() {} };
  vm.createContext(ctx);
  vm.runInContext(tables + "\n" + mod + "\n;this.__g={GAME,validGame,applyGame,STRATS,PROGRESS,MAPMODS};", ctx);
  const G = ctx.__g;
  const pub = JSON.parse(fs.readFileSync(path.join(root, "data", "game.json"), "utf8"));
  assert(G.validGame(pub), "data/game.json has the expected shape");
  assert(pub.v >= G.GAME.v, "data/game.json is not older than the built-in data");
  assert.strictEqual(pub.strats.length, G.STRATS.length, "data/game.json has every built-in strategy");
  const c = () => JSON.parse(JSON.stringify(pub));
  let bad = c(); bad.patch = "next"; assert(!G.validGame(bad), "patch must look like 3.31");
  bad = c(); bad.strats[0].threads = { Legion: "<img>" }; assert(!G.validGame(bad), "thread counts must be numbers");
  bad = c(); bad.notices = [{ id: "x", title: "Hi", body: "B", level: "script" }]; assert(!G.validGame(bad), "notice levels are limited");
  bad = c(); bad.mapmods.physref = { label: { a: 1 } }; assert(!G.validGame(bad), "map-mod text must be text");
  const next = c(); next.v = "2099-01-01"; next.patch = "3.31"; next.name = "Next League"; next.strats[0].name = "Legion (3.31)"; next.progressTips.p6 = "New tip"; next.mapmods.physref.frag = "reflect phys";
  next.notices = [{ id: "331", title: "3.31 is live", body: "Data is being updated.", level: "info" }];
  assert(G.applyGame(next, "test"), "newer valid data applies");
  assert.strictEqual(G.GAME.patch, "3.31"); assert.strictEqual(G.STRATS[0].name, "Legion (3.31)");
  assert.strictEqual(G.PROGRESS.find((p) => p.id === "p6").tip, "New tip"); assert.strictEqual(G.MAPMODS.find((m) => m.id === "physref").frag, "reflect phys");
  assert.strictEqual(typeof G.MAPMODS.find((m) => m.id === "physref").when, "function", "map-mod rules keep their build checks");
  const old = c(); old.v = "2000-01-01"; assert(!G.applyGame(old), "older data is ignored");
  assert(!/<title>Exile Companion 3\.30<\/title>/.test(html) || /document\.title=`Exile Companion \$\{GAME\.patch\}`/.test(html), "window title follows the game data");
  ok("new leagues: league picker follows launches (unless pinned); data/game.json valid, newer data applies, bad or older data is ignored");
} catch (e) { fail("new leagues: " + e.message); }

// data pipeline: sources.json matches the version labels inside the shipped data; keep-if-same restores label-only changes
try {
  const src = JSON.parse(fs.readFileSync(path.join(root, "data", "sources.json"), "utf8"));
  const label = (f, v) => { const s = fs.readFileSync(path.join(appDir, f), "utf8"); const m = s.match(new RegExp('"v":"([^"]+)"')); return m && m[1]; };
  assert.strictEqual(label("treedata.js"), src.skilltree, "treedata.js version matches data/sources.json");
  assert.strictEqual(label("atlasdata.js"), src.atlastree, "atlasdata.js version matches");
  assert.strictEqual(label("craftdata.js"), src.repoe, "craftdata.js version matches");
  assert.strictEqual(label("mapmods.js"), src.repoe, "mapmods.js version matches");
  for (const s of ["scripts/update-data.sh", "scripts/trees.py", "scripts/keep-if-same.py", ".github/workflows/data-update.yml"]) assert(fs.existsSync(path.join(root, s)), s + " exists");
  const wf = fs.readFileSync(path.join(root, ".github", "workflows", "data-update.yml"), "utf8");
  assert(/schedule:/.test(wf) && /npm run check/.test(wf) && /gh pr create/.test(wf), "weekly workflow runs the checks and opens a pull request");
  assert(!/uses: [^@\s]+@(v\d|main|master)\b/.test(wf), "workflow actions are pinned to commits");
  const { execFileSync } = require("child_process");
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "kis-")); fs.mkdirSync(path.join(tmp, "b"));
  fs.writeFileSync(path.join(tmp, "b", "x.js"), 'window.X={"v":"1","a":1};\n'); fs.writeFileSync(path.join(tmp, "x.js"), 'window.X={"v":"2","a":1};\n');
  fs.writeFileSync(path.join(tmp, "b", "y.js"), 'window.Y={"v":"1","a":1};\n'); fs.writeFileSync(path.join(tmp, "y.js"), 'window.Y={"v":"2","a":2};\n');
  try { execFileSync("python3", [path.join(root, "scripts", "keep-if-same.py"), path.join(tmp, "b"), path.join(tmp, "x.js"), path.join(tmp, "y.js")], { stdio: "pipe" });
    assert(fs.readFileSync(path.join(tmp, "x.js"), "utf8").includes('"v":"1"'), "a label-only change is put back");
    assert(fs.readFileSync(path.join(tmp, "y.js"), "utf8").includes('"v":"2"'), "a real change is kept");
    const zlib = require("zlib"), raw = Buffer.from("same table");
    fs.writeFileSync(path.join(tmp, "b", "z.js"), "window.Z=" + JSON.stringify({ v: "1", j: { a: { data: zlib.deflateSync(raw, { level: 9 }).toString("base64") } } }) + ";\n");
    fs.writeFileSync(path.join(tmp, "z.js"), "window.Z=" + JSON.stringify({ v: "2", j: { a: { data: zlib.deflateSync(raw, { level: 1 }).toString("base64") } } }) + ";\n");
    execFileSync("python3", [path.join(root, "scripts", "keep-if-same.py"), path.join(tmp, "b"), path.join(tmp, "z.js")], { stdio: "pipe" });
    assert(fs.readFileSync(path.join(tmp, "z.js"), "utf8").includes('"v":"1"'), "the same table compressed differently counts as unchanged");
  } catch (e) { if (e.code === "ENOENT") console.log("  (python3 not found: keep-if-same not exercised)"); else throw e; }
  ok("data pipeline: data/sources.json matches the shipped data; weekly workflow pinned and checked; label-only changes are ignored");
} catch (e) { fail("data pipeline: " + e.message); }

// crash log and safe-mode guard
try {
  const os = require("os");
  const { createLog, startupGuard } = require(path.join(root, "lib/crashlog"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ec-log-"));
  const L = createLog(dir, { maxBytes: 300, redact: (s) => s.replace(/secret/g, "[x]") });
  L.error("index.html", "boom secret"); L.error("index.html", "boom secret"); L.error("index.html", "boom secret"); L.info("app", "next");
  const lines = L.tail(10);
  assert(lines.some((l) => /ERROR index.html: boom \[x\]/.test(l)), "log line written and redacted");
  assert(lines.some((l) => /repeated 2 more times/.test(l)), "repeats collapsed");
  for (let i = 0; i < 20; i++) L.warn("t", "line " + i);
  assert(fs.existsSync(path.join(dir, "app.old.log")) && fs.statSync(path.join(dir, "app.log")).size < 400, "log rotates");
  assert(L.tail(5).length === 5 && /line 19/.test(L.tail(1)[0]), "tail returns newest last");
  const gf = path.join(dir, "starting.json");
  let g = startupGuard(gf); assert(!g.unsafe && g.fails === 0, "first start is normal");
  g = startupGuard(gf); assert(g.fails === 1 && !g.unsafe, "one unfinished start");
  g = startupGuard(gf); assert(g.unsafe, "two unfinished starts -> safe mode");
  g.started(); g = startupGuard(gf); assert(!g.unsafe && g.fails === 0, "a finished start resets");
  const bad = createLog(path.join(gf, "nope"), {}); bad.error("x", "y"); assert(Array.isArray(bad.tail()), "an unusable log folder never throws");
  fs.rmSync(dir, { recursive: true, force: true });
  ok("crash log: redaction, repeats, rotation; safe mode after two unfinished starts");
} catch (e) { fail("crash log: " + e.message); }

// accessibility options reach every app window; good/bad colors come from variables so colorblind mode applies
try {
  for (const f of ["index.html", "price.html", "overlay.html"]) {
    const h = (f === "index.html" ? readIndex() : fs.readFileSync(path.join(root, "app", f), "utf8"));
    assert(h.includes('html[data-cb="1"][data-cb]') && h.includes("window.__applyA11y"), f + " has the accessibility options");
    assert(!/#71c27a(22|66)|#e0584b(22|66)|style="color:#(71c27a|e0584b)"/.test(h), f + " hardcodes good/bad colors");
  }
  const h = readIndex();
  assert(/class="skip" href="#main"/.test(h) && /<main id="main"/.test(h), "skip link");
  for (const f of ["index.html", "price.html", "overlay.html"]) assert(/d\.setZoom\(1\);h\.style\.zoom=/.test((f === "index.html" ? readIndex() : fs.readFileSync(path.join(root, "app", f), "utf8"))), f + " uses CSS zoom and resets Electron zoom");
  assert(fs.readFileSync(path.join(root, "app", "overlay.html"), "utf8").includes("u.overlayScale"), "overlay has its own text size");
  const rel = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert(rel.indexOf("smoke-windows.ps1") > 0 && rel.indexOf("smoke-windows.ps1") < rel.indexOf("gh release create"), "release runs the Windows test before publishing");
  // a saved state with parts missing still gets every default
  const m = h.match(/const S_DEFAULT=[\s\S]*?return s\}\)\(\);/); assert(m, "state loader found");
  const run = (saved) => vm.runInNewContext(m[0] + ";S", { store: { get: () => saved } });
  for (const saved of [null, {}, { ui: { scale: 125 } }, { progress: null, session: { maps: "x" } }, [1, 2]]) { const st = run(saved); assert(st.progress && typeof st.progress === "object" && Array.isArray(st.session.maps), "defaults for " + JSON.stringify(saved)); }
  assert(run({ progress: { p1: true }, divine: 200 }).progress.p1 === true && run({ divine: 200 }).divine === 200, "keeps saved values");
  ok("accessibility options in all windows, colors via variables, skip link; damaged saves get defaults");
} catch (e) { fail("accessibility: " + e.message); }

// characters: per-character keys never include shared (economy, settings) data; other characters' log events aren't recorded
try {
  const h = readIndex();
  const m = h.match(/const CHAR_KEYS=\[([^\]]+)\]/); assert(m, "CHAR_KEYS found");
  const keys = m[1].replace(/["\s]/g, "").split(",");
  for (const shared of ["ui", "divine", "netWorth", "trade", "tradeSaved", "sales", "watch", "league", "hints", "tourDone", "unlocked"]) assert(!keys.includes(shared), shared + " must stay shared");
  for (const own of ["progress", "campAct", "have", "atlasHashes", "mapsDone", "logChar", "session"]) assert(keys.includes(own), own + " must be per character");
  assert(/e\.type==="level"&&charFromLog\(e\.name\)\)\{/.test(h), "level events of another character are skipped");
  assert(!/\bprompt\(/.test(h.replace(/aria-label="[^"]*"/g, "")), "no window.prompt (Electron doesn't support it)");
  ok("characters: per-character data only, other characters' log events skipped, no prompt()");
} catch (e) { fail("characters: " + e.message); }

// fonts are bundled: no page loads anything from Google, and the license files ship with them
try {
  for (const f of fs.readdirSync(path.join(root, "app")).filter((x) => x.endsWith(".html"))) {
    const h = (f === "index.html" ? readIndex() : fs.readFileSync(path.join(root, "app", f), "utf8"));
    assert(!/fonts\.(googleapis|gstatic)\.com/.test(h), f + " still loads Google Fonts");
  }
  for (const f of ["Cinzel.woff", "SourceSans3.ttf", "OFL-Cinzel.txt", "OFL-SourceSans3.txt"]) assert(fs.statSync(path.join(root, "app", "fonts", f)).size > 1000, f);
  ok("fonts bundled (no Google Fonts requests), with their licenses");
} catch (e) { fail("fonts: " + e.message); }

// price popup: a newer check makes older ones stale; inside check() every render goes through the guard
try {
  const h = fs.readFileSync(path.join(root, "app", "price.html"), "utf8");
  const k = h.indexOf("async function check(text){"), e = h.indexOf('$("close").onclick', k), body = h.slice(k, e);
  assert(/const g=\+\+GEN,live=\(\)=>g===GEN,R=st=>renderIf\(g,st\)/.test(body), "check() numbers itself");
  const bare = [...body.matchAll(/(?<![\w.])render\(/g)].map((m) => body.slice(m.index - 40, m.index + 20));
  assert(bare.every((x) => /parseItem\(text\)\}catch|if\(LAST_STATE\)render/.test(x)), "unguarded render in check(): " + bare.join(" | "));
  assert(/PBX=r&&!r\.skip&&!r\.off\?r:null;if\(LAST_STATE\)render/.test(body) && /if\(!live\(\)\)return;PBX=/.test(body), "Path of Building result only lands on the current check");
  assert(/if\(g!==GEN\)throw new Error\(STALE\)/.test(h) && /reused/.test(h), "stale trade requests stop; re-shown items aren't searched again");
  assert(/ipcMain\.handle\("trade:wait"/.test(fs.readFileSync(path.join(root, "main.js"), "utf8")), "rate-limit wait is reported");
  ok("price popup: newer checks win, stale ones stop, no repeat search without a new item");
} catch (e) { fail("price popup: " + e.message); }

// QR code for the phone link: the same grids that were checked by decoding them with OpenCV
try {
  const { qrMatrix, qrSvg } = require(path.join(root, "lib", "qr.js"));
  const h = (m) => require("crypto").createHash("sha256").update(m.map((r) => r.map((x) => (x ? 1 : 0)).join("")).join("\n")).digest("hex").slice(0, 16);
  const cases = [["http://192.168.1.23:47778/?k=Abc123XyZ987Qwe456Rt", 33, "347e6883ff7b3134"], ["http://192.168.100.200:47778/?k=" + "x".repeat(60), 41, "f235e0cb4835adf2"]];
  for (const [t, n, hash] of cases) { const m = qrMatrix(t); assert.strictEqual(m.length, n, "size"); assert.strictEqual(h(m), hash, "grid changed for " + t.slice(0, 30)); }
  assert(/^<svg [^>]*viewBox/.test(qrSvg("hi")), "svg");
  let threw = false; try { qrMatrix("x".repeat(400)); } catch (e) { threw = true; } assert(threw, "too-long text is refused");
  ok("QR code encoder matches the decoded reference grids");
} catch (e) { fail("QR code: " + e.message); }

// Twitch: IRC parsing (tags, replies), command replies, switches, mods-only, cooldowns, no answering ourselves
try {
  const T = require(path.join(root, "lib", "twitch.js"));
  const m = T.parseIrc("@badges=moderator/1;id=abc-1;display-name=Viewer\\sOne;mod=1 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #me :!build please");
  assert(m.command === "PRIVMSG" && m.nick === "viewer" && m.tags.id === "abc-1" && m.tags["display-name"] === "Viewer One" && m.trailing === "!build please" && m.params[0] === "#me", "IRC parse: " + JSON.stringify(m));
  assert.strictEqual(T.parseIrc("PING :tmi.twitch.tv").command, "PING");
  const d = { overlay: { char: { name: "MyRanger", level: 94 }, eta: "1h 20m", zone: { name: "Cemetery", lvl: 83 }, maps: { current: { name: "Cemetery", tier: 16, deaths: 2 }, session: { count: 14, avgMs: 245000, div: 3.4 } }, pages: { session: { net: 152.3 } } },
    stream: { cls: "Deadeye", skill: "Lightning Arrow", link: "https://pobb.in/abc", deaths: 3, league: "Umbra" } };
  const say = (c, o) => T.replyFor(c, d, o || {});
  assert.strictEqual(say("build"), "Deadeye, Lightning Arrow · https://pobb.in/abc");
  assert.strictEqual(say("level"), "MyRanger is level 94, next level in about 1h 20m.");
  assert.strictEqual(say("map"), "Cemetery (tier 16), 2 deaths.");
  assert.strictEqual(say("deaths"), "3 deaths this session.");
  assert(/^14 maps this session, 4 min each on average, about 3\.4 divine\/hour · net worth 152\.3 divine\.$/.test(say("profit")), say("profit"));
  assert.strictEqual(say("commands", { custom: [{ name: "discord", text: "x" }] }), "Commands: !build !level !map !deaths !profit !league !discord");
  const msg = (text, extra) => T.parseIrc(`@id=m1${extra || ""} :v!v@v PRIVMSG #me :${text}`);
  const st = {}; let now = 1e9;
  assert.strictEqual(T.handleMessage(msg("!map"), d, {}, st, now).text, "Cemetery (tier 16), 2 deaths.");
  assert.strictEqual(T.handleMessage(msg("!map"), d, {}, st, now + 3000), null, "cooldown");
  assert(T.handleMessage(msg("!level"), d, {}, st, now + 3000), "other commands still answer");
  assert.strictEqual(T.handleMessage(msg("!level"), d, {}, st, now + 3500), null, "1.5 s between any replies / cooldown");
  assert.strictEqual(T.handleMessage(msg("!deaths"), d, { cmds: { deaths: false } }, {}, now), null, "switched off");
  assert.strictEqual(T.handleMessage(msg("!build"), d, { modsOnly: true }, {}, now), null, "mods only: viewer ignored");
  assert(T.handleMessage(msg("!build", ";mod=1"), d, { modsOnly: true }, {}, now), "mods only: mod answered");
  assert.strictEqual(T.handleMessage(msg("!build"), d, { self: "v" }, {}, now), null, "never answers itself");
  assert.strictEqual(T.handleMessage(msg("!discord"), d, { custom: [{ name: "discord", text: "Join\nus" }] }, {}, now).text, "Join us", "custom commands, newlines removed");
  assert.strictEqual(T.handleMessage(msg("hello !build"), d, {}, {}, now), null, "only messages that start with a command");
  assert.strictEqual(T.handleMessage(msg("!unknown"), d, {}, {}, now), null);
  ok("Twitch: chat parsing, replies, switches, mods-only, cooldowns");
} catch (e) { fail("Twitch: " + e.message); }

// Path of Building numbers: slots by item class, finding the install, the background-process protocol, summaries
pending.push((async () => {
  try {
    const os = require("os"), L = require(path.join(root, "lib", "pob.js"));
    const sl = (c) => L.slotsFor(`Item Class: ${c}\nRarity: Rare\nX`).join(",");
    assert.strictEqual(sl("Rings"), "Ring 1,Ring 2"); assert.strictEqual(sl("Body Armours"), "Body Armour"); assert.strictEqual(sl("Bows"), "Weapon 1");
    assert.strictEqual(sl("Quivers"), "Weapon 2"); assert.strictEqual(sl("Jewels"), ""); assert.strictEqual(sl("Stackable Currency"), "");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ec-pob-")), inst = path.join(tmp, "Roaming", "Path of Building Community");
    fs.mkdirSync(path.join(inst, "Modules"), { recursive: true }); fs.writeFileSync(path.join(inst, "Launch.lua"), "");
    assert.strictEqual(L.findPob({ APPDATA: path.join(tmp, "Roaming") }), inst, "finds the usual install folder");
    assert.strictEqual(L.findPob({ APPDATA: path.join(tmp, "nope") }), null);
    assert.strictEqual(L.findPob({}, inst), inst, "a picked folder");
    // a stand-in for pob-server.lua: same line protocol, with Path of Building-style noise on stdout
    const bundle = path.join(tmp, "bundle"); fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, "pob-server.lua"), `
      process.stdout.write("Loading main script...\\n@@EC {\\"ok\\":true,\\"ready\\":true}\\n");
      let buf = ""; process.stdin.on("data", (d) => { buf += d; const ls = buf.split("\\n"); buf = ls.pop();
        for (const l of ls) { const r = JSON.parse(l); let o;
          if (r.op === "load") o = { ok: true, skill: "Lightning Arrow", now: { dps: 100 } };
          else if (r.op === "compare") o = { ok: true, skill: "Lightning Arrow", now: { dps: 100, life: 1000, ehp: 2000, fire: 75 }, slots: r.slots.map((s, i) => ({ slot: s, current: "Old " + s, with: { dps: 100 + i * 20, life: 950 + i * 100, ehp: 2100, fire: 75 } })) };
          else if (r.op === "slow") continue;
          process.stdout.write("Processing tree...\\n@@EC " + JSON.stringify({ ...o, id: r.id }) + "\\n"); } });`);
    const run = new L.PobRunner({ luajit: process.execPath, scriptDir: bundle, pobDir: inst });
    const lb = await run.ensureBuild("<PathOfBuilding/>"); assert(lb.ok && run.skill === "Lightning Arrow", "loads the build");
    assert((await run.ensureBuild("<PathOfBuilding/>")).ok, "same build isn't loaded twice");
    const cmp = await run.request({ op: "compare", item: "x", slots: ["Ring 1", "Ring 2"] });
    const sum = L.summarize(cmp);
    assert(sum.best.slot === "Ring 2" && Math.abs(sum.best.dpsPct - 20) < 1e-9 && sum.best.d.life === 50 && sum.best.current === "Old Ring 2", "best slot first: " + JSON.stringify(sum.best));
    const slow = await run.request({ op: "slow" }, 300); assert(!slow.ok && /in time/.test(slow.error), "a request that never answers times out");
    run.stop();
    assert.strictEqual(L.summarize({ ok: false }), null);
    fs.rmSync(tmp, { recursive: true, force: true });
    ok("Path of Building numbers: slots, finding the install, background process protocol, summaries");
  } catch (e) { fail("Path of Building numbers: " + e.message); }
})());

Promise.all(pending).then(() => {
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nAll checks passed");
});

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

for (const f of ["main.js", "preload.js", "lib/logtail.js", "lib/ggg.js", "lib/discord.js", "lib/clip.js", "lib/diag.js", "lib/files.js", "lib/webhosts.js"]) {
  try { new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: f }); ok(`${f} parses`); }
  catch (e) { fail(`${f}: ${e.message}`); }
}

const appDir = path.join(root, "app");
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
for (const f of fs.readdirSync(appDir).filter((x) => x.endsWith(".js"))) {
  try { new vm.Script(fs.readFileSync(path.join(appDir, f), "utf8"), { filename: f }); ok(`app/${f} parses`); }
  catch (e) { fail(`app/${f}: ${e.message}`); }
}

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

// in-app browser: only allowlisted https sites open inside the app
try {
  const { webHostAllowed } = require(path.join(root, "lib", "webhosts.js"));
  for (const u of ["https://www.pathofexile.com/trade/search/Standard", "https://poe.ninja/economy", "https://www.poewiki.net/wiki/Headhunter", "https://pobb.in/abc"]) assert(webHostAllowed(u), "should allow " + u);
  for (const u of ["http://www.pathofexile.com/", "https://evil-pathofexile.com/", "https://pathofexile.com.evil.io/", "https://user:pw@poe.ninja/", "file:///C:/x", "javascript:alert(1)", "https://example.com/"]) assert(!webHostAllowed(u), "should block " + u);
  ok("in-app browser opens only allowlisted https sites");
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

Promise.all(pending).then(() => {
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nAll checks passed");
});

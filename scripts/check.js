// Repository checks: script syntax, Content-Security-Policy in every page, log parser behaviour.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
let failures = 0;
const fail = (msg) => { console.error("✗ " + msg); failures++; };
const ok = (msg) => console.log("✓ " + msg);

for (const f of ["main.js", "preload.js", "lib/logtail.js", "lib/ggg.js", "lib/discord.js", "lib/clip.js", "lib/diag.js"]) {
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
  const { markItemText } = require(path.join(root, "lib", "clip.js"));
  const item = "Item Class: Rings\r\nRarity: Rare\r\nDread Spiral\r\nVermillion Ring\r\n--------\r\nItem Level: 84";
  for (const t of [item, item + "\r\n", item + "\n"]) {
    const m = markItemText(t);
    assert.notStrictEqual(m, t, "marked text must differ from the copied text");
    assert.strictEqual(m.trim(), t.trim(), "marking must not change the item text");
  }
  ok("repeat price-check marking works");
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
  ok(`craft lab engine works (${ctx.CRAFTDATA.v}, ${Object.keys(ctx.CRAFTDATA.mods).length} mods)`);
} catch (e) { fail("craft lab: " + e.message); }

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll checks passed");

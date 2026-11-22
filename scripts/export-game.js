// Writes data/game.json from the tables built into app/index.html (atlas strategies, progression tips,
// map-mod wording), so patch-specific text can then be edited there and reach installed apps without a release.
// Usage: node scripts/export-game.js [YYYY-MM-DD]
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");
const grab = (name) => { const a = html.indexOf(`const ${name}=[`); const b = html.indexOf("\n];", a); if (a < 0 || b < 0) throw new Error("table not found: " + name); return html.slice(a, b + 3); };
const ctx = {}; vm.createContext(ctx);
vm.runInContext([grab("MAPMODS"), grab("STRATS"), grab("PROGRESS"), "this.out={MAPMODS,STRATS,PROGRESS};"].join("\n"), ctx);
const { MAPMODS, STRATS, PROGRESS } = ctx.out;
const out = {
  v: process.argv[2] || new Date().toISOString().slice(0, 10), patch: "3.30", name: "Covens of Umbra", notices: [],
  strats: STRATS.map((x) => ({ id: x.id, name: x.name, sum: x.sum, tips: x.tips, threads: x.threads, need: x.need, pay: x.pay, budget: x.budget, layer: !!x.layer })),
  progressTips: Object.fromEntries(PROGRESS.filter((p) => p.tip).map((p) => [p.id, p.tip])),
  mapmods: Object.fromEntries(MAPMODS.map((m) => [m.id, { label: m.label, frag: m.frag, ...(typeof m.why === "string" ? { why: m.why } : {}) }])),
};
fs.writeFileSync(path.join(__dirname, "..", "data", "game.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`data/game.json: ${out.strats.length} strategies, ${Object.keys(out.progressTips).length} tips, ${Object.keys(out.mapmods).length} map mods (v ${out.v})`);

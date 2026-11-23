"use strict";
// Path of Building numbers: finds the user's Path of Building install and keeps one headless Path of Building
// process running (pob/pob-server.lua on the bundled LuaJIT) that answers "what does this item do to my build?".
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// where Path of Building Community usually lives on Windows (plus a folder the user picked)
function pobCandidates(env, picked) {
  const e = env || process.env, out = [];
  if (picked) out.push(picked);
  for (const base of [e.APPDATA, e.LOCALAPPDATA && path.join(e.LOCALAPPDATA, "Programs"), e.ProgramFiles, e["ProgramFiles(x86)"], e.ProgramData]) {
    if (base) out.push(path.join(base, "Path of Building Community"), path.join(base, "Path of Building Community (PoE1)"), path.join(base, "Path of Building"));
  }
  return [...new Set(out)];
}
const isPobDir = (dir) => { try { return !!dir && fs.existsSync(path.join(dir, "Launch.lua")) && fs.existsSync(path.join(dir, "Modules")); } catch (e) { return false; } };
function findPob(env, picked) { return pobCandidates(env, picked).find(isPobDir) || null; }

// which equipment slots an item can go in, from its "Item Class" line
function slotsFor(text) {
  const cls = (/^Item Class: (.+)$/m.exec(String(text || "")) || [])[1] || "";
  if (/^Rings?$/.test(cls)) return ["Ring 1", "Ring 2"];
  if (/^Amulets?$/.test(cls)) return ["Amulet"];
  if (/^Belts?$/.test(cls)) return ["Belt"];
  if (/^Helmets?$/.test(cls)) return ["Helmet"];
  if (/^Body Armours?$/.test(cls)) return ["Body Armour"];
  if (/^Gloves$/.test(cls)) return ["Gloves"];
  if (/^Boots$/.test(cls)) return ["Boots"];
  if (/^(Shields?|Quivers?)$/.test(cls)) return ["Weapon 2"];
  if (/(Axes|Swords|Maces|Sceptres|Daggers|Claws|Bows|Staves|Wands|Warstaves|Rune Daggers|Fishing Rods)$/.test(cls)) return ["Weapon 1"];
  return [];
}

class PobRunner {
  constructor({ luajit, scriptDir, pobDir, log }) {
    this.luajit = luajit; this.scriptDir = scriptDir; this.pobDir = pobDir; this.log = log || (() => {});
    this.proc = null; this.ready = null; this.pending = new Map(); this.seq = 0; this.buf = ""; this.loadedXml = null; this.skill = "";
  }
  start() {
    if (this.proc) return this.ready;
    const lua = path.join(this.pobDir, "lua");
    const env = { ...process.env, LUA_PATH: `${lua}\\?.lua;${lua}\\?\\init.lua;${this.pobDir}\\?.lua`, LUA_CPATH: `${this.pobDir}\\?.dll` };
    const p = spawn(this.luajit, [path.join(this.scriptDir, "pob-server.lua"), this.scriptDir], { cwd: this.pobDir, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.proc = p; this.loadedXml = null;
    let err = "";
    this.ready = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("Path of Building took too long to start")), 60000);
      this.onReady = (m) => { clearTimeout(to); if (m.ok) resolve(); else reject(new Error(m.error || "Path of Building couldn't start")); };
      p.on("exit", (code) => { clearTimeout(to); reject(new Error(`Path of Building stopped (${code})${err ? ": " + err.slice(-300) : ""}`)); });
    });
    this.ready.catch(() => {});
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d) => {
      this.buf += d; const lines = this.buf.split(/\r?\n/); this.buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith("@@EC ")) continue;
        let m; try { m = JSON.parse(l.slice(5)); } catch (e) { continue; }
        if (m.ready || m.fatal) { if (this.onReady) this.onReady(m); continue; }
        const w = this.pending.get(m.id); if (w) { this.pending.delete(m.id); clearTimeout(w.to); w.resolve(m); }
      }
    });
    p.stderr.setEncoding("utf8"); p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("exit", (code) => {
      this.log(`Path of Building process stopped (${code})`);
      for (const w of this.pending.values()) { clearTimeout(w.to); w.resolve({ ok: false, error: "Path of Building stopped" }); }
      this.pending.clear(); this.proc = null; this.loadedXml = null;
    });
    return this.ready;
  }
  async request(obj, ms = 20000) {
    await this.start();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const to = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, error: "Path of Building didn't answer in time" }); }, ms);
      this.pending.set(id, { resolve, to });
      this.proc.stdin.write(JSON.stringify({ ...obj, id }) + "\n");
    });
  }
  async ensureBuild(xml) {
    if (!xml) return { ok: false, error: "no build" };
    if (this.loadedXml === xml) return { ok: true };
    const r = await this.request({ op: "load", xml }, 60000);
    if (r.ok) { this.loadedXml = xml; this.skill = r.skill || ""; }
    return r;
  }
  stop() { if (this.proc) { try { this.proc.stdin.end(); this.proc.kill(); } catch (e) { /* ignore */ } this.proc = null; } }
}

// a short summary of what the item changes, for the best slot it can go in
function summarize(r) {
  if (!r || !r.ok || !r.slots || !r.slots.length) return null;
  const now = r.now, pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
  const rows = r.slots.map((s) => {
    const w = s.with, d = {}; for (const k of Object.keys(now)) d[k] = (w[k] || 0) - (now[k] || 0);
    const dpsPct = pct(w.dps, now.dps), ehpPct = pct(w.ehp, now.ehp);
    return { slot: s.slot, current: s.current, d, dpsPct, ehpPct, score: dpsPct + ehpPct * 0.7 };
  }).sort((a, b) => b.score - a.score);
  return { skill: r.skill, best: rows[0], all: rows };
}

module.exports = { pobCandidates, findPob, isPobDir, slotsFor, PobRunner, summarize };

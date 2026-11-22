// Live tailing of Path of Exile's Client.txt, plus helpers to find it.
// Pure Node (no Electron) so it can be tested on its own.
"use strict";
const fs = require("fs");
const path = require("path");

const ZONE_RE = /Generating level (\d+) area "([^"]+)"(?: with seed (\d+))?/;
const LEVEL_RE = /\] : (.+?) \(([A-Za-z]+)\) is now level (\d+)/;
const DEATH_RE = /\] : (.+?) has been slain\./;
const WHISPER_RE = /\] @(From|To) (?:<[^>]*> )?([^:]+?): (.+)$/;
const JOIN_RE = /\] : (.+?) has (joined|left) the area\./;
// public chat: "#" global, "$" trade, "%" party, "&" guild, no prefix = local; character names are one word (3-23 letters, digits, _)
const CHAT_RE = /\[INFO Client \d+\] ([#$%&])?(?:<[^>]{1,12}> )?([A-Za-z0-9_]{3,23}): (.+)$/;
const CHANNEL = { "#": "global", "$": "trade", "%": "party", "&": "guild", "": "local" };
// "Hi, I would like to buy your X listed for 5 chaos in League (stash tab "~b/o"; position: left 3, top 7)"
const TRADE_RE = /(?:buy your|purchase your) (.+?) listed for ([\d.,]+) ([^(]+?) in (.+?)(?: \(stash tab "(.*?)"; position: left (\d+), top (\d+)\))?\.?\s*(?:Offer:|$)/i;
// bulk: "Hi, I'd like to buy your 10 Divine Orb for my 1800 Chaos Orb in League."
const BULK_RE = /buy your ([\d.,]+) (.+?) for my ([\d.,]+) (.+?) in (.+?)\./i;
function parseTrade(msg) {
  let m;
  if ((m = msg.match(TRADE_RE))) return { item: m[1], amount: m[2], currency: m[3].trim(), league: m[4], tab: m[5] || null, left: m[6] ? +m[6] : null, top: m[7] ? +m[7] : null };
  if ((m = msg.match(BULK_RE))) return { item: `${m[1]} ${m[2]}`, amount: m[3], currency: m[4], league: m[5], bulk: true };
  return null;
}
const SCENE_RE = /\[SCENE\] Set Source \[(.+?)\]|You have entered (.+?)\.\s*$/;
const TIME_RE = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)/;

function lineTime(l) {
  const m = l.match(TIME_RE);
  if (!m) return Date.now();
  return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

// Turn raw appended text into a list of events.
function parseEvents(text) {
  const out = [];
  for (const l of text.split(/\r?\n/)) {
    if (!l) continue;
    let m;
    if ((m = l.match(ZONE_RE))) { out.push({ type: "zone", lvl: +m[1], id: m[2], seed: m[3] || "", t: lineTime(l) }); continue; }
    if ((m = l.match(LEVEL_RE))) { out.push({ type: "level", name: m[1], cls: m[2], level: +m[3], t: lineTime(l) }); continue; }
    if ((m = l.match(DEATH_RE))) { out.push({ type: "death", name: m[1], t: lineTime(l) }); continue; }
    if ((m = l.match(WHISPER_RE))) { out.push({ type: "whisper", dir: m[1] === "From" ? "in" : "out", name: m[2].trim(), text: m[3], trade: parseTrade(m[3]), t: lineTime(l) }); continue; }
    if ((m = l.match(JOIN_RE))) { out.push({ type: m[2] === "joined" ? "join" : "leave", name: m[1], t: lineTime(l) }); continue; }
    if ((m = l.match(CHAT_RE))) { out.push({ type: "chat", ch: CHANNEL[m[1] || ""], name: m[2], text: m[3].slice(0, 500), t: lineTime(l) }); continue; }
    // other system messages (answers to /passives, /deaths, /played, …)
    if ((m = l.match(/\] : (.+)$/))) { out.push({ type: "system", text: m[1], t: lineTime(l) }); continue; }
    if ((m = l.match(SCENE_RE))) {
      const name = m[1] || m[2];
      if (name && name !== "(null)" && name !== "(unknown)") out.push({ type: "scene", name, t: lineTime(l) });
    }
  }
  return out;
}

// Steam library folders from libraryfolders.vdf
function steamLibraries(steamRoot) {
  const libs = [steamRoot];
  try {
    const vdf = fs.readFileSync(path.join(steamRoot, "steamapps", "libraryfolders.vdf"), "utf8");
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(m[1].replace(/\\\\/g, "\\"));
  } catch (e) { /* no steam */ }
  return [...new Set(libs)];
}

function candidateLogPaths(env = process.env) {
  const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const pf = env.ProgramFiles || "C:\\Program Files";
  const list = [
    path.join(pf86, "Grinding Gear Games", "Path of Exile", "logs", "Client.txt"),
    path.join(pf, "Grinding Gear Games", "Path of Exile", "logs", "Client.txt"),
  ];
  const steamRoots = [path.join(pf86, "Steam"), path.join(pf, "Steam")];
  for (const root of steamRoots) {
    for (const lib of steamLibraries(root)) list.push(path.join(lib, "steamapps", "common", "Path of Exile", "logs", "Client.txt"));
  }
  for (const d of ["C", "D", "E", "F", "G"]) {
    list.push(`${d}:\\SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt`);
    list.push(`${d}:\\Games\\Path of Exile\\logs\\Client.txt`);
    list.push(`${d}:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt`);
  }
  return [...new Set(list)];
}

function detectLogPaths(env) {
  return candidateLogPaths(env)
    .filter((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } })
    .map((p) => { const st = fs.statSync(p); return { path: p, size: st.size, modified: st.mtimeMs }; })
    .sort((a, b) => b.modified - a.modified);
}

// Read the last `mb` megabytes of a file as text.
function readTail(file, mb) {
  const st = fs.statSync(file);
  const len = Math.min(st.size, Math.floor(mb * 1024 * 1024));
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    return { text: buf.toString("utf8"), size: st.size, partial: len < st.size };
  } finally { fs.closeSync(fd); }
}

// Follow a growing file. Calls onText(newText) with appended text.
class Tail {
  constructor(file, onText, onError, interval = 500) {
    this.file = file; this.onText = onText; this.onError = onError || (() => {});
    this.interval = interval; this.offset = 0; this.timer = null; this.busy = false;
  }
  start() {
    try { this.offset = fs.statSync(this.file).size; } catch (e) { this.onError(e); return false; }
    this.timer = setInterval(() => this.poll(), this.interval);
    return true;
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const size = fs.statSync(this.file).size;
      if (size < this.offset) this.offset = 0; // file was truncated / rotated
      if (size > this.offset) {
        const len = Math.min(size - this.offset, 8 * 1024 * 1024);
        const fd = fs.openSync(this.file, "r");
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, this.offset);
        fs.closeSync(fd);
        // only hand over whole lines
        let text = buf.toString("utf8");
        const lastNl = text.lastIndexOf("\n");
        if (lastNl === -1 && len < 8 * 1024 * 1024) { this.busy = false; return; }
        const consumed = lastNl === -1 ? text : text.slice(0, lastNl + 1);
        this.offset += Buffer.byteLength(consumed, "utf8");
        this.onText(consumed);
      }
    } catch (e) { this.onError(e); }
    this.busy = false;
  }
}

module.exports = { parseTrade, parseEvents, candidateLogPaths, detectLogPaths, readTail, Tail, steamLibraries };

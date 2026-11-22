"use strict";
// Twitch chat commands: IRC line parsing and the replies (pure functions, tested in scripts/check.js).
// The connection itself lives in main.js. Replies use only what the app already shows on the overlay.

function parseIrc(line) {
  let rest = String(line || "").replace(/\r?\n$/, "");
  const msg = { tags: {}, prefix: "", command: "", params: [], trailing: null };
  if (rest.startsWith("@")) { const sp = rest.indexOf(" "); for (const kv of rest.slice(1, sp).split(";")) { const i = kv.indexOf("="); msg.tags[i < 0 ? kv : kv.slice(0, i)] = i < 0 ? "" : unescapeTag(kv.slice(i + 1)); } rest = rest.slice(sp + 1); }
  if (rest.startsWith(":")) { const sp = rest.indexOf(" "); msg.prefix = rest.slice(1, sp); rest = rest.slice(sp + 1); }
  const t = rest.indexOf(" :"); if (t >= 0) { msg.trailing = rest.slice(t + 2); rest = rest.slice(0, t); }
  const parts = rest.split(" ").filter(Boolean); msg.command = parts.shift() || ""; msg.params = parts;
  msg.nick = msg.prefix.includes("!") ? msg.prefix.slice(0, msg.prefix.indexOf("!")) : "";
  return msg;
}
const unescapeTag = (v) => v.replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");

const DEFAULT_CMDS = { build: true, level: true, map: true, deaths: true, profit: true, league: true, commands: true };
const clean = (s, n = 400) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const dur = (ms) => { if (!ms) return ""; const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

// What each command answers. d = { overlay: <overlay payload>, stream: <stream data>, cfg }
function replyFor(cmd, d, opts = {}) {
  const o = (d && d.overlay) || {}, s = (d && d.stream) || {}, ch = o.char || {};
  const who = clean(ch.name || s.name || "The streamer", 40);
  switch (cmd) {
    case "build": {
      const cls = clean(s.cls || "", 60), skill = clean(s.skill || "", 60), link = clean(opts.buildLink || s.link || "", 200);
      if (!cls && !link) return "No build loaded in Exile Companion yet.";
      return [cls && skill ? `${cls}, ${skill}` : cls || skill, link || null].filter(Boolean).join(" · ");
    }
    case "level": {
      const lv = ch.level || s.level; if (!lv) return "Level not known yet (the game log fills this in).";
      return `${who} is level ${lv}${o.eta ? `, next level in about ${clean(o.eta, 20)}` : ""}.`;
    }
    case "map": {
      const cur = o.maps && o.maps.current, z = o.zone;
      if (cur) return `${clean(cur.name, 60)}${cur.tier ? ` (tier ${cur.tier})` : ""}${cur.start ? `, ${dur(Date.now() - cur.start)} in` : ""}${cur.deaths ? `, ${cur.deaths} death${cur.deaths > 1 ? "s" : ""}` : ""}.`;
      if (z && z.name) return `In ${clean(z.name, 60)}${z.lvl ? ` (area level ${z.lvl})` : ""}.`;
      return "Not in a zone right now.";
    }
    case "deaths": {
      const n = s.deaths; if (n == null) return "No deaths counted yet this session.";
      return n === 0 ? "No deaths this session." : `${n} death${n > 1 ? "s" : ""} this session.`;
    }
    case "profit": {
      const ss = o.maps && o.maps.session; const net = o.pages && o.pages.session && o.pages.session.net;
      if (!ss || !ss.count) return net != null ? `Net worth: ${(+net).toFixed(1)} divine.` : "No maps tracked this session yet.";
      return `${ss.count} map${ss.count > 1 ? "s" : ""} this session${ss.avgMs ? `, ${dur(ss.avgMs)} each on average` : ""}${ss.div != null ? `, about ${(+ss.div).toFixed(1)} divine/hour` : ""}${net != null ? ` · net worth ${(+net).toFixed(1)} divine` : ""}.`;
    }
    case "league": return s.league ? `Playing ${clean(s.league, 60)}.` : "League not known yet.";
    case "commands": {
      const on = Object.keys(DEFAULT_CMDS).filter((k) => (opts.cmds || DEFAULT_CMDS)[k] !== false && k !== "commands");
      const custom = (opts.custom || []).map((c) => c.name);
      return `Commands: ${[...on, ...custom].map((x) => "!" + x).join(" ")}`;
    }
  }
  const c = (opts.custom || []).find((x) => x.name === cmd);
  return c ? clean(c.text, 400) : null;
}

// Decide whether a chat message is a command we answer, honoring per-command switches, mods-only and cooldowns.
function handleMessage(msg, d, opts, state, now = Date.now()) {
  if (!msg || msg.command !== "PRIVMSG" || !msg.trailing) return null;
  const m = /^!([a-z0-9_]{2,20})\b/i.exec(msg.trailing.trim()); if (!m) return null;
  const cmd = m[1].toLowerCase();
  if (opts.self && msg.nick && msg.nick.toLowerCase() === String(opts.self).toLowerCase()) return null;   // never answer ourselves
  const builtIn = Object.prototype.hasOwnProperty.call(DEFAULT_CMDS, cmd), custom = (opts.custom || []).some((x) => x.name === cmd);
  if (!builtIn && !custom) return null;
  if (builtIn && (opts.cmds || DEFAULT_CMDS)[cmd] === false) return null;
  if (opts.modsOnly) { const b = msg.tags.badges || ""; if (!(msg.tags.mod === "1" || /(^|,)(broadcaster|moderator)\//.test(b))) return null; }
  const cd = Math.max(5, Math.min(600, +opts.cooldown || 20)) * 1000;
  state.last = state.last || {};
  if (now - (state.last[cmd] || 0) < cd) return null;
  if (now - (state.lastAny || 0) < 1500) return null;          // never more than one reply every 1.5 s
  const text = replyFor(cmd, d, opts); if (!text) return null;
  state.last[cmd] = now; state.lastAny = now;
  return { cmd, text: clean(text, 450), replyTo: msg.tags.id || null };
}

module.exports = { parseIrc, replyFor, handleMessage, DEFAULT_CMDS };

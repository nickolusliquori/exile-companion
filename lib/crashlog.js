"use strict";
// A small local log of errors, crashes and startup timing, kept in the app's own folder (logs/app.log).
// It never leaves the computer on its own: "Report a problem" includes the last lines, redacted, only when the
// user saves a report. Two files at most: app.log, and app.old.log once app.log passes the size limit.
const fs = require("fs");
const path = require("path");

function createLog(dir, { maxBytes = 512 * 1024, redact = (s) => s, now = () => new Date() } = {}) {
  const file = path.join(dir, "app.log"), old = path.join(dir, "app.old.log");
  let ok = true;
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { ok = false; }
  let last = "", repeat = 0;
  function rotate() {
    try { if (fs.statSync(file).size > maxBytes) { try { fs.rmSync(old, { force: true }); } catch (e) { /* ignore */ } fs.renameSync(file, old); } } catch (e) { /* no file yet */ }
  }
  function write(level, source, msg) {
    if (!ok) return;
    const text = redact(String(msg == null ? "" : msg)).replace(/\r?\n/g, "\n    ").slice(0, 4000);
    const key = level + source + text;
    if (key === last) { repeat++; return; }         // the same error in a loop is written once, with a count
    try {
      rotate();
      let out = "";
      if (repeat) out += `${now().toISOString()} INFO  log: previous line repeated ${repeat} more time${repeat === 1 ? "" : "s"}\n`;
      out += `${now().toISOString()} ${String(level).toUpperCase().padEnd(5)} ${source}: ${text}\n`;
      fs.appendFileSync(file, out, "utf8");
      last = key; repeat = 0;
    } catch (e) { /* a log must never break the app */ }
  }
  // the last n lines across both files, oldest first
  function tail(n = 80) {
    const read = (f) => { try { return fs.readFileSync(f, "utf8").split("\n").filter(Boolean); } catch (e) { return []; } };
    return [...read(old), ...read(file)].slice(-n);
  }
  return { file, dir, write, info: (s, m) => write("info", s, m), warn: (s, m) => write("warn", s, m), error: (s, m) => write("error", s, m), tail };
}

// Safe mode decision. A marker is written when the app starts and cleared once it has started properly.
// If the last two starts never cleared it (the app crashed or froze while starting), start in safe mode.
function startupGuard(file, { now = () => Date.now(), threshold = 2 } = {}) {
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { prev = null; }
  const fails = prev && prev.pending ? (prev.fails || 0) + 1 : 0;
  const write = (o) => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  write({ pending: true, fails, t: now() });
  return {
    fails,
    unsafe: fails >= threshold,
    started() { write({ pending: false, fails: 0, t: now() }); },
    reset() { write({ pending: false, fails: 0, t: now() }); },
  };
}

module.exports = { createLog, startupGuard };

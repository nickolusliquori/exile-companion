"use strict";
// Helpers for "Report a problem": keep reports useful without leaking anything private.

const KEEP_CFG = [
  "priceOnCopy", "priceHotkey", "overlayHotkey", "interactHotkey", "copyHotkey", "wikiHotkey", "pageHotkey", "cheatHotkey",
  "overlayVisible", "overlayOpacity", "streamEnabled", "streamPort", "discordEnabled", "league", "notify", "logPath",
];

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Replace the user's home folder / user name, session ids, tokens and e-mail addresses.
function redact(text, ctx) {
  let t = String(text == null ? "" : text);
  const home = ctx && ctx.home, user = ctx && ctx.user;
  if (home) t = t.replace(new RegExp(escapeRe(home), "gi"), "~");
  if (home) t = t.replace(new RegExp(escapeRe(home.replace(/\\/g, "/")), "gi"), "~");
  t = t.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, "$1<user>");
  t = t.replace(/(\/(?:home|Users)\/)[^/\s"']+/g, "$1<user>");
  if (user && user.length > 2) t = t.replace(new RegExp(`\\b${escapeRe(user)}\\b`, "gi"), "<user>");
  t = t.replace(/POESESSID\s*[=:]\s*\S+/gi, "POESESSID=[redacted]");
  t = t.replace(/\b[a-f0-9]{32}\b/gi, "[redacted]");
  t = t.replace(/\b(Bearer|access_token|refresh_token|code_verifier|token)(["'\s:=]+)[\w.\-~+/]{8,}/gi, "$1$2[redacted]");
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
  return t;
}

function sanitizeCfg(cfg, ctx) {
  const out = {};
  for (const k of KEEP_CFG) if (cfg && cfg[k] !== undefined) out[k] = cfg[k];
  if (out.logPath) out.logPath = redact(out.logPath, ctx);
  out.accountNameSet = !!(cfg && cfg.accountName);
  out.contactSet = !!(cfg && cfg.contact);
  out.discordAppIdSet = !!(cfg && cfg.discordAppId);
  return out;
}

module.exports = { redact, sanitizeCfg, KEEP_CFG };

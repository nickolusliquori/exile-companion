// Paces requests to the trade site so the app stays under GGG's published rate limits instead of
// waiting to be told off. GGG sends the rules with every response:
//   x-rate-limit-rules: Ip            x-rate-limit-ip: 8:10:60,15:60:120   (max hits : period s : penalty s)
// We remember when we sent each request per endpoint group and wait before a request would reach a limit.
"use strict";

function groupOf(url) {
  const p = new URL(url).pathname;
  if (p.startsWith("/api/trade/search")) return "trade-search";
  if (p.startsWith("/api/trade/fetch")) return "trade-fetch";
  if (p.startsWith("/api/trade/exchange")) return "trade-exchange";
  if (p.startsWith("/api/trade/data")) return "trade-data";
  return "site";
}

// "8:10:60,15:60:120" -> [{max:8, period:10}, {max:15, period:60}]
function parseRules(header) {
  return String(header || "").split(",").map((r) => r.trim().split(":").map(Number)).filter((r) => r.length >= 2 && r[0] > 0 && r[1] > 0).map(([max, period]) => ({ max, period }));
}

function createLimiter({ now = () => Date.now(), margin = 1 } = {}) {
  const groups = new Map(); // group -> {rules:[], sent:[ms]}
  const g = (k) => { if (!groups.has(k)) groups.set(k, { rules: [], sent: [] }); return groups.get(k); };
  // until GGG tells us the real rules, be conservative
  const DEFAULT = [{ max: 4, period: 6 }];
  return {
    // ms to wait before the next request in this group may go out
    waitFor(group) {
      const s = g(group), t = now(), rules = s.rules.length ? s.rules : DEFAULT;
      let wait = 0;
      for (const r of rules) {
        const win = r.period * 1000, recent = s.sent.filter((x) => t - x < win);
        const allowed = Math.max(1, r.max - margin);
        if (recent.length >= allowed) wait = Math.max(wait, recent[recent.length - allowed] + win - t + 50);
      }
      return Math.max(0, wait);
    },
    sent(group) { const s = g(group); s.sent.push(now()); if (s.sent.length > 200) s.sent.splice(0, s.sent.length - 200); },
    // headers: a function name -> value (fetch's Headers.get works)
    learn(group, get) {
      const names = String(get("x-rate-limit-rules") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
      const rules = names.flatMap((n) => parseRules(get(`x-rate-limit-${n}`)));
      if (rules.length) g(group).rules = rules;
    },
    _groups: groups,
  };
}

module.exports = { createLimiter, parseRules, groupOf };

// GGG account access.
//  - Official OAuth API (needs your own client ID from GGG; public client, PKCE, local redirect).
//  - Fallbacks that work today without a client ID: public-profile character import
//    (same endpoints Path of Building uses) and stash access with your POESESSID cookie.
"use strict";
const crypto = require("crypto");
const http = require("http");

const API = "https://api.pathofexile.com";
const WEB = "https://www.pathofexile.com";
const SCOPES = ["account:profile", "account:leagues", "account:characters", "account:stashes", "account:league_accounts", "account:item_filter"];

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- rate limiting (X-Rate-Limit-* headers) ---------- */
class RateLimiter {
  constructor(minGapMs = 1100) { this.minGap = minGapMs; this.next = 0; this.chain = Promise.resolve(); }
  // run fn serially, spacing requests and honouring limits learned from headers
  run(fn) {
    const p = this.chain.then(async () => {
      const wait = this.next - Date.now();
      if (wait > 0) await sleep(wait);
      const res = await fn();
      this.learn(res);
      return res;
    });
    this.chain = p.catch(() => {});
    return p;
  }
  learn(res) {
    let until = Date.now() + this.minGap;
    if (!res || !res.headers) { this.next = until; return; }
    const h = res.headers;
    const get = (k) => (typeof h.get === "function" ? h.get(k) : h[k]);
    const retry = +get("retry-after") || 0;
    if (res.status === 429 && retry) until = Math.max(until, Date.now() + retry * 1000);
    const rules = (get("x-rate-limit-rules") || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const r of rules) {
      const lim = (get(`x-rate-limit-${r}`) || "").split(",");
      const st = (get(`x-rate-limit-${r}-state`) || "").split(",");
      lim.forEach((l, i) => {
        const [max, period] = l.split(":").map(Number);
        const [hits, , restricted] = (st[i] || "").split(":").map(Number);
        if (restricted > 0) until = Math.max(until, Date.now() + restricted * 1000);
        else if (max && hits >= max) until = Math.max(until, Date.now() + period * 1000);
        else if (max && period) until = Math.max(until, Date.now() + Math.ceil((period * 1000) / max));
      });
    }
    this.next = until;
  }
}

class GGG {
  constructor({ store, userAgent, openExternal, fetchImpl }) {
    this.store = store;               // { get(key), set(key, value) } with encryption handled outside
    this.userAgent = userAgent;       // () => string
    this.openExternal = openExternal; // (url) => void
    this.fetch = fetchImpl || fetch;
    this.apiLimiter = new RateLimiter(1100);
    this.webLimiter = new RateLimiter(1600);
  }

  /* ---------- OAuth ---------- */
  tokens() { return this.store.get("oauth") || null; }
  signedIn() { const t = this.tokens(); return !!(t && t.refresh_token && t.refresh_expires > Date.now()); }
  async login({ clientId, redirectUri }) {
    if (!clientId) throw new Error("Enter your OAuth client ID first.");
    const ru = new URL(redirectUri || "http://127.0.0.1:8080/callback");
    if (!/^(127\.0\.0\.1|localhost)$/.test(ru.hostname)) throw new Error("The redirect URI must be local, e.g. http://127.0.0.1:8080/callback");
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { server.close(); reject(new Error("Sign-in timed out. Try again.")); }, 180000);
      const server = http.createServer((req, res) => {
        const u = new URL(req.url, ru.origin);
        if (u.pathname !== ru.pathname) { res.writeHead(404); res.end(); return; }
        const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><title>Exile Companion</title><body style="font-family:sans-serif;background:#0e0c0a;color:#e8dfcf;padding:40px"><h2 style="color:#c9a45c">${ok ? "Signed in. You can close this tab." : "Sign-in failed."}</h2><p>${ok ? "Return to Exile Companion." : (u.searchParams.get("error_description") || u.searchParams.get("error") || "State mismatch.")}</p></body>`);
        clearTimeout(timer); server.close();
        if (ok) resolve(u.searchParams.get("code")); else reject(new Error(u.searchParams.get("error_description") || u.searchParams.get("error") || "Sign-in was cancelled."));
      });
      server.on("error", (e) => { clearTimeout(timer); reject(new Error(`Can't listen on ${ru.host}: ${e.message}`)); });
      server.listen(+ru.port || 80, ru.hostname, () => {
        const q = new URLSearchParams({ client_id: clientId, response_type: "code", scope: SCOPES.join(" "), state, redirect_uri: ru.href, code_challenge: challenge, code_challenge_method: "S256" });
        this.openExternal(`${WEB}/oauth/authorize?${q}`);
      });
    });
    // codes last 30 seconds: exchange right away
    const tok = await this.tokenRequest({ client_id: clientId, grant_type: "authorization_code", code, redirect_uri: ru.href, scope: SCOPES.join(" "), code_verifier: verifier });
    this.saveTokens(tok, clientId);
    return this.tokens();
  }
  async tokenRequest(form) {
    const res = await this.fetch(`${WEB}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": this.userAgent() }, body: new URLSearchParams(form).toString() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || `Token request failed (${res.status})`);
    return data;
  }
  saveTokens(tok, clientId) {
    const prev = this.tokens() || {};
    this.store.set("oauth", {
      clientId, access_token: tok.access_token, refresh_token: tok.refresh_token, scope: tok.scope || SCOPES.join(" "),
      username: tok.username || prev.username, expires: Date.now() + (tok.expires_in || 36000) * 1000 - 60000,
      // public-client refresh tokens last 7 days and refreshing doesn't extend them
      refresh_expires: prev.refresh_token && tok.refresh_token && prev.refresh_expires ? prev.refresh_expires : Date.now() + 7 * 86400e3,
    });
  }
  logout() { this.store.set("oauth", null); }
  async accessToken() {
    const t = this.tokens();
    if (!t) throw new Error("Not signed in.");
    if (t.expires > Date.now()) return t.access_token;
    if (!t.refresh_token || t.refresh_expires < Date.now()) { this.logout(); throw new Error("Your GGG sign-in expired. Sign in again."); }
    const tok = await this.tokenRequest({ client_id: t.clientId, grant_type: "refresh_token", refresh_token: t.refresh_token });
    this.saveTokens(tok, t.clientId);
    return tok.access_token;
  }
  async api(path, { method = "GET", body = null } = {}, retried = false) {
    const token = await this.accessToken();
    const res = await this.apiLimiter.run(() => this.fetch(API + path, {
      method, headers: { Authorization: `Bearer ${token}`, "User-Agent": this.userAgent(), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
    if (res.status === 401 && !retried) { const t = this.tokens(); if (t) { t.expires = 0; this.store.set("oauth", t); } return this.api(path, { method, body }, true); }
    const data = await res.json().catch(() => null);
    if (res.status === 403) throw new Error("GGG refused: your sign-in lacks permission for this. Sign out and in again.");
    if (res.status === 429) throw new Error(`GGG rate limit hit. Wait ${res.headers.get("retry-after") || 60}s.`);
    if (!res.ok) throw new Error((data && data.error && data.error.message) || `GGG API error ${res.status}`);
    return data;
  }

  /* ---------- website endpoints (no client ID needed) ---------- */
  async web(path, { session = null } = {}) {
    const res = await this.webLimiter.run(() => this.fetch(WEB + path, {
      headers: { "User-Agent": this.userAgent(), Accept: "application/json", ...(session ? { Cookie: `POESESSID=${session}` } : {}) },
    }));
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error(session ? "GGG rejected your POESESSID. It may have expired: copy a fresh one." : "That profile is private. Make characters public in your pathofexile.com privacy settings, or add your POESESSID.");
    if (res.status === 404) throw new Error("Account or character not found. Check the account name, including the #1234 part.");
    if (res.status === 429) throw new Error(`pathofexile.com rate limit hit. Wait ${res.headers.get("retry-after") || 60}s.`);
    if (!res.ok || text === "false") throw new Error(`pathofexile.com error ${res.status}`);
    try { return JSON.parse(text); } catch (e) { throw new Error("Unexpected reply from pathofexile.com."); }
  }

  /* ---------- unified operations ---------- */
  mode() { return this.signedIn() ? "oauth" : "web"; }
  async characters({ account, session }) {
    if (this.signedIn()) return ((await this.api("/character")).characters || []).map(normChar);
    if (!account) throw new Error("Enter your account name (with the #1234 part).");
    const r = await this.web(`/character-window/get-characters?accountName=${encodeURIComponent(account)}&realm=pc`, { session });
    return (Array.isArray(r) ? r : r.characters || []).map(normChar);
  }
  async character({ account, session, name }) {
    if (this.signedIn()) return (await this.api(`/character/${encodeURIComponent(name)}`)).character;
    const q = `accountName=${encodeURIComponent(account)}&character=${encodeURIComponent(name)}&realm=pc`;
    const items = await this.web(`/character-window/get-items?${q}`, { session });
    const pas = await this.web(`/character-window/get-passive-skills?${q}`, { session });
    const c = items.character || {};
    return {
      name: c.name || name, class: c.class, level: c.level, league: c.league,
      equipment: items.items || [], jewels: pas.items || [],
      passives: { hashes: pas.hashes || [], hashes_ex: pas.hashes_ex || [], mastery_effects: pas.mastery_effects || {}, jewel_data: pas.jewel_data || {} },
    };
  }
  async stashList({ account, session, league }) {
    if (this.signedIn()) {
      const flat = [];
      const walk = (arr, parent) => (arr || []).forEach((t) => { if (t.children && t.children.length && t.type === "Folder") walk(t.children, t.id); else flat.push({ id: t.id, parent: t.parent || parent || null, name: t.name, type: t.type, index: t.index }); if (t.children && t.type !== "Folder") t.children.forEach((c) => flat.push({ id: c.id, parent: t.id, name: `${t.name} › ${c.name}`, type: c.type, index: c.index })); });
      walk((await this.api(`/stash/${encodeURIComponent(league)}`)).stashes);
      return flat;
    }
    if (!session) throw new Error("Stash access needs your POESESSID (or a GGG sign-in).");
    const r = await this.web(`/character-window/get-stash-items?accountName=${encodeURIComponent(account)}&realm=pc&league=${encodeURIComponent(league)}&tabs=1&tabIndex=0`, { session });
    return (r.tabs || []).map((t) => ({ id: t.id, name: t.n, type: t.type, index: t.i, hidden: t.hidden }));
  }
  async stashTab({ account, session, league, tab }) {
    if (this.signedIn()) {
      const p = tab.parent ? `${tab.parent}/${tab.id}` : tab.id;
      const s = (await this.api(`/stash/${encodeURIComponent(league)}/${p}`)).stash || {};
      const inner = tab.parent && s.children ? (s.children.find((c) => c.id === tab.id) || s) : s;
      return inner.items || [];
    }
    const r = await this.web(`/character-window/get-stash-items?accountName=${encodeURIComponent(account)}&realm=pc&league=${encodeURIComponent(league)}&tabs=0&tabIndex=${tab.index}`, { session });
    return r.items || [];
  }
  async leagueAccount(league) {
    if (!this.signedIn()) throw new Error("Reading your atlas tree needs a GGG sign-in.");
    return (await this.api(`/league-account/${encodeURIComponent(league)}`)).league_account;
  }
  async filters() { return (await this.api("/item-filter")).filters || []; }
  async saveFilter({ id, name, text, description }) {
    const body = { filter_name: name, realm: "pc", description: description || "Made by Exile Companion", type: "Normal", filter: text };
    return (await this.api(id ? `/item-filter/${id}?validate=true` : "/item-filter?validate=true", { method: "POST", body })).filter;
  }
  async currencyHour(id) {
    // Public API; try without a token first.
    const url = `https://web.poecdn.com/api/currency-exchange${id ? "/" + id : ""}`;
    const res = await this.webLimiter.run(() => this.fetch(url, { headers: { "User-Agent": this.userAgent(), Accept: "application/json" } }));
    if (res.ok) return res.json();
    if ((res.status === 401 || res.status === 403) && this.signedIn()) return this.api(`/currency-exchange${id ? "/" + id : ""}`);
    throw new Error(`Currency history unavailable (${res.status}).`);
  }
}

function normChar(c) {
  return { name: c.name, league: c.league, class: c.class || c.ascendancyClass || "", level: c.level, current: !!c.current, expired: !!c.expired };
}

module.exports = { GGG, RateLimiter, SCOPES, b64url };

// Exile Companion desktop: main process.
// Windows: companion (main), overlay (click-through, always on top), price check popup.
"use strict";
const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen, shell, dialog, Menu, Notification, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const { parseEvents, detectLogPaths, readTail, Tail } = require("./lib/logtail");
const { GGG } = require("./lib/ggg");
const { DiscordRPC } = require("./lib/discord");
const { markItemText } = require("./lib/clip");

const { pathToFileURL } = require("url");
const APP_NAME = "Exile Companion";

/* ---------------- security: only our own pages may talk to the main process ---------------- */
const APP_URL = pathToFileURL(path.join(__dirname, "app")).href.toLowerCase();
const trusted = (e) => {
  const url = String((e.senderFrame && e.senderFrame.url) || "").toLowerCase();
  return url.startsWith(APP_URL);
};
{
  const _handle = ipcMain.handle.bind(ipcMain), _on = ipcMain.on.bind(ipcMain);
  ipcMain.handle = (ch, fn) => _handle(ch, (e, ...a) => { if (!trusted(e)) throw new Error("Blocked: untrusted sender"); return fn(e, ...a); });
  ipcMain.on = (ch, fn) => _on(ch, (e, ...a) => { if (!trusted(e)) return; return fn(e, ...a); });
}
app.on("web-contents-created", (_e, contents) => {
  // no new windows, no navigation away from the app, no embedded webviews
  contents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  contents.on("will-navigate", (e, url) => { if (!url.toLowerCase().startsWith(APP_URL)) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
const VERSION = app.getVersion();

/* ---------------- config ---------------- */
const DEFAULTS = {
  logPath: null,
  league: null,                 // trade league id, auto-detected when null
  contact: "",                  // optional email/handle sent in the User-Agent (GGG and poe.ninja ask for one)
  priceOnCopy: true,            // price-check automatically when you Ctrl+C an item in game
  priceHotkey: "Ctrl+D",          // re-open the last price check / check clipboard
  overlayHotkey: "Ctrl+Shift+O",  // show / hide overlay
  interactHotkey: "Ctrl+Shift+I", // make overlay clickable / click-through
  copyHotkey: "Ctrl+Shift+F",     // copy the overlay's current search string
  wikiHotkey: "Ctrl+Alt+W",       // open the wiki page for the item you last copied
  pageHotkey: "Ctrl+Shift+P",     // next overlay page
  cheatHotkey: "Ctrl+Shift+H",    // show / cycle / hide cheat sheets
  streamEnabled: false,           // local page for OBS (Browser Source)
  streamPort: 47777,
  overlayVisible: true,
  overlayOpacity: 0.92,
  overlayBounds: null,
  accountName: "",              // pathofexile.com account name incl. #1234 (for public-profile access)
  oauthClientId: "",            // your own GGG OAuth client ID (GGG isn't issuing new ones right now)
  oauthRedirect: "http://127.0.0.1:8080/callback",
  notify: { gems: true, acts: true, trades: true, milestones: true },
  discordAppId: "",
  discordEnabled: false,
};
const cfgPath = () => path.join(app.getPath("userData"), "config.json");
let cfg = { ...DEFAULTS };
function loadCfg() { try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgPath(), "utf8")) }; } catch (e) { cfg = { ...DEFAULTS }; } }
function saveCfg() { try { fs.mkdirSync(path.dirname(cfgPath()), { recursive: true }); fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2)); } catch (e) { console.error(e); } }

/* ---------------- windows ---------------- */
let mainWin = null, overlayWin = null, priceWin = null;
let overlayInteractive = false, lastOverlayData = null, lastPriceText = null;
const prefs = () => ({ preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true });

function externalLinks(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.toLowerCase().startsWith(APP_URL)) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
}

function createMain() {
  mainWin = new BrowserWindow({ width: 1240, height: 900, minWidth: 380, backgroundColor: "#0e0c0a", title: APP_NAME, webPreferences: prefs() });
  mainWin.loadFile(path.join(__dirname, "app", "index.html"));
  externalLinks(mainWin);
  mainWin.on("closed", () => { mainWin = null; app.quit(); });
}

function defaultOverlayBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { width: 340, height: 460, x: wa.x + wa.width - 360, y: wa.y + 140 };
}
function createOverlay() {
  let b = cfg.overlayBounds || defaultOverlayBounds();
  // keep it on a connected screen
  const disp = screen.getDisplayMatching(b);
  if (!disp || b.x > disp.bounds.x + disp.bounds.width || b.y > disp.bounds.y + disp.bounds.height) b = defaultOverlayBounds();
  overlayWin = new BrowserWindow({
    ...b, frame: false, transparent: true, resizable: true, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, show: false, focusable: false, minWidth: 260, minHeight: 160, webPreferences: prefs(),
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setOpacity(cfg.overlayOpacity);
  overlayWin.loadFile(path.join(__dirname, "app", "overlay.html"));
  overlayWin.once("ready-to-show", () => { if (cfg.overlayVisible) overlayWin.showInactive(); if (lastOverlayData) overlayWin.webContents.send("overlay:data", lastOverlayData); });
  let t = null;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { if (overlayWin) { cfg.overlayBounds = overlayWin.getBounds(); saveCfg(); } }, 400); };
  overlayWin.on("moved", remember); overlayWin.on("resized", remember);
  overlayWin.on("closed", () => { overlayWin = null; });
}
function setOverlayInteractive(on) {
  if (!overlayWin) return;
  overlayInteractive = !!on;
  overlayWin.setIgnoreMouseEvents(!overlayInteractive, { forward: true });
  overlayWin.setFocusable(overlayInteractive);
  if (overlayInteractive && !overlayWin.isVisible()) overlayWin.showInactive();
  overlayWin.webContents.send("overlay:interactive", overlayInteractive);
  sendMain("overlay:interactive", overlayInteractive);
}
function toggleOverlay(force) {
  if (!overlayWin) createOverlay();
  const show = typeof force === "boolean" ? force : !overlayWin.isVisible();
  if (show) overlayWin.showInactive(); else { overlayWin.hide(); setOverlayInteractive(false); }
  cfg.overlayVisible = show; saveCfg();
  sendMain("overlay:visible", show);
}

function createPrice() {
  priceWin = new BrowserWindow({
    width: 400, height: 520, frame: false, resizable: true, alwaysOnTop: true, skipTaskbar: true, show: false,
    backgroundColor: "#15110d", webPreferences: prefs(),
  });
  priceWin.setAlwaysOnTop(true, "screen-saver");
  priceWin.loadFile(path.join(__dirname, "app", "price.html"));
  externalLinks(priceWin);
  priceWin.on("hide", () => globalShortcut.unregister("Escape"));
  priceWin.on("closed", () => { priceWin = null; });
}
function showPrice(text) {
  if (!priceWin) createPrice();
  lastPriceText = text;
  const pt = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  const [w, h] = priceWin.getSize();
  const x = Math.min(Math.max(wa.x, pt.x + 24), wa.x + wa.width - w);
  const y = Math.min(Math.max(wa.y, pt.y - 60), wa.y + wa.height - h);
  priceWin.setPosition(Math.round(x), Math.round(y));
  const send = () => priceWin.webContents.send("price:item", { text, league: cfg.league });
  if (priceWin.webContents.isLoading()) priceWin.webContents.once("did-finish-load", send); else send();
  priceWin.showInactive();
  // Escape closes the popup while it is open (released again on hide)
  if (!globalShortcut.isRegistered("Escape")) globalShortcut.register("Escape", () => priceWin && priceWin.hide());
}
const sendMain = (ch, data) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, data); };

/* ---------------- hotkeys ---------------- */
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const bind = (accel, fn, label) => {
    if (!accel) return;
    try { if (!globalShortcut.register(accel, fn)) sendMain("app:warning", `Hotkey ${accel} (${label}) is in use by another program.`); }
    catch (e) { sendMain("app:warning", `Hotkey "${accel}" (${label}) isn't valid.`); }
  };
  bind(cfg.overlayHotkey, () => toggleOverlay(), "show/hide overlay");
  bind(cfg.interactHotkey, () => setOverlayInteractive(!overlayInteractive), "overlay interact");
  bind(cfg.copyHotkey, () => {
    const s = lastOverlayData && lastOverlayData.regex;
    if (s) { ignoreClipboard = s; clipboard.writeText(s); overlayWin && overlayWin.webContents.send("overlay:toast", "Search copied: paste it with Ctrl+V"); }
  }, "copy search");
  bind(cfg.wikiHotkey, () => {
    const txt = isItemText(clipboard.readText()) ? clipboard.readText() : lastPriceText;
    const u = txt && wikiUrlFor(txt);
    if (u) shell.openExternal(u); else overlayWin && overlayWin.webContents.send("overlay:toast", "Copy an item in game first (Ctrl+C)");
  }, "wiki lookup");
  bind(cfg.pageHotkey, () => { if (!overlayWin) return; if (!overlayWin.isVisible()) toggleOverlay(true); overlayWin.webContents.send("overlay:page", "next"); }, "overlay page");
  bind(cfg.cheatHotkey, () => cycleCheat(), "cheat sheets");
  bind(cfg.priceHotkey, () => {
    const txt = clipboard.readText();
    if (isItemText(txt)) showPrice(txt); else if (lastPriceText) showPrice(lastPriceText);
    else overlayWin && overlayWin.webContents.send("overlay:toast", "Hover an item in game and press Ctrl+C first");
  }, "price check");
}

function wikiUrlFor(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const ri = lines.findIndex((l) => l.startsWith("Rarity:"));
  if (ri < 0) return null;
  const rarity = lines[ri].slice(7).trim().toLowerCase();
  const a = lines[ri + 1], b = lines[ri + 2] && lines[ri + 2] !== "--------" ? lines[ri + 2] : null;
  const name = rarity === "unique" || rarity === "gem" || rarity === "currency" || rarity === "divination card" ? a : rarity === "rare" ? b || a : a;
  return name ? "https://www.poewiki.net/wiki/" + encodeURIComponent(name.replace(/^(Superior|Synthesised) /, "").replace(/ /g, "_")) : null;
}

/* ---------------- stream page for OBS (local only) ---------------- */
const httpLib = require("http");
let streamServer = null, streamData = null;
function startStream() {
  if (streamServer) { streamServer.close(); streamServer = null; }
  if (!cfg.streamEnabled) { sendMain("stream:status", { ok: false, message: "Off" }); return; }
  streamServer = httpLib.createServer((req, res) => {
    if (req.url.startsWith("/data")) { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ overlay: lastOverlayData, stream: streamData })); return; }
    if (req.url === "/" || req.url.startsWith("/?")) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(path.join(__dirname, "app", "stream.html"))); return; }
    res.writeHead(404); res.end();
  });
  streamServer.on("error", (e) => sendMain("stream:status", { ok: false, message: `Port ${cfg.streamPort} is busy: pick another.` }));
  streamServer.listen(+cfg.streamPort || 47777, "127.0.0.1", () => sendMain("stream:status", { ok: true, url: `http://127.0.0.1:${+cfg.streamPort || 47777}/` }));
}

/* ---------------- clipboard watcher (price check on Ctrl+C) ---------------- */
// Reads the clipboard only. It never sends input to the game.
let lastClip = "", ignoreClipboard = null, clipTimer = null;
const isItemText = (t) => typeof t === "string" && /^Item Class: /m.test(t) && t.includes("--------") && /^Rarity: /m.test(t);
function startClipboardWatch() {
  lastClip = clipboard.readText();
  clipTimer = setInterval(() => {
    const t = clipboard.readText();
    if (t === lastClip) return;
    lastClip = t;
    if (t === ignoreClipboard) return;
    if (cfg.priceOnCopy && isItemText(t)) {
      showPrice(t);
      // let the same item be checked again with another Ctrl+C
      const marked = markItemText(t);
      ignoreClipboard = marked; lastClip = marked;
      clipboard.writeText(marked);
    }
  }, 250);
}

/* ---------------- live log ---------------- */
let tail = null;
function startLog() {
  if (tail) { tail.stop(); tail = null; }
  if (!cfg.logPath) {
    const found = detectLogPaths();
    if (found.length) { cfg.logPath = found[0].path; saveCfg(); }
  }
  if (!cfg.logPath) { sendMain("log:status", { ok: false, message: "Client.txt not found. Choose it under Settings → Desktop tools." }); return; }
  tail = new Tail(cfg.logPath,
    (text) => {
      const ev = parseEvents(text);
      if (!ev.length) return;
      sendMain("log:events", ev);
      for (const e of ev) {
        if (e.type === "whisper" && e.dir === "in" && e.trade) notify({ kind: "trades", title: `Trade: ${e.name}`, body: `${e.trade.item} for ${e.trade.amount} ${e.trade.currency}${e.trade.tab ? ` (tab "${e.trade.tab}", left ${e.trade.left}, top ${e.trade.top})` : ""}` });
      }
      if (overlayWin && ev.some((e) => e.type === "whisper" || e.type === "join")) overlayWin.webContents.send("overlay:trades", ev.filter((e) => e.type === "whisper" || e.type === "join"));
    },
    (err) => sendMain("log:status", { ok: false, message: "Can't read Client.txt: " + err.message }));
  if (tail.start()) sendMain("log:status", { ok: true, path: cfg.logPath });
}


/* ---------------- encrypted secrets (OAuth tokens, POESESSID) ---------------- */
const secretPath = () => path.join(app.getPath("userData"), "secrets.json");
let secrets = {};
function loadSecrets() { try { secrets = JSON.parse(fs.readFileSync(secretPath(), "utf8")); } catch (e) { secrets = {}; } }
function saveSecrets() { try { fs.writeFileSync(secretPath(), JSON.stringify(secrets)); } catch (e) { console.error(e); } }
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch (e) { return false; } };
const secretStore = {
  get(k) { const v = secrets[k]; if (!v) return null; try { return JSON.parse(v.enc ? safeStorage.decryptString(Buffer.from(v.data, "base64")) : v.data); } catch (e) { return null; } },
  set(k, val) { if (val == null) { delete secrets[k]; } else { const s = JSON.stringify(val); secrets[k] = canEncrypt() ? { enc: true, data: safeStorage.encryptString(s).toString("base64") } : { enc: false, data: s }; } saveSecrets(); },
};
const gggUA = () => `OAuth ${cfg.oauthClientId || "exilecompanion"}/${VERSION} (contact: ${cfg.contact || "not provided"}) ExileCompanion`;
let ggg = null;
const acctArgs = (a = {}) => ({ account: a.account || cfg.accountName, session: secretStore.get("poesessid"), ...a });
function acctStatus() {
  const t = ggg.tokens();
  return { mode: ggg.mode(), signedIn: ggg.signedIn(), user: t && t.username, refreshExpires: t && t.refresh_expires, hasSession: !!secretStore.get("poesessid"), accountName: cfg.accountName, encrypted: canEncrypt() };
}

/* ---------------- notifications ---------------- */
function notify({ title, body, kind }) {
  if (kind && cfg.notify && cfg.notify[kind] === false) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: title || APP_NAME, body: body || "", silent: false });
  n.on("click", () => { if (mainWin) { mainWin.show(); mainWin.focus(); } });
  n.show();
}

/* ---------------- Discord ---------------- */
let discord = null, lastActivity = null;
function startDiscord() {
  if (discord) { discord.close(); discord = null; }
  if (!cfg.discordEnabled || !cfg.discordAppId) { sendMain("discord:status", { ok: false, message: cfg.discordEnabled ? "Add your Discord application ID." : "Off" }); return; }
  discord = new DiscordRPC(cfg.discordAppId, (s) => sendMain("discord:status", s));
  discord.connect().then((ok) => { if (ok && lastActivity) discord.setActivity(lastActivity); });
}

/* ---------------- local loot filter files ---------------- */
const filterDir = () => path.join(app.getPath("documents"), "My Games", "Path of Exile");
function listFilters() {
  try { return fs.readdirSync(filterDir()).filter((f) => f.toLowerCase().endsWith(".filter")).map((f) => { const st = fs.statSync(path.join(filterDir(), f)); return { name: f, size: st.size, modified: st.mtimeMs }; }).sort((a, b) => b.modified - a.modified); }
  catch (e) { return []; }
}
const safeFilterName = (n) => path.basename(String(n || "")).replace(/[^\w .()-]/g, "");

/* ---------------- currency exchange history cache ---------------- */
const cxDir = () => path.join(app.getPath("userData"), "cx-cache");
async function cxHour(id) {
  const f = path.join(cxDir(), `${id || "first"}.json`);
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { /* not cached */ }
  const data = await ggg.currencyHour(id);
  // only cache complete hours
  if (id && data && data.next_change_id && data.next_change_id !== id) { try { fs.mkdirSync(cxDir(), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  return data;
}

/* ---------------- gear snapshot for "is this an upgrade?" ---------------- */
let gearSnapshot = null;


/* ---------------- cheat sheets (your own images over the game) ---------------- */
const cheatDir = () => path.join(app.getPath("userData"), "cheatsheets");
const listCheats = () => { try { return fs.readdirSync(cheatDir()).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).sort(); } catch (e) { return []; } };
let cheatWin = null, cheatIdx = -1;
function cycleCheat() {
  const list = listCheats();
  if (!list.length) { overlayWin && overlayWin.webContents.send("overlay:toast", "Add cheat sheets under Settings → Desktop tools first"); return; }
  cheatIdx++;
  if (cheatIdx >= list.length) { cheatIdx = -1; if (cheatWin) cheatWin.hide(); return; }
  const file = path.join(cheatDir(), list[cheatIdx]);
  const { nativeImage } = require("electron");
  const img = nativeImage.createFromPath(file); const sz = img.isEmpty() ? { width: 800, height: 600 } : img.getSize();
  const wa = screen.getPrimaryDisplay().workArea;
  const scale = Math.min(1, (wa.width * 0.85) / sz.width, (wa.height * 0.85) / sz.height);
  const w = Math.round(sz.width * scale), h = Math.round(sz.height * scale);
  if (!cheatWin) {
    cheatWin = new BrowserWindow({ width: w, height: h, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, resizable: false, webPreferences: prefs() });
    cheatWin.setAlwaysOnTop(true, "screen-saver"); cheatWin.setIgnoreMouseEvents(true);
    cheatWin.on("closed", () => { cheatWin = null; });
  }
  cheatWin.setBounds({ x: Math.round(wa.x + (wa.width - w) / 2), y: Math.round(wa.y + (wa.height - h) / 2), width: w, height: h });
  cheatWin.loadFile(path.join(__dirname, "app", "cheat.html"), { query: { src: "file:///" + file.replace(/\\/g, "/"), label: `${list[cheatIdx]} (${cheatIdx + 1}/${list.length})` } });
  cheatWin.showInactive();
}

/* ---------------- backups ---------------- */
const backupDir = () => path.join(app.getPath("userData"), "backups");
function autoBackup(json) {
  fs.mkdirSync(backupDir(), { recursive: true });
  const name = `auto-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(path.join(backupDir(), name), json);
  const autos = fs.readdirSync(backupDir()).filter((f) => f.startsWith("auto-")).sort();
  autos.slice(0, Math.max(0, autos.length - 7)).forEach((f) => { try { fs.unlinkSync(path.join(backupDir(), f)); } catch (e) { /* ignore */ } });
  return name;
}

/* ---------------- HTTP for the price checker (trade site + poe.ninja) ---------------- */
const ALLOWED_HOSTS = ["www.pathofexile.com", "pathofexile.com", "poe.ninja", "www.poewiki.net", "poewiki.net", "pobb.in", "pastebin.com"];
const cache = new Map(); // url -> {t, data}
const userAgent = () => `ExileCompanion/${VERSION} (desktop companion for Path of Exile${cfg.contact ? "; contact: " + cfg.contact : ""})`;
let tradeBlockedUntil = 0;
async function http({ url, method = "GET", body = null, cacheMs = 0, text = false }) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error("Host not allowed: " + u.hostname);
  const key = method + " " + url + (body ? JSON.stringify(body) : "");
  const hit = cache.get(key);
  if (cacheMs && hit && Date.now() - hit.t < cacheMs) return { ...hit.res, cached: true };
  const isTrade = u.hostname.endsWith("pathofexile.com");
  if (isTrade && Date.now() < tradeBlockedUntil) return { status: 429, retryAfter: Math.ceil((tradeBlockedUntil - Date.now()) / 1000), data: null };
  const res = await fetch(url, {
    method, headers: { "User-Agent": userAgent(), "Accept": text ? "text/html,text/plain,*/*" : "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = text ? await res.text() : await res.json(); } catch (e) { data = null; }
  const retryAfter = +res.headers.get("retry-after") || 0;
  if (isTrade && res.status === 429) tradeBlockedUntil = Date.now() + Math.max(retryAfter, 10) * 1000;
  const out = { status: res.status, retryAfter, data, rate: res.headers.get("x-rate-limit-ip-state") || "" };
  if (cacheMs && res.ok) cache.set(key, { t: Date.now(), res: out });
  return out;
}
async function detectLeague() {
  if (cfg.league) return cfg.league;
  try {
    const r = await http({ url: "https://www.pathofexile.com/api/trade/data/leagues", cacheMs: 3600e3 });
    const list = (r.data && r.data.result) || [];
    const pick = list.find((l) => (l.realm || "pc") === "pc" && !/standard|hardcore|\bhc\b|ssf|solo|ruthless/i.test(l.id));
    if (pick) { cfg.league = pick.id; saveCfg(); }
  } catch (e) { /* offline: keep null */ }
  return cfg.league;
}

/* ---------------- IPC ---------------- */
ipcMain.handle("cfg:get", () => ({ ...cfg, version: VERSION }));
ipcMain.handle("cfg:set", (e, patch) => {
  const before = { ...cfg };
  cfg = { ...cfg, ...patch }; saveCfg();
  if (["priceHotkey", "overlayHotkey", "interactHotkey", "copyHotkey", "wikiHotkey", "pageHotkey", "cheatHotkey"].some((k) => before[k] !== cfg[k])) registerHotkeys();
  if (before.streamEnabled !== cfg.streamEnabled || before.streamPort !== cfg.streamPort) startStream();
  if (before.logPath !== cfg.logPath) startLog();
  if (overlayWin && before.overlayOpacity !== cfg.overlayOpacity) overlayWin.setOpacity(cfg.overlayOpacity);
  if (before.discordAppId !== cfg.discordAppId || before.discordEnabled !== cfg.discordEnabled) startDiscord();
  return { ...cfg };
});
ipcMain.handle("log:detect", () => detectLogPaths());
ipcMain.handle("log:choose", async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: "Choose Client.txt", properties: ["openFile"], filters: [{ name: "Client.txt", extensions: ["txt"] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  cfg.logPath = r.filePaths[0]; saveCfg(); startLog(); return cfg.logPath;
});
ipcMain.handle("log:tail", (e, mb) => { if (!cfg.logPath) return null; try { return readTail(cfg.logPath, Math.min(+mb || 20, 200)); } catch (err) { return { error: err.message }; } });
ipcMain.handle("http", (e, req) => http(req));
ipcMain.handle("league:detect", () => detectLeague());
ipcMain.on("overlay:publish", (e, data) => { lastOverlayData = data; if (overlayWin) overlayWin.webContents.send("overlay:data", data); });
ipcMain.on("overlay:action", (e, a) => {
  if (a && a.type === "copy" && a.text) { ignoreClipboard = a.text; clipboard.writeText(a.text); overlayWin && overlayWin.webContents.send("overlay:toast", "Copied: paste it with Ctrl+V"); return; }
  if (a && a.type === "interactive") { setOverlayInteractive(a.value); return; }
  sendMain("overlay:action", a);
});
ipcMain.on("overlay:toggle", (e, v) => toggleOverlay(v));
ipcMain.on("overlay:interactive", (e, v) => setOverlayInteractive(v));
ipcMain.on("overlay:reset", () => { cfg.overlayBounds = null; saveCfg(); if (overlayWin) overlayWin.setBounds(defaultOverlayBounds()); });
ipcMain.on("price:close", () => priceWin && priceWin.hide());
ipcMain.on("price:test", (e, text) => showPrice(text));
ipcMain.on("clip:write", (e, t) => { ignoreClipboard = t; clipboard.writeText(String(t || "")); });
ipcMain.on("open:external", (e, url) => { if (typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url) && url.length < 2048) shell.openExternal(url); });


/* ---------------- IPC: account, filters, notifications, discord ---------------- */
const wrap = (fn) => async (e, a) => { try { return { ok: true, data: await fn(a || {}) } } catch (err) { return { ok: false, error: err.message || String(err) }; } };
ipcMain.handle("acct:status", () => acctStatus());
ipcMain.handle("acct:setSession", (e, sess) => { const v = String(sess || "").trim().replace(/^POESESSID=/i, ""); secretStore.set("poesessid", v || null); return acctStatus(); });
ipcMain.handle("acct:login", wrap(async () => { await ggg.login({ clientId: cfg.oauthClientId, redirectUri: cfg.oauthRedirect }); return acctStatus(); }));
ipcMain.handle("acct:logout", () => { ggg.logout(); return acctStatus(); });
ipcMain.handle("acct:chars", wrap((a) => ggg.characters(acctArgs(a))));
ipcMain.handle("acct:char", wrap((a) => ggg.character(acctArgs(a))));
ipcMain.handle("acct:stashList", wrap((a) => ggg.stashList(acctArgs(a))));
ipcMain.handle("acct:stashTab", wrap((a) => ggg.stashTab(acctArgs(a))));
ipcMain.handle("acct:leagueAccount", wrap((a) => ggg.leagueAccount(a.league)));
ipcMain.handle("acct:filters", wrap(() => ggg.filters()));
ipcMain.handle("acct:saveFilter", wrap((a) => ggg.saveFilter(a)));
ipcMain.handle("cx:hour", wrap((a) => cxHour(a.id)));
ipcMain.handle("filter:list", () => ({ dir: filterDir(), files: listFilters() }));
ipcMain.handle("filter:read", wrap((a) => fs.readFileSync(path.join(filterDir(), safeFilterName(a.name)), "utf8")));
ipcMain.handle("filter:write", wrap((a) => {
  const name = safeFilterName(a.name);
  if (!/^ExileCompanion/i.test(name) || !name.endsWith(".filter")) throw new Error("The app only writes filters named ExileCompanion….filter, so your own filters are never overwritten.");
  fs.mkdirSync(filterDir(), { recursive: true });
  fs.writeFileSync(path.join(filterDir(), name), a.text, "utf8");
  return path.join(filterDir(), name);
}));

ipcMain.handle("cheat:list", () => listCheats());
ipcMain.handle("cheat:add", async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: "Add cheat sheet images", properties: ["openFile", "multiSelections"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
  if (r.canceled) return listCheats();
  fs.mkdirSync(cheatDir(), { recursive: true });
  r.filePaths.forEach((f) => fs.copyFileSync(f, path.join(cheatDir(), path.basename(f))));
  return listCheats();
});
// removed sheets go to a trash folder first so the app can offer Undo; the trash is emptied on the next start
const cheatTrash = () => path.join(cheatDir(), ".trash");
ipcMain.handle("cheat:remove", (e, name) => {
  const base = path.basename(String(name));
  try { fs.mkdirSync(cheatTrash(), { recursive: true }); fs.renameSync(path.join(cheatDir(), base), path.join(cheatTrash(), base)); } catch (err) { /* ignore */ }
  cheatIdx = -1; if (cheatWin) cheatWin.hide(); return listCheats();
});
ipcMain.handle("cheat:restore", (e, name) => {
  const base = path.basename(String(name));
  try { fs.renameSync(path.join(cheatTrash(), base), path.join(cheatDir(), base)); } catch (err) { /* ignore */ }
  return listCheats();
});
// pause global hotkeys while the Settings page records a new key combination
ipcMain.on("hotkeys:suspend", (e, on) => { if (on) globalShortcut.unregisterAll(); else registerHotkeys(); });
ipcMain.handle("backup:save", wrap(async (json) => {
  const r = await dialog.showSaveDialog(mainWin, { title: "Save backup", defaultPath: path.join(app.getPath("documents"), `ExileCompanion-backup-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: "Backup", extensions: ["json"] }] });
  if (r.canceled || !r.filePath) throw new Error("Cancelled");
  fs.writeFileSync(r.filePath, typeof json === "string" ? json : JSON.stringify(json));
  return r.filePath;
}));
ipcMain.handle("backup:open", wrap(async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: "Restore backup", properties: ["openFile"], filters: [{ name: "Backup", extensions: ["json"] }] });
  if (r.canceled || !r.filePaths[0]) throw new Error("Cancelled");
  return fs.readFileSync(r.filePaths[0], "utf8");
}));
ipcMain.handle("backup:auto", wrap((json) => autoBackup(typeof json === "string" ? json : JSON.stringify(json))));
ipcMain.on("notify", (e, n) => notify(n));
ipcMain.on("discord:activity", (e, act) => { lastActivity = act; if (discord) discord.setActivity(act); });
ipcMain.on("discord:restart", () => startDiscord());
ipcMain.on("gear:publish", (e, g) => { gearSnapshot = g; });
ipcMain.on("stream:publish", (e, d) => { streamData = d; });
ipcMain.handle("gear:get", () => gearSnapshot);

/* ---------------- auto-update (GitHub Releases) ---------------- */
let updater = null, updateState = { state: "idle" };
function setupUpdater() {
  if (!app.isPackaged) { updateState = { state: "dev", message: "Updates are checked in the installed app." }; return; }
  try { updater = require("electron-updater").autoUpdater; } catch (e) { updateState = { state: "error", message: "Updater unavailable" }; return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  const send = (s) => { updateState = s; sendMain("update:status", s); };
  updater.on("checking-for-update", () => send({ state: "checking" }));
  updater.on("update-available", (i) => send({ state: "downloading", version: i.version }));
  updater.on("update-not-available", () => send({ state: "current", version: VERSION }));
  updater.on("download-progress", (p) => send({ state: "downloading", version: updateState.version, percent: Math.round(p.percent || 0) }));
  updater.on("update-downloaded", (i) => { send({ state: "ready", version: i.version }); notify({ title: "Exile Companion update ready", body: `Version ${i.version} installs when you restart the app.` }); });
  updater.on("error", (err) => send({ state: "error", message: String(err && err.message || err).slice(0, 200) }));
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 6 * 3600e3);
}
ipcMain.handle("update:status", () => ({ ...updateState, current: VERSION }));
ipcMain.handle("update:check", async () => { if (updater) { try { await updater.checkForUpdates(); } catch (e) { /* reported via events */ } } return { ...updateState, current: VERSION }; });
ipcMain.on("update:install", () => { if (updater && updateState.state === "ready") updater.quitAndInstall(false, true); });

/* ---------------- app lifecycle ---------------- */
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
  app.whenReady().then(async () => {
    loadCfg();
    loadSecrets();
    const { session } = require("electron");
    // deny camera, microphone, location, etc. for every page
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    ggg = new GGG({ store: secretStore, userAgent: gggUA, openExternal: (u) => shell.openExternal(u) });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "App", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" }] },
      { label: "Overlay", submenu: [
        { label: "Show / hide", click: () => toggleOverlay() },
        { label: "Click mode on / off", click: () => setOverlayInteractive(!overlayInteractive) },
        { label: "Reset position", click: () => { cfg.overlayBounds = null; saveCfg(); overlayWin && overlayWin.setBounds(defaultOverlayBounds()); } },
      ] },
    ]));
    try { fs.rmSync(path.join(app.getPath("userData"), "cheatsheets", ".trash"), { recursive: true, force: true }); } catch (e) { /* ignore */ }
    createMain();
    createOverlay();
    createPrice();
    registerHotkeys();
    startClipboardWatch();
    mainWin.webContents.once("did-finish-load", () => { startLog(); detectLeague().then((l) => sendMain("league", l)); startDiscord(); startStream(); setupUpdater(); });
  });
  app.on("will-quit", () => { globalShortcut.unregisterAll(); clearInterval(clipTimer); if (tail) tail.stop(); if (discord) discord.close(); if (streamServer) streamServer.close(); });
  app.on("window-all-closed", () => app.quit());
}

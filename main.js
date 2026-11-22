// Exile Companion desktop: main process.
// Windows: companion (main), overlay (click-through, always on top), price check popup.
"use strict";
const { app, BrowserWindow, WebContentsView, session, globalShortcut, ipcMain, clipboard, screen, shell, dialog, Menu, Notification, safeStorage } = require("electron");
const { webHostAllowed, blockNavigation } = require("./lib/webhosts");
const fs = require("fs");
const path = require("path");
const { parseEvents, detectLogPaths, readTail, Tail } = require("./lib/logtail");
const { GGG } = require("./lib/ggg");
const { DiscordRPC } = require("./lib/discord");
const { createClipWatcher } = require("./lib/clip");
const { redact, sanitizeCfg } = require("./lib/diag");
const os = require("os");

// recent background errors and warnings, for "Report a problem" (kept in memory only)
const DIAG = { errors: [], warnings: [] };
const diagPush = (list, msg) => { list.push({ t: Date.now(), m: String(msg).slice(0, 800) }); if (list.length > 30) list.shift(); };
process.on("uncaughtException", (err) => { diagPush(DIAG.errors, (err && err.stack) || err); console.error(err); });
process.on("unhandledRejection", (err) => { diagPush(DIAG.errors, "Unhandled promise: " + ((err && err.stack) || err)); console.error(err); });

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
const WEB_PARTITION = "persist:web";
app.on("web-contents-created", (_e, contents) => {
  // the in-app browser's pages live in their own session and get their own rules (see "in-app browser" below)
  if (contents.session === session.fromPartition(WEB_PARTITION)) { contents.on("will-attach-webview", (e) => e.preventDefault()); return; }
  // no new windows, no navigation away from the app, no embedded webviews
  contents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) openLink(url); return { action: "deny" }; });
  contents.on("will-navigate", (e, url) => { if (!url.toLowerCase().startsWith(APP_URL)) { e.preventDefault(); if (/^https:\/\//i.test(url)) openLink(url); } });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
const VERSION = app.getVersion();

/* ---------------- config ---------------- */
const DEFAULTS = {
  inAppBrowser: true,           // open trade, wiki and poe.ninja links inside the app
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
  pinHotkey: "Ctrl+Shift+B",      // show / hide the browser pinned over the game
  pinBounds: null,
  pinOpacity: 1,
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
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) openLink(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.toLowerCase().startsWith(APP_URL)) { e.preventDefault(); if (/^https:\/\//i.test(url)) openLink(url); } });
}

const APP_ICON = path.join(__dirname, "app", "icon.png");
let splashWin = null;
function createSplash() {
  splashWin = new BrowserWindow({ width: 420, height: 300, frame: false, transparent: true, roundedCorners: false, resizable: false, movable: true, alwaysOnTop: true,
    skipTaskbar: true, show: false, icon: APP_ICON, webPreferences: prefs() });
  splashWin.loadFile(path.join(__dirname, "app", "splash.html"), { query: { v: VERSION } });
  splashWin.once("ready-to-show", () => splashWin && splashWin.show());
  splashWin.on("closed", () => { splashWin = null; });
}
function createMain() {
  const shownAt = Date.now();
  mainWin = new BrowserWindow({ width: 1240, height: 900, minWidth: 380, backgroundColor: "#0e0c0a", title: APP_NAME, icon: APP_ICON, show: false, webPreferences: prefs() });
  mainWin.loadFile(path.join(__dirname, "app", "index.html"));
  // show the main window once it has painted; keep the splash up at least ~0.9s so it doesn't flash
  const reveal = () => setTimeout(() => {
    if (mainWin && !mainWin.isVisible()) mainWin.show();
    if (splashWin) splashWin.close();
  }, Math.max(0, 900 - (Date.now() - shownAt)));
  mainWin.once("ready-to-show", reveal);
  setTimeout(reveal, 8000); // never leave the user staring at a splash
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
    ...b, frame: false, transparent: true, roundedCorners: false, resizable: true, alwaysOnTop: true, skipTaskbar: true,
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
/* recent price checks: kept in memory only, gone when the app closes */
const clipHistory = [];
function itemTitle(text) {
  const l = String(text).replace(/\r/g, "").split("\n").map((x) => x.trim());
  const ri = l.findIndex((x) => x.startsWith("Rarity:"));
  if (ri < 0) return "Item";
  const a = l[ri + 1] || "", b = l[ri + 2] && l[ri + 2] !== "--------" ? l[ri + 2] : "";
  return b ? `${a} ${b}` : a;
}
function rememberItem(text) {
  const i = clipHistory.findIndex((h) => h.text === text);
  if (i >= 0) clipHistory.splice(i, 1);
  clipHistory.unshift({ text, title: itemTitle(text), rarity: (String(text).match(/^Rarity: (.+)$/m) || [])[1] || "", at: Date.now() });
  clipHistory.length = Math.min(clipHistory.length, 20);
  sendMain("clip:history", clipHistory.map(({ title, rarity, at }) => ({ title, rarity, at })));
}
function showPrice(text) {
  if (!priceWin) createPrice();
  lastPriceText = text;
  rememberItem(text);
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
const sendMain = (ch, data) => { if (ch === "app:warning") diagPush(DIAG.warnings, data); if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, data); };

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
    if (s) { ignoreClip(s); clipWrite(s); overlayWin && overlayWin.webContents.send("overlay:toast", "Search copied: paste it with Ctrl+V"); }
  }, "copy search");
  bind(cfg.wikiHotkey, async () => {
    const cur = await clipRead();
    const txt = isItemText(cur) ? cur : lastPriceText;
    const u = txt && wikiUrlFor(txt);
    if (u) openLink(u); else overlayWin && overlayWin.webContents.send("overlay:toast", "Copy an item in game first (Ctrl+C)");
  }, "wiki lookup");
  bind(cfg.pageHotkey, () => { if (!overlayWin) return; if (!overlayWin.isVisible()) toggleOverlay(true); overlayWin.webContents.send("overlay:page", "next"); }, "overlay page");
  bind(cfg.cheatHotkey, () => cycleCheat(), "cheat sheets");
  bind(cfg.pinHotkey, () => togglePin(), "pinned browser");
  bind(cfg.priceHotkey, async () => {
    const txt = await clipRead();
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

/* ---------------- clipboard helpers ----------------
   Electron 44+ made clipboard reads/writes return Promises; older versions return values directly.
   These work on both. */
const clipRead = async () => { try { const r = clipboard.readText(); return (r && typeof r.then === "function" ? await r : r) || ""; } catch (e) { return ""; } };
const clipWrite = async (t) => { try { const r = clipboard.writeText(String(t || "")); if (r && typeof r.then === "function") await r; } catch (e) { /* ignore */ } };

/* ---------------- clipboard watcher (price check on Ctrl+C) ---------------- */
// Reads the clipboard only. It never sends input to the game.
let clipTimer = null;
const isItemText = (t) => typeof t === "string" && /^Item Class: /m.test(t) && t.includes("--------") && /^Rarity: /m.test(t);
const clipWatch = createClipWatcher({ read: clipRead, write: clipWrite, isItem: isItemText, enabled: () => cfg.priceOnCopy, onItem: (t) => showPrice(t) });
// anything the app itself copies (searches, trade replies) must not look like a new copy from the game
const ignoreClip = (t) => clipWatch.expect(t);
async function startClipboardWatch() {
  await clipWatch.prime();
  clipTimer = setInterval(() => { clipWatch.poll().catch(() => {}); }, 250);
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
let secrets = {};       // what's on disk (encrypted when possible)
let secretCache = {};   // decrypted values, in memory only
let encOK = false;
// safeStorage: Electron 45 adds async methods and deprecates the sync ones (removed in 46). Use whichever exists.
const SS = {
  async available() {
    try { if (typeof safeStorage.isAsyncEncryptionAvailable === "function") return !!(await safeStorage.isAsyncEncryptionAvailable()); return safeStorage.isEncryptionAvailable(); }
    catch (e) { return false; }
  },
  async encrypt(text) { return Buffer.from(typeof safeStorage.encryptStringAsync === "function" ? await safeStorage.encryptStringAsync(text) : safeStorage.encryptString(text)); },
  async decrypt(buf) {
    if (typeof safeStorage.decryptStringAsync === "function") { const r = await safeStorage.decryptStringAsync(buf); return typeof r === "string" ? r : r && r.result; }
    return safeStorage.decryptString(buf);
  },
};
async function loadSecrets() {
  try { secrets = JSON.parse(fs.readFileSync(secretPath(), "utf8")); } catch (e) { secrets = {}; }
  encOK = await SS.available();
  secretCache = {};
  for (const [k, v] of Object.entries(secrets)) {
    try { secretCache[k] = JSON.parse(v.enc ? await SS.decrypt(Buffer.from(v.data, "base64")) : v.data); } catch (e) { /* unreadable: treat as missing */ }
  }
}
function saveSecrets() { try { fs.writeFileSync(secretPath(), JSON.stringify(secrets)); } catch (e) { console.error(e); } }
let secretWrites = Promise.resolve();
const canEncrypt = () => encOK;
const secretStore = {
  get(k) { return secretCache[k] == null ? null : secretCache[k]; },
  set(k, val) {
    if (val == null) delete secretCache[k]; else secretCache[k] = val;
    // persist in order; the in-memory value is usable immediately
    secretWrites = secretWrites.then(async () => {
      const cur = secretCache[k];
      if (cur == null) delete secrets[k];
      else { const s = JSON.stringify(cur); secrets[k] = encOK ? { enc: true, data: (await SS.encrypt(s)).toString("base64") } : { enc: false, data: s }; }
      saveSecrets();
    }).catch((e) => console.error(e));
  },
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
const { safeFilterName } = require("./lib/files");

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
    cheatWin = new BrowserWindow({ width: w, height: h, frame: false, transparent: true, roundedCorners: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, resizable: false, webPreferences: prefs() });
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
  if (["priceHotkey", "overlayHotkey", "interactHotkey", "copyHotkey", "wikiHotkey", "pageHotkey", "cheatHotkey", "pinHotkey"].some((k) => before[k] !== cfg[k])) registerHotkeys();
  if (pinWin && before.pinOpacity !== cfg.pinOpacity) pinWin.setOpacity(Math.min(1, Math.max(0.4, +cfg.pinOpacity || 1)));
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
  if (a && a.type === "copy" && a.text) { ignoreClip(a.text); clipWrite(a.text); overlayWin && overlayWin.webContents.send("overlay:toast", "Copied: paste it with Ctrl+V"); return; }
  if (a && a.type === "interactive") { setOverlayInteractive(a.value); return; }
  sendMain("overlay:action", a);
});
ipcMain.on("overlay:toggle", (e, v) => toggleOverlay(v));
ipcMain.on("overlay:interactive", (e, v) => setOverlayInteractive(v));
ipcMain.on("overlay:reset", () => { cfg.overlayBounds = null; saveCfg(); if (overlayWin) overlayWin.setBounds(defaultOverlayBounds()); });
ipcMain.on("price:close", () => priceWin && priceWin.hide());
ipcMain.on("price:test", (e, text) => showPrice(text));
ipcMain.on("clip:write", (e, t) => { ignoreClip(t); clipWrite(t); });
ipcMain.handle("diag:get", () => {
  const ctx = { home: os.homedir(), user: (() => { try { return os.userInfo().username; } catch (e) { return ""; } })() };
  const displays = screen.getAllDisplays().map((d) => `${d.size.width}x${d.size.height}@${d.scaleFactor}x`);
  const clean = (list) => list.map((x) => ({ t: x.t, m: redact(x.m, ctx) }));
  return {
    app: VERSION, packaged: app.isPackaged, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
    os: `${os.type()} ${os.release()} (${os.arch()})`, locale: app.getLocale(), displays,
    memoryMB: Math.round(process.memoryUsage().rss / 1048576), uptimeMin: Math.round(process.uptime() / 60),
    cfg: sanitizeCfg(cfg, ctx), update: updateState && { state: updateState.state, version: updateState.version, message: updateState.message && redact(updateState.message, ctx) },
    log: { set: !!cfg.logPath, exists: !!(cfg.logPath && fs.existsSync(cfg.logPath)) },
    errors: clean(DIAG.errors), warnings: clean(DIAG.warnings),
    redactCtx: { home: ctx.home, user: ctx.user },
  };
});
ipcMain.handle("diag:save", async (e, text) => {
  const body = String(text || "").slice(0, 1024 * 1024);
  const r = await dialog.showSaveDialog(mainWin, { title: "Save problem report", defaultPath: `exile-companion-report-${new Date().toISOString().slice(0, 10)}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, body, "utf8");
  return path.basename(r.filePath);
});
ipcMain.on("open:external", (e, url) => { if (typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url) && url.length < 2048) openLink(url); });
// always the user's own browser (the "Open in my browser" button)
ipcMain.on("browser:external", (e, url) => { if (typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url) && url.length < 2048) shell.openExternal(url); });



/* ---------------- in-app browser ----------------
   Web pages run in a WebContentsView inside the main window, in their own session ("persist:web"):
   no preload, sandboxed, no access to the app's IPC, secrets or files. Only allowlisted sites load;
   other links ask the user and open in their own browser. Downloads, pop-up windows and device
   permissions are blocked (except the trade site's "copy whisper" button, which needs clipboard write). */
let webView = null;
let webShown = false;
function webSession() { return session.fromPartition(WEB_PARTITION); }
let sessionReady = false;
function prepareWebSession() {
  if (sessionReady) return;
  sessionReady = true;
  const ses = webSession();
  // Keep Electron's own user agent: Cloudflare's human check (Turnstile) loops forever when the user agent
  // is rewritten to look like plain Chrome, because the other browser signals then don't match.
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(perm === "clipboard-sanitized-write" && webHostAllowed(details && details.requestingUrl)));
  ses.setPermissionCheckHandler((wc, perm, origin) => perm === "clipboard-sanitized-write" && webHostAllowed(origin));
  ses.on("will-download", (e, item) => { e.preventDefault(); sendMain("browser:blocked", { url: item.getURL(), reason: "download" }); });
}
// a sandboxed web view on the shared "persist:web" session; send(channel, data) reports its state
function makeWebView(send) {
  prepareWebSession();
  const view = new WebContentsView({ webPreferences: { partition: WEB_PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
  view.setBackgroundColor("#0e0c0a");
  const wc = view.webContents;
  // keep the page itself on allowlisted sites; frames inside it (e.g. Cloudflare's human check) are left alone
  const guard = (e, url, isMainFrame) => {
    const main = e && e.isMainFrame !== undefined ? e.isMainFrame : isMainFrame;
    const target = (e && e.url) || url;
    if (blockNavigation(target, main)) { e.preventDefault(); if (/^https:\/\//i.test(target)) send("browser:blocked", { url: target }); }
  };
  wc.on("will-navigate", (e, url) => guard(e, url, true));                                         // main frame only
  wc.on("will-redirect", (e, url, isInPlace, isMainFrame) => guard(e, url, isMainFrame));            // fires for frames too
  wc.on("will-frame-navigate", (e) => guard(e, e.url, e.isMainFrame));
  wc.setWindowOpenHandler(({ url }) => { if (webHostAllowed(url)) wc.loadURL(url); else if (/^https:\/\//i.test(url)) send("browser:blocked", { url }); return { action: "deny" }; });
  const push = (extra) => {
    if (wc.isDestroyed()) return;
    const h = wc.navigationHistory;
    send("browser:state", { url: wc.getURL(), title: wc.getTitle(), canBack: h.canGoBack(), canForward: h.canGoForward(), loading: wc.isLoading(), ...(extra || {}) });
  };
  ["did-navigate", "did-navigate-in-page", "page-title-updated", "did-start-loading", "did-stop-loading"].forEach((ev) => wc.on(ev, () => push()));
  wc.on("did-fail-load", (e, code, desc, url, isMain) => { if (isMain && code !== -3) push({ error: `${desc} (${code})`, failedUrl: url }); });
  wc.on("render-process-gone", () => push({ error: "The page crashed. Press reload." }));
  return view;
}
function ensureWebView() {
  if (webView || !mainWin || mainWin.isDestroyed()) return webView;
  webView = makeWebView(sendMain);
  mainWin.contentView.addChildView(webView);
  webView.setVisible(false);
  return webView;
}
function webGo(url) {
  if (!webHostAllowed(url)) { if (/^https:\/\//i.test(String(url))) sendMain("browser:blocked", { url }); return false; }
  ensureWebView();
  if (webView) webView.webContents.loadURL(url).catch(() => {});
  return true;
}
// every "open this link" in the app goes through here
function openLink(url) {
  if (cfg.inAppBrowser !== false && webHostAllowed(url) && mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show(); mainWin.focus();
    sendMain("browser:show", { url });
    webGo(url);
    return;
  }
  shell.openExternal(url);
}
ipcMain.handle("browser:go", (e, url) => webGo(String(url || "")));
ipcMain.on("browser:nav", (e, what) => {
  if (!webView) return;
  const wc = webView.webContents, h = wc.navigationHistory;
  if (what === "back" && h.canGoBack()) h.goBack();
  else if (what === "forward" && h.canGoForward()) h.goForward();
  else if (what === "reload") wc.reload();
  else if (what === "stop") wc.stop();
});
ipcMain.on("browser:bounds", (e, b) => {
  if (!b || !b.visible) { if (webView && webShown) { webView.setVisible(false); webShown = false; } return; }
  ensureWebView();
  if (!webView) return;
  const [cw, ch] = mainWin.getContentSize();
  // the page reports CSS pixels; scale by the app's zoom so the view lines up if the user zoomed (Ctrl +/-)
  const z = mainWin.webContents.getZoomFactor() || 1;
  const r = (v) => Math.max(0, Math.round((+v || 0) * z));
  const x = Math.min(r(b.x), cw), y = Math.min(r(b.y), ch);
  webView.setBounds({ x, y, width: Math.min(r(b.width), cw - x), height: Math.min(r(b.height), ch - y) });
  if (!webShown) { webView.setVisible(true); webShown = true; }
});
ipcMain.handle("browser:state", () => { if (!webView) return null; const wc = webView.webContents; return { url: wc.getURL(), title: wc.getTitle(), canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward(), loading: wc.isLoading() }; });
ipcMain.handle("browser:clear", async () => {
  try { const ses = webSession(); await ses.clearStorageData(); await ses.clearCache(); if (webView) webView.webContents.loadURL("about:blank").catch(() => {}); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message || String(err) }; }
});

/* ---------------- browser pinned over the game ----------------
   An always-on-top window with its own sandboxed view on the same web session, so sign-ins carry over.
   It only shows and hides: nothing is sent to the game. Esc (while the window has focus) hides it. */
let pinWin = null, pinView = null;
const PIN_BAR = 36;
const sendPin = (ch, data) => { if (pinWin && !pinWin.isDestroyed()) pinWin.webContents.send(ch === "browser:state" ? "pin:state" : ch === "browser:blocked" ? "pin:blocked" : ch, data); };
function layoutPin() { if (!pinWin || !pinView) return; const [w, h] = pinWin.getContentSize(); pinView.setBounds({ x: 0, y: PIN_BAR, width: w, height: Math.max(0, h - PIN_BAR) }); }
function createPin() {
  const b = cfg.pinBounds || (() => { const wa = screen.getPrimaryDisplay().workArea; return { width: 720, height: 640, x: wa.x + wa.width - 760, y: wa.y + 60 }; })();
  pinWin = new BrowserWindow({ ...b, minWidth: 380, minHeight: 260, frame: false, alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: "#0e0c0a", title: "Exile Companion browser", icon: APP_ICON, webPreferences: prefs() });
  pinWin.setAlwaysOnTop(true, "screen-saver");
  pinWin.setOpacity(Math.min(1, Math.max(0.4, +cfg.pinOpacity || 1)));
  pinWin.loadFile(path.join(__dirname, "app", "pin.html"));
  externalLinks(pinWin);
  pinView = makeWebView(sendPin);
  pinWin.contentView.addChildView(pinView);
  pinView.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "Escape") { e.preventDefault(); pinWin.hide(); } });
  layoutPin();
  pinWin.on("resize", layoutPin);
  const saveBounds = () => { if (pinWin && !pinWin.isDestroyed()) { cfg.pinBounds = pinWin.getBounds(); saveCfg(); } };
  pinWin.on("moved", saveBounds); pinWin.on("resized", saveBounds);
  pinWin.on("closed", () => { pinWin = null; pinView = null; });
}
function pinStartUrl(url) {
  if (url && webHostAllowed(url)) return url;
  const cur = pinView && pinView.webContents.getURL();
  if (cur && cur !== "about:blank") return null;
  const main = webView && webView.webContents.getURL();
  return main && webHostAllowed(main) ? main : "https://www.pathofexile.com/trade";
}
function togglePin(show, url) {
  if (!pinWin) createPin();
  const want = show === undefined ? !pinWin.isVisible() : !!show;
  if (!want) { pinWin.hide(); return false; }
  const u = pinStartUrl(url);
  if (u) pinView.webContents.loadURL(u).catch(() => {});
  pinWin.show(); pinWin.focus(); pinView.webContents.focus();
  return true;
}
ipcMain.handle("pin:toggle", (e, a) => togglePin(a && a.show, a && a.url));
ipcMain.on("pin:nav", (e, what) => {
  if (!pinView) return;
  const wc = pinView.webContents, h = wc.navigationHistory;
  if (what === "back" && h.canGoBack()) h.goBack();
  else if (what === "forward" && h.canGoForward()) h.goForward();
  else if (what === "reload") wc.reload();
  else if (what === "hide") pinWin.hide();
  else if (what === "app") { const u = wc.getURL(); pinWin.hide(); if (u && webHostAllowed(u)) openLink(u); }
});
ipcMain.handle("pin:go", (e, url) => { if (!pinView || !webHostAllowed(String(url || ""))) return false; pinView.webContents.loadURL(String(url)).catch(() => {}); return true; });
ipcMain.handle("pin:opacity", (e, v) => { cfg.pinOpacity = Math.min(1, Math.max(0.4, +v || 1)); saveCfg(); if (pinWin) pinWin.setOpacity(cfg.pinOpacity); return cfg.pinOpacity; });
ipcMain.handle("clip:history", () => clipHistory.map(({ title, rarity, at }) => ({ title, rarity, at })));
ipcMain.on("clip:recheck", (e, i) => { const h = clipHistory[+i]; if (h) showPrice(h.text); });
ipcMain.on("clip:clear", () => { clipHistory.length = 0; sendMain("clip:history", []); });

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
ipcMain.handle("filter:read", wrap((a) => {
  const name = safeFilterName(a.name);
  if (!name) throw new Error("That isn't a .filter file.");
  const p = path.join(filterDir(), name);
  if (!fs.existsSync(p)) throw new Error(`Couldn't find ${name} in ${filterDir()}. Use Refresh, or Choose file… if it's somewhere else.`);
  return fs.readFileSync(p, "utf8");
}));
ipcMain.handle("filter:openFolder", wrap(async () => { fs.mkdirSync(filterDir(), { recursive: true }); const err = await shell.openPath(filterDir()); if (err) throw new Error(err); return filterDir(); }));
// open a filter that isn't in the game's folder (read-only; saving still goes to the game's folder)
ipcMain.handle("filter:choose", wrap(async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: "Open a loot filter", defaultPath: filterDir(), properties: ["openFile"], filters: [{ name: "Loot filters", extensions: ["filter"] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  if (!/\.filter$/i.test(p)) throw new Error("Pick a .filter file.");
  if (fs.statSync(p).size > 20 * 1024 * 1024) throw new Error("That file is too big to be a loot filter.");
  return { name: path.basename(p), text: fs.readFileSync(p, "utf8"), dir: path.dirname(p) };
}));
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
  if (process.platform === "win32") app.setAppUserModelId("app.exilecompanion.desktop");
  app.whenReady().then(async () => {
    loadCfg();
    await loadSecrets();
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
    createSplash();
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

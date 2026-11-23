// Exile Companion desktop: main process.
// Windows: companion (main), overlay (click-through, always on top), price check popup.
"use strict";
const { app, BrowserWindow, WebContentsView, session, globalShortcut, ipcMain, clipboard, screen, shell, dialog, Menu, Notification, safeStorage } = require("electron");
const { webHostAllowed, blockNavigation, mediaHostAllowed } = require("./lib/webhosts");
const fs = require("fs");
const path = require("path");
const { parseEvents, detectLogPaths, readTail, Tail } = require("./lib/logtail");
const { GGG } = require("./lib/ggg");
const { DiscordRPC } = require("./lib/discord");
const { createClipWatcher } = require("./lib/clip");
const { redact, sanitizeCfg } = require("./lib/diag");
const os = require("os");
const T0 = Date.now();
// Windows test run (GitHub Actions): EC_SMOKE=<report.json> opens every page and window in a throwaway profile,
// writes a report and quits. Nothing else changes; a normal start never sets it.
const SMOKE = /\.json$/i.test(process.env.EC_SMOKE || "") ? process.env.EC_SMOKE : "";
if (SMOKE) app.setPath("userData", path.join(os.tmpdir(), "ec-smoke-" + process.pid));
// local error/crash log (logs/app.log in the app's folder), redacted as it's written
const { createLog, startupGuard } = require("./lib/crashlog");
const REDACT_CTX = { home: os.homedir(), user: (() => { try { return os.userInfo().username; } catch (e) { return ""; } })() };
const LOG = createLog(path.join(app.getPath("userData"), "logs"), { redact: (s) => redact(s, REDACT_CTX) });
let SAFE = "", GUARD = null, T_READY = 0;

// recent background errors and warnings, for "Report a problem" (kept in memory only)
const DIAG = { errors: [], warnings: [] };
const diagPush = (list, msg) => { list.push({ t: Date.now(), m: String(msg).slice(0, 800) }); if (list.length > 30) list.shift(); LOG.write(list === DIAG.errors ? "error" : "warn", "main", msg); };
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
const MEDIA_PARTITION = "persist:media";
app.on("web-contents-created", (_e, contents) => {
  // the in-app browser's pages live in their own session and get their own rules (see "in-app browser" below)
  if (contents.session === session.fromPartition(WEB_PARTITION) || contents.session === session.fromPartition(MEDIA_PARTITION)) { contents.on("will-attach-webview", (e) => e.preventDefault()); return; }
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
  // Price checks run only when you press the price hotkey: GGG allows reading the clipboard once per manual key press,
  // so the app no longer watches the clipboard on a timer (the old "automatic on Ctrl+C" mode was removed in 1.22).
  priceHotkey: "Ctrl+D",          // price check: reads the clipboard once (press Ctrl+C on the item first)
  overlayHotkey: "Ctrl+Shift+O",  // show / hide overlay
  interactHotkey: "Ctrl+Shift+I", // make overlay clickable / click-through
  copyHotkey: "Ctrl+Shift+F",     // copy the overlay's current search string
  wikiHotkey: "Ctrl+Alt+W",       // open the wiki page for the item you last copied
  pageHotkey: "Ctrl+Shift+P",     // next overlay page
  widgetHotkey: "Ctrl+Shift+Space", // overlay Tools page (stash searches, stopwatch, notes) in click mode
  cheatHotkey: "Ctrl+Shift+H",    // show / cycle / hide cheat sheets
  pinHotkey: "Ctrl+Shift+B",      // show / hide the browser pinned over the game
  stashHotkey: "Ctrl+Shift+G",    // outline the latest trade's item on the stash grid
  stashBounds: null,              // where the stash grid sits on screen (set by lining it up once)
  mediaHotkey: "Ctrl+Shift+M",    // show / hide the media mini player
  mediaPlayHotkey: "",            // play / pause (mini player, or whatever plays in Windows)
  mediaClickHotkey: "",           // mini player click-through on / off
  mediaBounds: null,
  mediaOpacity: 1,
  mediaUrl: "https://www.youtube.com/",
  nowPlaying: true,               // show what plays in Windows (Windows media controls)
  pinBounds: null,
  pinOpacity: 1,
  streamEnabled: false,           // local page for OBS (Browser Source)
  streamPort: 47777,
  phoneEnabled: false,            // phone screen on your home network (needs the private link)
  phonePort: 47778,
  phoneKey: "",                   // the private part of the phone link (made on first use; "New link" replaces it)
  twitchEnabled: false,           // answer chat commands in your Twitch chat
  twitchChannel: "",              // chat to join (empty = the account you signed in with)
  twitchClientId: "",             // overrides the built-in client ID (only needed for your own Twitch app)
  twitchCmds: {},                 // { build: false, ... } turns single commands off
  twitchCustom: [],               // [{ name, text }] your own text commands
  twitchCooldown: 20,             // seconds before the same command answers again
  twitchModsOnly: false,          // only the broadcaster and moderators can use commands
  pobEnabled: true,               // Path of Building numbers in the price check (needs Path of Building Community installed)
  pobPath: "",                    // Path of Building's folder, if it isn't in a usual place
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
  const k = Math.min(2, Math.max(0.75, (+cfg.overlayScale || 100) / 100)), width = Math.round(340 * k), height = Math.min(wa.height - 160, Math.round(460 * k));
  return { width, height, x: wa.x + wa.width - width - 20, y: wa.y + 140 };
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
// Tools menu: opens the overlay on its Tools page in click mode; pressing the hotkey again leaves click mode
let widgetsOpen = false;
function toggleWidgets() {
  if (widgetsOpen && overlayWin && overlayWin.isVisible() && overlayInteractive) { widgetsOpen = false; setOverlayInteractive(false); return; }
  if (!overlayWin || !overlayWin.isVisible()) toggleOverlay(true);
  if (!overlayWin) return;
  overlayWin.webContents.send("overlay:page", "tools");
  widgetsOpen = true;
  setOverlayInteractive(true);
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
function showPrice(text, reused) {
  if (!priceWin) createPrice();
  sizePrice();
  lastPriceText = text;
  rememberItem(text);
  const pt = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  const [w, h] = priceWin.getSize();
  const x = Math.min(Math.max(wa.x, pt.x + 24), wa.x + wa.width - w);
  const y = Math.min(Math.max(wa.y, pt.y - 60), wa.y + wa.height - h);
  priceWin.setPosition(Math.round(x), Math.round(y));
  const send = () => priceWin.webContents.send("price:item", { text, league: cfg.league, reused: !!reused });
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
  bind(cfg.widgetHotkey, () => toggleWidgets(), "tools menu");
  bind(cfg.pageHotkey, () => { if (!overlayWin) return; if (!overlayWin.isVisible()) toggleOverlay(true); overlayWin.webContents.send("overlay:page", "next"); }, "overlay page");
  bind(cfg.cheatHotkey, () => cycleCheat(), "cheat sheets");
  bind(cfg.pinHotkey, () => togglePin(), "pinned browser");
  bind(cfg.stashHotkey, () => { if (stashWin && stashWin.isVisible() && !stashCal) stashWin.hide(); else sendMain("stash:hotkey", true); }, "stash highlight");
  bind(cfg.mediaHotkey, () => toggleMedia(), "media player");
  bind(cfg.mediaPlayHotkey, () => mediaPlayPause(), "play / pause");
  bind(cfg.mediaClickHotkey, () => setMediaClickThrough(!mediaClickThrough), "media click-through");
  bind(cfg.priceHotkey, async () => {
    const txt = await clipRead();
    if (isItemText(txt)) showPrice(txt); else if (lastPriceText) showPrice(lastPriceText, true);
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
    const font = /^\/fonts\/(Cinzel\.woff|SourceSans3\.ttf)$/.exec(req.url);
    if (font) { res.writeHead(200, { "Content-Type": font[1].endsWith(".ttf") ? "font/ttf" : "font/woff", "Cache-Control": "max-age=86400" }); res.end(fs.readFileSync(path.join(__dirname, "app", "fonts", font[1]))); return; }
    if (req.url === "/" || req.url.startsWith("/?")) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(path.join(__dirname, "app", "stream.html"))); return; }
    res.writeHead(404); res.end();
  });
  streamServer.on("error", (e) => sendMain("stream:status", { ok: false, message: `Port ${cfg.streamPort} is busy: pick another.` }));
  streamServer.listen(+cfg.streamPort || 47777, "127.0.0.1", () => sendMain("stream:status", { ok: true, url: `http://127.0.0.1:${+cfg.streamPort || 47777}/` }));
}

/* ---------------- phone screen (your home network, read-only) ----------------
   Off by default. Every request needs the private key from the link/QR code; only private network addresses are
   answered; nothing can be sent back to the app or the game. */
const { qrSvg } = require("./lib/qr");
let phoneServer = null, phoneState = { on: false };
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== "IPv4" && a.family !== 4) continue; if (a.internal) continue;
    if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
    out.push({ ip: a.address, name, virtual: /virtual|vethernet|vmware|vbox|hyper-v|wsl|docker|loopback|tailscale|zerotier/i.test(name) });
  }
  return out.sort((x, y) => (x.virtual - y.virtual) || ((/^192\.168\./.test(y.ip) ? 1 : 0) - (/^192\.168\./.test(x.ip) ? 1 : 0)));
}
const privateRemote = (addr) => /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(String(addr || "")) || addr === "::1";
function keyOk(given) {
  const a = Buffer.from(String(given || "")), b = Buffer.from(String(cfg.phoneKey || ""));
  return b.length >= 16 && a.length === b.length && require("crypto").timingSafeEqual(a, b);
}
function phoneStatus(extra) {
  const port = +cfg.phonePort || 47778, ips = lanAddresses();
  const urls = ips.map((x) => `http://${x.ip}:${port}/?k=${cfg.phoneKey}`);
  let qr = ""; try { if (urls[0]) qr = qrSvg(urls[0], { scale: 5, margin: 4 }); } catch (e) { /* ignore */ }
  return { on: !!phoneServer, enabled: !!cfg.phoneEnabled, port, urls, ips, qr, ...(extra || {}) };
}
function startPhone() {
  if (phoneServer) { try { phoneServer.close(); } catch (e) { /* ignore */ } phoneServer = null; }
  if (!cfg.phoneEnabled) { sendMain("phone:status", phoneStatus({ message: "Off" })); return; }
  if (!cfg.phoneKey || cfg.phoneKey.length < 16) { cfg.phoneKey = require("crypto").randomBytes(18).toString("base64url"); saveCfg(); }
  const sec = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "X-Frame-Options": "DENY" };
  phoneServer = httpLib.createServer((req, res) => {
    if (req.method !== "GET" || !privateRemote(req.socket.remoteAddress)) { res.writeHead(403, sec); res.end(); return; }
    let u; try { u = new URL(req.url, "http://x"); } catch (e) { res.writeHead(400, sec); res.end(); return; }
    const font = /^\/fonts\/(Cinzel\.woff|SourceSans3\.ttf)$/.exec(u.pathname);
    if (font) { res.writeHead(200, { ...sec, "Content-Type": font[1].endsWith(".ttf") ? "font/ttf" : "font/woff", "Cache-Control": "max-age=86400" }); res.end(fs.readFileSync(path.join(__dirname, "app", "fonts", font[1]))); return; }
    if (!keyOk(u.searchParams.get("k"))) {
      res.writeHead(403, { ...sec, "Content-Type": u.pathname === "/data" ? "application/json" : "text/html; charset=utf-8" });
      res.end(u.pathname === "/data" ? "{}" : "<!DOCTYPE html><meta name=viewport content='width=device-width'><body style='font:16px system-ui;background:#0e0c0a;color:#eee;padding:20px'>This link isn't valid. Scan the QR code in Exile Companion (Desktop tools → Phone screen).</body>");
      return;
    }
    if (u.pathname === "/data") { res.writeHead(200, { ...sec, "Content-Type": "application/json" }); res.end(JSON.stringify({ overlay: lastOverlayData })); return; }
    if (u.pathname === "/") { res.writeHead(200, { ...sec, "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(path.join(__dirname, "app", "phone.html"))); return; }
    res.writeHead(404, sec); res.end();
  });
  phoneServer.on("error", (e) => { phoneServer = null; sendMain("phone:status", phoneStatus({ message: e.code === "EADDRINUSE" ? `Port ${cfg.phonePort} is busy: pick another.` : "Couldn't start: " + e.message })); });
  phoneServer.listen(+cfg.phonePort || 47778, "0.0.0.0", () => { LOG.info("phone", `phone screen on port ${+cfg.phonePort || 47778}`); sendMain("phone:status", phoneStatus()); });
}
ipcMain.handle("phone:status", () => phoneStatus());
ipcMain.on("phone:set", (e, o) => {
  if (!o || typeof o !== "object") return;
  if (typeof o.on === "boolean") cfg.phoneEnabled = o.on;
  if (o.port != null) { const p = Math.round(+o.port); if (p >= 1024 && p <= 65535) cfg.phonePort = p; }
  if (o.newKey) cfg.phoneKey = require("crypto").randomBytes(18).toString("base64url");
  saveCfg(); startPhone();
});

/* ---------------- Twitch chat commands ----------------
   Signs in with Twitch's device code flow (public client, no secret), keeps the token encrypted with the other
   secrets, joins your chat and answers !build, !level, !map, !deaths, !profit, !league, !commands and your own. */
const TWITCH_CLIENT_ID = "e1o36ijxp4mhz747xe4kw0jmbzatc1";   // Exile Companion's public Twitch client ID (a public client: not a secret)
const twitchLib = require("./lib/twitch");
let twitchWs = null, twitchState = { state: "off" }, twitchTimer = null, twitchBackoff = 1000, twitchCmdState = {}, twitchFlow = null;
const twitchClient = () => String(cfg.twitchClientId || TWITCH_CLIENT_ID || "").trim();
const twitchTokens = () => { try { const t = secretStore.get("twitch"); return t && typeof t === "object" ? t : null; } catch (e) { return null; } };
function twitchSend(st) { twitchState = { ...st, login: (twitchTokens() || {}).login || null, channel: twitchChannelName(), enabled: !!cfg.twitchEnabled, hasClient: !!twitchClient() }; sendMain("twitch:status", twitchState); }
const twitchChannelName = () => String(cfg.twitchChannel || (twitchTokens() || {}).login || "").toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "").slice(0, 25);
async function twitchForm(url, data) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, data: j };
}
async function twitchValidate(access) {
  const r = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: "OAuth " + access } });
  if (r.status !== 200) return null; const j = await r.json(); return { login: j.login, expires: Date.now() + (+j.expires_in || 0) * 1000 };
}
async function twitchRefresh() {
  const t = twitchTokens(); if (!t || !t.refresh) return false;
  const r = await twitchForm("https://id.twitch.tv/oauth2/token", { client_id: twitchClient(), grant_type: "refresh_token", refresh_token: t.refresh });
  if (r.status !== 200 || !r.data || !r.data.access_token) { LOG.warn("twitch", `refresh failed (${r.status})`); return false; }
  secretStore.set("twitch", { ...t, access: r.data.access_token, refresh: r.data.refresh_token || t.refresh, expires: Date.now() + (+r.data.expires_in || 14000) * 1000 });
  return true;
}
// sign in: show a code, the user approves it on twitch.tv/activate, we poll for the token
async function twitchSignIn() {
  if (!twitchClient()) { twitchSend({ state: "error", message: "Twitch commands need the app's Twitch client ID (see Desktop tools → Twitch)." }); return; }
  if (twitchFlow) twitchFlow.cancelled = true;
  const flow = (twitchFlow = { cancelled: false });
  try {
    const r = await twitchForm("https://id.twitch.tv/oauth2/device", { client_id: twitchClient(), scopes: "chat:read chat:edit" });
    if (r.status !== 200 || !r.data || !r.data.device_code) { twitchSend({ state: "error", message: `Twitch didn't start the sign-in (${(r.data && r.data.message) || r.status}).` }); return; }
    const { device_code, user_code, verification_uri, expires_in, interval } = r.data;
    twitchSend({ state: "code", code: user_code, uri: verification_uri, until: Date.now() + (+expires_in || 1800) * 1000 });
    if (/^https:\/\/(www\.)?twitch\.tv\/activate/.test(verification_uri)) shell.openExternal(verification_uri);
    let wait = Math.max(5, +interval || 5) * 1000; const end = Date.now() + (+expires_in || 1800) * 1000;
    while (!flow.cancelled && Date.now() < end) {
      await sleep(wait); if (flow.cancelled) return;
      const t = await twitchForm("https://id.twitch.tv/oauth2/token", { client_id: twitchClient(), scopes: "chat:read chat:edit", device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
      if (t.status === 200 && t.data && t.data.access_token) {
        const v = await twitchValidate(t.data.access_token);
        secretStore.set("twitch", { access: t.data.access_token, refresh: t.data.refresh_token, expires: Date.now() + (+t.data.expires_in || 14000) * 1000, login: v ? v.login : "" });
        LOG.info("twitch", "signed in"); cfg.twitchEnabled = true; saveCfg(); twitchFlow = null; twitchConnect(); return;
      }
      const msg = String((t.data && (t.data.message || t.data.error)) || "");
      if (/slow_down/.test(msg)) wait += 5000; else if (!/authorization_pending/.test(msg)) { twitchSend({ state: "error", message: `Sign-in stopped: ${msg || t.status}` }); twitchFlow = null; return; }
    }
    if (!flow.cancelled) twitchSend({ state: "error", message: "The sign-in code expired. Try again." });
  } catch (e) { twitchSend({ state: "error", message: "Couldn't reach Twitch: " + e.message }); }
}
function twitchClose() { clearTimeout(twitchTimer); twitchTimer = null; if (twitchWs) { const w = twitchWs; twitchWs = null; try { w.onclose = null; w.close(); } catch (e) { /* ignore */ } } }
async function twitchConnect() {
  twitchClose();
  if (!cfg.twitchEnabled) { twitchSend({ state: "off" }); return; }
  let t = twitchTokens(); if (!t) { twitchSend({ state: "signed-out" }); return; }
  if (typeof WebSocket !== "function") { twitchSend({ state: "error", message: "This version can't open a chat connection." }); return; }
  if (!t.expires || t.expires - Date.now() < 10 * 60e3) { if (!(await twitchRefresh())) { twitchSend({ state: "signed-out", message: "Twitch sign-in expired: sign in again." }); return; } t = twitchTokens(); }
  const channel = twitchChannelName(); if (!channel) { twitchSend({ state: "error", message: "No channel to join." }); return; }
  twitchSend({ state: "connecting" });
  const ws = (twitchWs = new WebSocket("wss://irc-ws.chat.twitch.tv:443"));
  let buf = "";
  ws.onopen = () => { ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands"); ws.send("PASS oauth:" + t.access); ws.send("NICK " + (t.login || "justinfan" + Math.floor(Math.random() * 1e5))); ws.send("JOIN #" + channel); };
  ws.onmessage = async (ev) => {
    buf += String(ev.data); const lines = buf.split("\r\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line) continue; const m = twitchLib.parseIrc(line);
      if (m.command === "PING") { ws.send("PONG :" + (m.trailing || "tmi.twitch.tv")); continue; }
      if (m.command === "001") { twitchBackoff = 1000; }
      if (m.command === "JOIN" && m.nick === t.login) { twitchSend({ state: "connected" }); LOG.info("twitch", "joined #" + channel); }
      if (m.command === "RECONNECT") { twitchClose(); twitchTimer = setTimeout(twitchConnect, 1000); return; }
      if (m.command === "NOTICE" && /authentication failed|improperly formatted auth/i.test(m.trailing || "")) {
        twitchClose(); if (await twitchRefresh()) twitchTimer = setTimeout(twitchConnect, 1000); else twitchSend({ state: "signed-out", message: "Twitch sign-in expired: sign in again." }); return;
      }
      if (m.command === "PRIVMSG") {
        const r = twitchLib.handleMessage(m, { overlay: lastOverlayData, stream: streamData }, { cmds: cfg.twitchCmds || {}, custom: cfg.twitchCustom || [], cooldown: cfg.twitchCooldown, modsOnly: cfg.twitchModsOnly, self: t.login }, twitchCmdState);
        if (r && twitchWs === ws) { ws.send(`${r.replyTo ? `@reply-parent-msg-id=${r.replyTo} ` : ""}PRIVMSG #${channel} :${r.text}`); sendMain("twitch:reply", { cmd: r.cmd, by: m.nick, text: r.text, t: Date.now() }); }
      }
    }
  };
  ws.onclose = () => { if (twitchWs !== ws) return; twitchWs = null; if (!cfg.twitchEnabled) return; twitchSend({ state: "connecting", message: "Reconnecting…" }); twitchTimer = setTimeout(twitchConnect, twitchBackoff); twitchBackoff = Math.min(60000, twitchBackoff * 2); };
  ws.onerror = () => { LOG.warn("twitch", "chat connection error"); };
}
ipcMain.handle("twitch:status", () => ({ ...twitchState, login: (twitchTokens() || {}).login || null, channel: twitchChannelName(), enabled: !!cfg.twitchEnabled, hasClient: !!twitchClient() }));
ipcMain.on("twitch:signin", () => { twitchSignIn(); });
ipcMain.on("twitch:cancel", () => { if (twitchFlow) twitchFlow.cancelled = true; twitchFlow = null; twitchSend({ state: twitchTokens() ? (cfg.twitchEnabled ? "connecting" : "off") : "signed-out" }); if (twitchTokens() && cfg.twitchEnabled) twitchConnect(); });
ipcMain.on("twitch:signout", () => { twitchClose(); secretStore.set("twitch", null); cfg.twitchEnabled = false; saveCfg(); twitchSend({ state: "signed-out" }); });
ipcMain.on("twitch:set", (e, o) => {
  if (!o || typeof o !== "object") return;
  const reconnect = ("enabled" in o) || ("channel" in o);
  if ("enabled" in o) cfg.twitchEnabled = !!o.enabled;
  if ("channel" in o) cfg.twitchChannel = String(o.channel || "").toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "").slice(0, 25);
  if ("cmds" in o && o.cmds && typeof o.cmds === "object") cfg.twitchCmds = Object.fromEntries(Object.keys(twitchLib.DEFAULT_CMDS).map((k) => [k, o.cmds[k] !== false]));
  if ("custom" in o && Array.isArray(o.custom)) cfg.twitchCustom = o.custom.map((c) => ({ name: String(c && c.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20), text: String(c && c.text || "").replace(/[\r\n]+/g, " ").slice(0, 400) })).filter((c) => c.name.length >= 2 && c.text && !(c.name in twitchLib.DEFAULT_CMDS)).slice(0, 20);
  if ("cooldown" in o) cfg.twitchCooldown = Math.max(5, Math.min(600, Math.round(+o.cooldown) || 20));
  if ("modsOnly" in o) cfg.twitchModsOnly = !!o.modsOnly;
  saveCfg(); if (reconnect) twitchConnect(); else twitchSend(twitchState);
});

/* ---------------- Path of Building numbers ----------------
   Runs the user's own Path of Building headless (bundled LuaJIT + pob/pob-server.lua, shipped as resources/pob)
   to answer "what does this item do to my build?" for the price check. One process, started when first needed
   (or warmed up shortly after start), stopped after 30 idle minutes. */
const pobLib = require("./lib/pob");
const POB_BUNDLE = app.isPackaged ? path.join(process.resourcesPath, "pob") : path.join(__dirname, "pobbuild");
let pobRunner = null, pobXml = null, pobIdle = null, pobWarm = null;
const pobAvailable = () => process.platform === "win32" && fs.existsSync(path.join(POB_BUNDLE, "luajit.exe")) && fs.existsSync(path.join(POB_BUNDLE, "pob-server.lua"));
const pobDir = () => pobLib.findPob(process.env, cfg.pobPath || null);
function pobGetRunner() {
  const dir = pobDir(); if (!dir || !pobAvailable()) return null;
  if (pobRunner && pobRunner.pobDir !== dir) { pobRunner.stop(); pobRunner = null; }
  if (!pobRunner) pobRunner = new pobLib.PobRunner({ luajit: path.join(POB_BUNDLE, "luajit.exe"), scriptDir: POB_BUNDLE, pobDir: dir, log: (m) => LOG.info("pob", m) });
  return pobRunner;
}
function pobTouch() { clearTimeout(pobIdle); pobIdle = setTimeout(() => { if (pobRunner) { pobRunner.stop(); LOG.info("pob", "stopped after 30 idle minutes"); } }, 30 * 60e3); }
function pobStatus() {
  return { available: pobAvailable(), enabled: cfg.pobEnabled !== false, dir: pobDir(), picked: cfg.pobPath || "", running: !!(pobRunner && pobRunner.proc), skill: pobRunner ? pobRunner.skill : "", hasBuild: !!pobXml };
}
async function pobCompare(text) {
  if (cfg.pobEnabled === false) return { ok: false, off: true };
  const slots = pobLib.slotsFor(text); if (!slots.length) return { ok: false, skip: true };
  if (!pobAvailable()) return { ok: false, unavailable: true };
  const r0 = pobGetRunner(); if (!r0) return { ok: false, missing: true };
  if (!pobXml) return { ok: false, error: "Import your build first (Build page)." };
  pobTouch();
  try {
    const lb = await r0.ensureBuild(pobXml); if (!lb.ok) return { ok: false, error: "Path of Building couldn't load your build: " + (lb.error || "") };
    const r = await r0.request({ op: "compare", item: String(text).slice(0, 20000), slots });
    if (!r.ok) return { ok: false, error: r.error || "Path of Building couldn't compare this item" };
    return { ok: true, summary: pobLib.summarize(r) };
  } catch (e) { LOG.warn("pob", e.message); return { ok: false, error: e.message }; }
}
ipcMain.on("pob:build", (e, xml) => {
  const x = typeof xml === "string" && xml.length < 4e6 && /<PathOfBuilding/i.test(xml) ? xml : null;
  if (x === pobXml) return; pobXml = x;
  clearTimeout(pobWarm);
  if (x && cfg.pobEnabled !== false && !SAFE) pobWarm = setTimeout(() => { const r = pobGetRunner(); if (r) { pobTouch(); r.ensureBuild(pobXml).catch(() => {}); } }, 20000);
});
ipcMain.handle("pob:compare", (e, text) => pobCompare(text));
ipcMain.handle("pob:status", () => pobStatus());
ipcMain.handle("pob:pick", async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: "Choose your Path of Building folder (the one with Path of Building.exe)", properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return { ...pobStatus(), message: "" };
  if (!pobLib.isPobDir(r.filePaths[0])) return { ...pobStatus(), message: "That folder doesn't look like Path of Building (no Launch.lua)." };
  cfg.pobPath = r.filePaths[0]; saveCfg(); if (pobRunner) { pobRunner.stop(); pobRunner = null; } return pobStatus();
});
ipcMain.on("pob:set", (e, o) => { if (o && typeof o.enabled === "boolean") { cfg.pobEnabled = o.enabled; saveCfg(); if (!o.enabled && pobRunner) { pobRunner.stop(); pobRunner = null; } } });

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
// No background clipboard polling (GGG: clipboard reads only once per manual key press). Kept as a no-op for startup order.
async function startClipboardWatch() {}

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
  showCheatAt(list, cheatIdx);
}
// a cheat sheet by file name (automatic sheets): only names that exist in the cheat sheet folder
function showCheatFile(name) {
  const list = listCheats(), i = list.indexOf(String(name || ""));
  if (i < 0) return false;
  cheatIdx = i; showCheatAt(list, i); return true;
}
function hideCheat() { cheatIdx = -1; if (cheatWin && !cheatWin.isDestroyed()) cheatWin.hide(); }
function showCheatAt(list, idx) {
  const file = path.join(cheatDir(), list[idx]);
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
  cheatWin.loadFile(path.join(__dirname, "app", "cheat.html"), { query: { src: "file:///" + file.replace(/\\/g, "/"), label: `${list[idx]} (${idx + 1}/${list.length})` } });
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
const { createLimiter, groupOf } = require("./lib/ratelimit");
const tradeLimiter = createLimiter();
// how long the next trade request to this URL would wait (the price popup says so instead of looking stuck)
ipcMain.handle("trade:wait", (e, url) => {
  try { const u = new URL(String(url)); if (!u.hostname.endsWith("pathofexile.com")) return 0; return Math.max(0, tradeLimiter.waitFor(groupOf(u.href)), tradeBlockedUntil - Date.now()); } catch (err) { return 0; }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tradeQueue = Promise.resolve();
async function http({ url, method = "GET", body = null, cacheMs = 0, text = false }) {
  const u = new URL(url);
  // league data published in this app's own GitHub repo (JSON only) is the one exception to the host list
  const repoData = u.hostname === "raw.githubusercontent.com" && u.pathname.startsWith("/nickolusliquori/exile-companion/main/data/") && u.pathname.endsWith(".json");
  if (u.protocol !== "https:" || (!ALLOWED_HOSTS.includes(u.hostname) && !repoData)) throw new Error("Host not allowed: " + u.hostname);
  const key = method + " " + url + (body ? JSON.stringify(body) : "");
  const hit = cache.get(key);
  if (cacheMs && hit && Date.now() - hit.t < cacheMs) return { ...hit.res, cached: true };
  const isTrade = u.hostname.endsWith("pathofexile.com");
  if (isTrade && Date.now() < tradeBlockedUntil) return { status: 429, retryAfter: Math.ceil((tradeBlockedUntil - Date.now()) / 1000), data: null };
  // trade requests go out one at a time, paced to stay under GGG's limits (waits longer than 20 s report "busy" instead)
  const group = isTrade ? groupOf(url) : null;
  if (isTrade) {
    const turn = tradeQueue.then(async () => {
      const w = tradeLimiter.waitFor(group);
      if (w > 20000) return w;
      if (w) await sleep(w);
      tradeLimiter.sent(group);
      return 0;
    });
    tradeQueue = turn.catch(() => 0);
    const tooLong = await turn;
    if (tooLong) return { status: 429, retryAfter: Math.ceil(tooLong / 1000), data: null };
  }
  const res = await fetch(url, {
    method, headers: { "User-Agent": userAgent(), "Accept": text ? "text/html,text/plain,*/*" : "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = text ? await res.text() : await res.json(); } catch (e) { data = null; }
  const retryAfter = +res.headers.get("retry-after") || 0;
  if (isTrade) tradeLimiter.learn(group, (h) => res.headers.get(h));
  if (isTrade && res.status === 429) tradeBlockedUntil = Date.now() + Math.max(retryAfter, 10) * 1000;
  const out = { status: res.status, retryAfter, data, rate: res.headers.get("x-rate-limit-ip-state") || "" };
  if (cacheMs && res.ok) cache.set(key, { t: Date.now(), res: out });
  return out;
}
// League: the newest softcore trade league, re-checked at start and every 6 hours. When a new challenge league
// appears (or the saved one has ended) the app switches to it and tells the main window, unless the user pinned one.
const { pickLeague } = require("./lib/league");
async function detectLeague() {
  try {
    const r = await http({ url: "https://www.pathofexile.com/api/trade/data/leagues", cacheMs: 3600e3 });
    const list = ((r.data && r.data.result) || []).map((l) => ({ id: l.id, realm: l.realm }));
    const d = pickLeague(list, { current: cfg.league, lastChallenge: cfg.lastChallenge, pinned: !!cfg.leaguePinned });
    if (d.challenge && d.challenge !== cfg.lastChallenge) { cfg.lastChallenge = d.challenge; saveCfg(); }
    if (d.league && d.league !== cfg.league) {
      const from = cfg.league; cfg.league = d.league; saveCfg();
      if (from) { sendMain("league:new", { from, to: d.league, reason: d.reason }); notify({ kind: "milestones", title: "New league: " + d.league, body: "Price checks and prices now use " + d.league + ". Open the app for a quick new-league checklist." }); }
    }
  } catch (e) { /* offline: keep what we have */ }
  return cfg.league;
}


/* ---------------- IPC ---------------- */
ipcMain.handle("cfg:get", () => ({ ...cfg, version: VERSION }));
ipcMain.handle("cfg:set", (e, patch) => {
  const before = { ...cfg };
  cfg = { ...cfg, ...patch }; saveCfg();
  if (["priceHotkey", "overlayHotkey", "interactHotkey", "copyHotkey", "wikiHotkey", "pageHotkey", "widgetHotkey", "cheatHotkey", "pinHotkey", "mediaHotkey", "mediaPlayHotkey", "mediaClickHotkey", "stashHotkey"].some((k) => before[k] !== cfg[k])) registerHotkeys();
  if (mediaWin && before.mediaOpacity !== cfg.mediaOpacity) mediaWin.setOpacity(Math.min(1, Math.max(0.3, +cfg.mediaOpacity || 1)));
  if (before.nowPlaying !== cfg.nowPlaying) { if (cfg.nowPlaying === false) { mediaBridge.stop(); broadcastNow({ off: true }); } else pollNow(); }
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
    errors: clean(DIAG.errors), warnings: clean(DIAG.warnings), logTail: LOG.tail(60), safe: SAFE,
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
// each kind of web view: its own session (cookies, sign-ins) and its own list of sites
const PROFILES = {
  web: { partition: WEB_PARTITION, allowed: webHostAllowed, perm: (perm, url) => perm === "clipboard-sanitized-write" && webHostAllowed(url) },
  media: { partition: MEDIA_PARTITION, allowed: mediaHostAllowed, perm: () => false },
};
const sessionsReady = new Set();
function prepareWebSession(profile) {
  profile = profile || PROFILES.web;
  if (sessionsReady.has(profile.partition)) return;
  sessionsReady.add(profile.partition);
  const ses = session.fromPartition(profile.partition);
  if (profile !== PROFILES.web) {
    ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(profile.perm(perm, details && details.requestingUrl)));
    ses.setPermissionCheckHandler((wc, perm, origin) => profile.perm(perm, origin));
    ses.on("will-download", (e) => e.preventDefault());
    return;
  }
  // Keep Electron's own user agent: Cloudflare's human check (Turnstile) loops forever when the user agent
  // is rewritten to look like plain Chrome, because the other browser signals then don't match.
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(perm === "clipboard-sanitized-write" && webHostAllowed(details && details.requestingUrl)));
  ses.setPermissionCheckHandler((wc, perm, origin) => perm === "clipboard-sanitized-write" && webHostAllowed(origin));
  ses.on("will-download", (e, item) => { e.preventDefault(); sendMain("browser:blocked", { url: item.getURL(), reason: "download" }); });
}
// a sandboxed web view on the shared "persist:web" session; send(channel, data) reports its state
function makeWebView(send, profile) {
  profile = profile || PROFILES.web;
  prepareWebSession(profile);
  const allowed = profile.allowed;
  const view = new WebContentsView({ webPreferences: { partition: profile.partition, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
  view.setBackgroundColor("#0e0c0a");
  const wc = view.webContents;
  // keep the page itself on allowlisted sites; frames inside it (e.g. Cloudflare's human check) are left alone
  const guard = (e, url, isMainFrame) => {
    const main = e && e.isMainFrame !== undefined ? e.isMainFrame : isMainFrame;
    const target = (e && e.url) || url;
    if (main !== false && !allowed(target)) { e.preventDefault(); if (/^https:\/\//i.test(target)) send("browser:blocked", { url: target }); }
  };
  wc.on("will-navigate", (e, url) => guard(e, url, true));                                         // main frame only
  wc.on("will-redirect", (e, url, isInPlace, isMainFrame) => guard(e, url, isMainFrame));            // fires for frames too
  wc.on("will-frame-navigate", (e) => guard(e, e.url, e.isMainFrame));
  wc.setWindowOpenHandler(({ url }) => { if (allowed(url)) wc.loadURL(url); else if (/^https:\/\//i.test(url)) send("browser:blocked", { url }); return { action: "deny" }; });
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
/* ---------------- media: mini player over the game + "now playing" from Windows ----------------
   The mini player is a sandboxed view on its own session ("persist:media") limited to video and music sites
   without copy protection (YouTube, YouTube Music, Twitch…). Click-through lets clicks pass to the game. */
const { createMedia } = require("./lib/media");
const mediaBridge = createMedia();
let mediaWin = null, mediaView = null, mediaClickThrough = false, lastNow = null, nowTimer = null;
const MEDIA_BAR = 34;
const sendMedia = (ch, data) => { if (mediaWin && !mediaWin.isDestroyed()) mediaWin.webContents.send(ch === "browser:state" ? "media:view" : ch === "browser:blocked" ? "media:blocked" : ch, data); if (ch === "browser:state") pushPlayer(); };
function layoutMedia() { if (!mediaWin || !mediaView) return; const [w, h] = mediaWin.getContentSize(); mediaView.setBounds({ x: 0, y: MEDIA_BAR, width: w, height: Math.max(0, h - MEDIA_BAR) }); }
function createMediaWin() {
  const b = cfg.mediaBounds || (() => { const wa = screen.getPrimaryDisplay().workArea; return { width: 480, height: 304, x: wa.x + wa.width - 500, y: wa.y + wa.height - 330 }; })();
  mediaWin = new BrowserWindow({ ...b, minWidth: 260, minHeight: 170, frame: false, alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: "#000000", title: "Exile Companion media", icon: APP_ICON, webPreferences: prefs() });
  mediaWin.setAlwaysOnTop(true, "screen-saver");
  mediaWin.setOpacity(Math.min(1, Math.max(0.3, +cfg.mediaOpacity || 1)));
  mediaWin.loadFile(path.join(__dirname, "app", "media.html"));
  externalLinks(mediaWin);
  mediaView = makeWebView(sendMedia, PROFILES.media);
  mediaView.setBackgroundColor("#000000");
  mediaWin.contentView.addChildView(mediaView);
  layoutMedia();
  mediaWin.on("resize", layoutMedia);
  const saveBounds = () => { if (mediaWin && !mediaWin.isDestroyed()) { cfg.mediaBounds = mediaWin.getBounds(); saveCfg(); } };
  mediaWin.on("moved", saveBounds); mediaWin.on("resized", saveBounds);
  mediaWin.on("show", pushPlayer); mediaWin.on("hide", pushPlayer);
  mediaWin.on("closed", () => { mediaWin = null; mediaView = null; mediaClickThrough = false; pushPlayer(); });
  mediaView.webContents.on("media-started-playing", pushPlayer);
  mediaView.webContents.on("media-paused", pushPlayer);
  mediaView.webContents.on("did-navigate", (e, url) => { if (mediaHostAllowed(url)) { cfg.mediaUrl = url; saveCfg(); } });
}
function toggleMedia(show, url) {
  if (!mediaWin) createMediaWin();
  const want = show === undefined ? !mediaWin.isVisible() : !!show;
  if (!want) { mediaWin.hide(); return false; }
  const cur = mediaView.webContents.getURL();
  const u = url && mediaHostAllowed(url) ? url : (!cur || cur === "about:blank") ? (mediaHostAllowed(cfg.mediaUrl) ? cfg.mediaUrl : "https://www.youtube.com/") : null;
  if (u) mediaView.webContents.loadURL(u).catch(() => {});
  // show without stealing focus from the game; click it to interact
  mediaWin.showInactive();
  return true;
}
function setMediaClickThrough(on) {
  mediaClickThrough = !!on && !!mediaWin;
  if (mediaWin) { mediaWin.setIgnoreMouseEvents(mediaClickThrough, { forward: true }); mediaWin.webContents.send("media:click", mediaClickThrough); }
  pushPlayer();
}
// controls run inside the player page itself (its own video element and buttons): nothing reaches the game
const PLAYER_JS = {
  state: `(()=>{const v=document.querySelector('video');return v?{has:true,paused:v.paused,volume:v.volume,muted:v.muted,time:v.currentTime,dur:isFinite(v.duration)?v.duration:0}:{has:false}})()`,
  toggle: `(()=>{const v=document.querySelector('video');if(!v)return false;if(v.paused)v.play();else v.pause();return true})()`,
  next: `(()=>{const b=document.querySelector('.ytp-next-button,ytmusic-player-bar .next-button,[aria-label="Next"],[data-a-target="player-skip-forward"]');if(b){b.click();return true}return false})()`,
  prev: `(()=>{const b=document.querySelector('.ytp-prev-button,ytmusic-player-bar .previous-button,[aria-label="Previous"]');if(b){b.click();return true}const v=document.querySelector('video');if(v){v.currentTime=0;return true}return false})()`,
};
async function playerState() {
  if (!mediaWin || !mediaView) return { open: false };
  const wc = mediaView.webContents;
  let v = { has: false };
  try { v = await wc.executeJavaScript(PLAYER_JS.state, true); } catch (e) { /* page busy */ }
  return { open: true, visible: mediaWin.isVisible(), url: wc.getURL(), title: wc.getTitle(), clickThrough: mediaClickThrough, opacity: mediaWin.getOpacity(), ...v, muted: wc.isAudioMuted() || !!v.muted };
}
let pushT = null;
function pushPlayer() { clearTimeout(pushT); pushT = setTimeout(async () => { const st = await playerState(); sendMain("media:player", st); if (mediaWin && !mediaWin.isDestroyed()) mediaWin.webContents.send("media:player", st); }, 120); }
async function playerCmd(cmd, arg) {
  if (!mediaView) return playerState();
  const wc = mediaView.webContents;
  try {
    if (cmd === "toggle" || cmd === "next" || cmd === "prev") await wc.executeJavaScript(PLAYER_JS[cmd], true);
    else if (cmd === "mute") wc.setAudioMuted(!wc.isAudioMuted());
    else if (cmd === "volume") { const v = Math.min(1, Math.max(0, +arg || 0)); await wc.executeJavaScript(`(()=>{const v=document.querySelector('video');if(v){v.volume=${v};v.muted=false}})()`, true); }
    else if (cmd === "back" && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (cmd === "reload") wc.reload();
    else if (cmd === "hide") mediaWin.hide();
    else if (cmd === "click") setMediaClickThrough(!mediaClickThrough);
    else if (cmd === "opacity") { cfg.mediaOpacity = Math.min(1, Math.max(0.3, +arg || 1)); saveCfg(); mediaWin.setOpacity(cfg.mediaOpacity); }
  } catch (e) { /* page not ready */ }
  pushPlayer();
  return playerState();
}
// play/pause hotkey: the mini player if it's playing or open, otherwise whatever plays in Windows
async function mediaPlayPause() {
  if (mediaWin && mediaWin.isVisible()) return playerCmd("toggle");
  const r = await mediaBridge.command("toggle"); broadcastNow(r); return r;
}
function broadcastNow(r) {
  lastNow = r;
  sendMain("media:now", r);
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send("media:now", r);
}
async function pollNow() {
  clearTimeout(nowTimer);
  if (cfg.nowPlaying === false) return;
  const active = (mainWin && !mainWin.isDestroyed() && mainWin.isVisible() && !mainWin.isMinimized()) || (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible());
  if (active) { const r = await mediaBridge.now(); broadcastNow(r); if (r && r.error && /Windows only|doesn't offer/.test(r.error)) return; }
  nowTimer = setTimeout(pollNow, active ? 4000 : 10000);
}
ipcMain.handle("media:toggle", (e, a) => toggleMedia(a && a.show, a && a.url));
ipcMain.handle("media:go", (e, url) => { if (!mediaHostAllowed(String(url || ""))) return false; if (!mediaWin) createMediaWin(); mediaView.webContents.loadURL(String(url)).catch(() => {}); if (!mediaWin.isVisible()) mediaWin.showInactive(); return true; });
ipcMain.handle("media:player", (e, a) => playerCmd(a && a.cmd, a && a.arg));
ipcMain.handle("media:playerState", () => playerState());
ipcMain.handle("media:now", async () => { if (cfg.nowPlaying === false) return { off: true }; const r = await mediaBridge.now(); broadcastNow(r); return r; });
ipcMain.handle("media:cmd", async (e, c) => { const r = await mediaBridge.command(String(c)); broadcastNow(r); return r; });
app.on("will-quit", () => mediaBridge.stop());

// "Craft lab" button in the price popup: hand the item to the main window's Craft lab
ipcMain.on("price:toCraft", (e, item) => {
  if (!mainWin || mainWin.isDestroyed() || !item || typeof item !== "object") return;
  const clean = { base: String(item.base || "").slice(0, 80), ilvl: +item.ilvl || null, flags: (Array.isArray(item.flags) ? item.flags : []).map(String).slice(0, 2),
    mods: (Array.isArray(item.mods) ? item.mods : []).slice(0, 20).map((m) => ({ text: String((m && m.text) || "").slice(0, 200), crafted: !!(m && m.crafted) })) };
  sendMain("craft:item", clean);
  if (priceWin && !priceWin.isDestroyed()) priceWin.hide();
  mainWin.show(); mainWin.focus();
});
// one-time hints from the main window, shown on the overlay (text only)
ipcMain.on("overlay:hint", (e, text) => { if (overlayWin && !overlayWin.isDestroyed() && typeof text === "string") overlayWin.webContents.send("overlay:toast", text.slice(0, 220)); });
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
ipcMain.on("cheat:show", (e, name) => { if (typeof name === "string" && name.length < 260) showCheatFile(name); });
ipcMain.on("cheat:hide", () => hideCheat());
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

/* ---------------- stability: log page errors and crashes, reload crashed windows ---------------- */
const RECOVER = new Map(); // page -> crash times
function pageName(wc) { try { const u = wc.getURL(); return u.toLowerCase().startsWith(APP_URL) ? path.basename(new URL(u).pathname) : new URL(u).hostname || "page"; } catch (e) { return "page"; } }
app.on("web-contents-created", (e, wc) => {
  const ours = () => { try { return wc.getURL().toLowerCase().startsWith(APP_URL); } catch (err) { return false; } };
  wc.on("console-message", (ev, ...a) => {
    const level = ev && ev.level !== undefined ? ev.level : a[0], msg = String(ev && ev.message !== undefined ? ev.message : a[1]);
    if ((level === "error" || level === 3) && ours() && !/net::ERR_|Failed to load resource/.test(msg)) {
      const src = ev && ev.sourceId ? ` (${path.basename(String(ev.sourceId))}:${ev.lineNumber})` : "";
      LOG.error(pageName(wc), msg + src);
    }
  });
  wc.on("preload-error", (ev, p, err) => LOG.error(pageName(wc), "preload: " + ((err && err.stack) || err)));
  wc.on("unresponsive", () => LOG.warn(pageName(wc), "stopped responding"));
  wc.on("responsive", () => LOG.info(pageName(wc), "responding again"));
  wc.on("render-process-gone", (ev, d) => {
    const name = pageName(wc);
    LOG.error(name, `crashed (${d.reason}, exit code ${d.exitCode})`);
    if (d.reason === "clean-exit" || app.isQuitting) return;
    const now = Date.now(), times = (RECOVER.get(name) || []).filter((t) => now - t < 5 * 60e3);
    times.push(now); RECOVER.set(name, times);
    if (times.length > 3) { LOG.error(name, "crashed 3 times in 5 minutes: not reloading again"); sendMain("app:warning", `The ${name} page keeps crashing. Try Settings → Restart in safe mode; details are in the log.`); return; }
    setTimeout(() => { if (!wc.isDestroyed()) { wc.reload(); LOG.info(name, "reloaded after crash"); } }, 1000);
    setTimeout(() => sendMain("app:warning", `The ${name.replace(/\.html$/, "")} window crashed and was reloaded. Details are in Settings → Open log folder.`), 2500);
  });
});
app.on("child-process-gone", (e, d) => { if (d.reason !== "clean-exit") LOG.error("app", `${d.type} process stopped (${d.reason}${d.name ? ", " + d.name : ""}, exit code ${d.exitCode})`); });
app.on("before-quit", () => { app.isQuitting = true; });

/* ---------------- stash grid: outline a trade's item over the stash tab ----------------
   A see-through, click-through window the user lines up with their stash once. It only draws; it never reads the screen. */
let stashWin = null, stashCal = null;
function defaultStashBounds() {
  const b = screen.getPrimaryDisplay().bounds, h = b.height, size = Math.round(h * 0.587);   // the game's stash grid at 16:9
  return { x: b.x + Math.round(h * 0.0157), y: b.y + Math.round(h * 0.1491), width: size, height: size };
}
function ensureStashWin() {
  if (stashWin && !stashWin.isDestroyed()) return stashWin;
  let b = cfg.stashBounds || defaultStashBounds();
  const disp = screen.getDisplayMatching(b); if (!disp || b.x > disp.bounds.x + disp.bounds.width || b.y > disp.bounds.y + disp.bounds.height) b = defaultStashBounds();
  stashWin = new BrowserWindow({ ...b, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    roundedCorners: false, backgroundColor: "#00000000", title: "Exile Companion stash grid", icon: APP_ICON, webPreferences: prefs() });
  stashWin.setAlwaysOnTop(true, "screen-saver"); stashWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  stashWin.setIgnoreMouseEvents(true);
  stashWin.loadFile(path.join(__dirname, "app", "stash.html"));
  stashWin.on("closed", () => { stashWin = null; stashCal = null; });
  return stashWin;
}
function sendStash(m) { const w = ensureStashWin(); const go = () => { if (!w.isDestroyed()) w.webContents.send("stash:show", m); }; if (w.webContents.isLoading()) w.webContents.once("did-finish-load", go); else go(); }
function stashHighlight(h) {
  if (stashCal) return;
  const w = ensureStashWin(); w.setIgnoreMouseEvents(true); w.setFocusable(false);
  sendStash({ mode: "hl", ...h }); w.showInactive();
}
function stashCalibrate() {
  const w = ensureStashWin(); stashCal = w.getBounds();
  w.setIgnoreMouseEvents(false); w.setFocusable(true); sendStash({ mode: "cal", n: 12 }); w.show(); w.focus();
}
function stashEndCal(keep) {
  const w = stashWin; if (!w || w.isDestroyed()) return;
  if (keep) { cfg.stashBounds = w.getBounds(); saveCfg(); } else if (stashCal) w.setBounds(stashCal);
  stashCal = null; w.setIgnoreMouseEvents(true); w.setFocusable(false); w.hide(); sendStash({ mode: "hide" });
  sendMain("stash:status", { calibrated: !!cfg.stashBounds });
}
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
ipcMain.on("stash:highlight", (e, h) => {
  if (!h || typeof h !== "object") return;
  const n = (v) => Math.max(1, Math.min(24, Math.round(+v) || 1));
  const quad = !!h.quad || +h.left > 12 || +h.top > 12;
  stashHighlight({ left: n(h.left), top: n(h.top), w: Math.min(2, n(h.w)), h: Math.min(4, n(h.h)), quad, item: clip(h.item, 120), price: clip(h.price, 40), buyer: clip(h.buyer, 40), seconds: Math.max(3, Math.min(120, +h.seconds || 20)) });
});
ipcMain.on("stash:calibrate", () => stashCalibrate());
ipcMain.on("stash:calibrated", (e, keep) => stashEndCal(!!keep));
ipcMain.on("stash:nudge", (e, m) => {
  if (!stashWin || stashWin.isDestroyed() || !stashCal || !m || typeof m !== "object") return;
  if (m.reset) { stashWin.setBounds(defaultStashBounds()); return; }
  const b = stashWin.getBounds(), k = (v) => Math.max(-50, Math.min(50, Math.round(+v) || 0)), ds = k(m.ds), size = Math.max(120, Math.min(4000, b.width + ds));
  stashWin.setBounds({ x: b.x + k(m.dx), y: b.y + k(m.dy), width: size, height: size });
});
ipcMain.on("stash:hide", () => { if (stashWin && !stashWin.isDestroyed() && !stashCal) { stashWin.hide(); sendStash({ mode: "hide" }); } });
ipcMain.handle("stash:status", () => ({ calibrated: !!cfg.stashBounds }));

// text size: the price popup grows with the app's text size; the overlay grows when its own text size changes
const PRICE_BASE = { width: 400, height: 520 };
function sizePrice() {
  if (!priceWin || priceWin.isDestroyed() || priceWin.isVisible()) return;
  const k = Math.min(2, Math.max(0.75, (+cfg.uiScale || 100) / 100)), wa = screen.getPrimaryDisplay().workArea;
  priceWin.setSize(Math.min(wa.width - 20, Math.round(PRICE_BASE.width * k)), Math.min(wa.height - 20, Math.round(PRICE_BASE.height * k)));
}
ipcMain.on("ui:scale", (e, s) => {
  const v = (x) => Math.min(200, Math.max(75, Math.round(+x) || 100));
  if (!s || typeof s !== "object") return;
  cfg.uiScale = v(s.main); cfg.overlayScale = v(s.overlay); saveCfg(); sizePrice();
});
ipcMain.on("overlay:resize", (e, ratio) => {
  const r = +ratio; if (!overlayWin || overlayWin.isDestroyed() || !(r > 0.3 && r < 3)) return;
  const b = overlayWin.getBounds(), wa = screen.getDisplayMatching(b).workArea;
  const width = Math.min(wa.width, Math.max(200, Math.round(b.width * r))), height = Math.min(wa.height, Math.max(120, Math.round(b.height * r)));
  const nb = { x: Math.min(b.x, wa.x + wa.width - width), y: Math.min(b.y, wa.y + wa.height - height), width, height };
  overlayWin.setBounds(nb); cfg.overlayBounds = nb; saveCfg();
});
ipcMain.handle("app:safe", () => ({ safe: SAFE, fails: GUARD ? GUARD.fails : 0 }));
ipcMain.on("app:restart", (e, mode) => {
  if (GUARD) GUARD.reset();
  LOG.info("app", `restarting${mode === "safe" ? " in safe mode" : ""} at the user's request`);
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== "--safe-mode").concat(mode === "safe" ? ["--safe-mode"] : []) });
  app.exit(0);
});
ipcMain.on("log:open", () => { shell.openPath(LOG.dir); });

/* ---------------- Windows test run (see SMOKE above) ---------------- */
async function runSmoke() {
  const rep = { app: VERSION, electron: process.versions.electron, os: `${os.type()} ${os.release()} ${os.arch()}`, steps: [], warnings: [] };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = (name, ok, info) => { rep.steps.push({ name, ok: !!ok, info: info == null ? "" : String(info).slice(0, 600) }); LOG.info("smoke", `${ok ? "PASS" : "FAIL"} ${name}${info ? " · " + String(info).slice(0, 200) : ""}`); };
  const finish = (code) => {
    rep.errors = LOG.tail(400).filter((l) => / ERROR /.test(l));
    rep.ok = code === 0 && rep.steps.length > 0 && rep.steps.every((x) => x.ok) && !rep.errors.length;
    rep.log = LOG.tail(200);
    try { fs.writeFileSync(SMOKE, JSON.stringify(rep, null, 2)); } catch (e) { console.error(e); }
    try { mediaBridge.stop(); } catch (e) { /* ignore */ }
    app.exit(rep.ok ? 0 : 1);
  };
  const guard = setTimeout(() => { step("finished within 3 minutes", false); finish(2); }, 180e3);
  const run = async (name, fn) => { try { const r = await fn(); step(name, r === undefined ? true : r.ok !== false, r && r.info); } catch (e) { step(name, false, (e && e.stack) || e); } };
  const js = (wc, code) => Promise.race([wc.executeJavaScript(code, true), wait(30e3).then(() => { throw new Error("page didn't answer in 30 s"); })]);
  try {
    await wait(2000);
    await run("main window loads", () => ({ ok: mainWin && !mainWin.webContents.isCrashed(), info: mainWin.webContents.getURL().split("/").pop() }));
    await run("every page of the main window opens", async () => {
      const r = await js(mainWin.webContents, `(async()=>{UI.mode="full";if(typeof applyStarter==="function")applyStarter();const out=[],bad=[];
        for(const b of document.querySelectorAll('#tabs button[data-tab]')){if(b.hidden)continue;try{showTab(b.dataset.tab);await new Promise(r=>setTimeout(r,300));out.push(b.dataset.tab)}catch(e){bad.push(b.dataset.tab+': '+e.message)}}
        showTab('home');return {out,bad}})()`);
      return { ok: !r.bad.length && r.out.length >= 15, info: `${r.out.length} pages${r.bad.length ? " · " + r.bad.join(" | ") : ""}` };
    });
    await run("settings: theme, text size, contrast and colorblind options apply", async () => {
      const r = await js(mainWin.webContents, `(()=>{showTab('settings');setTheme('poe');setScale(125,true);UI.contrast=true;UI.cb=true;save();applyA11y();
        const h=document.documentElement,res=[h.dataset.theme,h.dataset.contrast,h.dataset.cb];setTheme('minimal');setScale(100,true);UI.contrast=false;UI.cb=false;save();applyA11y();showTab('home');return res})()`);
      return { ok: r.join() === "poe,high,1", info: r.join(", ") };
    });
    // the other windows
    toggleOverlay(true);
    createPin(); createMediaWin();
    await wait(5000);
    for (const [name, win] of [["overlay", overlayWin], ["price check", priceWin], ["pinned browser", pinWin], ["media player", mediaWin]]) {
      await run(`${name} window loads`, () => ({ ok: win && !win.isDestroyed() && !win.webContents.isCrashed() && !win.webContents.isLoading(), info: win && !win.isDestroyed() ? win.webContents.getURL().split("/").pop() : "missing" }));
    }
    await run("overlay shows the tools page", async () => { toggleWidgets(); await wait(800); const r = await js(overlayWin.webContents, "document.body.innerText.length"); toggleWidgets(); return { ok: r > 20, info: r + " characters of text" }; });
    // reading the game log: a stand-in Client.txt in the throwaway profile
    await run("game log: a new zone reaches the app", async () => {
      const f = path.join(app.getPath("userData"), "Client.txt");
      fs.writeFileSync(f, "2026/11/22 12:00:00 1 ab [INFO Client 1] Start\r\n");
      cfg.logPath = f; startLog(); await wait(1500);
      const t = "2026/11/22 12:00:05";
      fs.appendFileSync(f, `${t} 2 ab [DEBUG Client 1] Generating level 1 area "1_1_1" with seed 1\r\n${t} 3 ab [INFO Client 1] : You have entered The Twilight Strand.\r\n`);
      for (let i = 0; i < 20; i++) { await wait(500); const z = await js(mainWin.webContents, "LIVE.zone&&LIVE.zone.id"); if (z === "1_1_1") return { info: "zone 1_1_1 seen" }; }
      return { ok: false, info: "the zone never arrived" };
    });
    await run("chat scanner: a trade chat line with a keyword is caught", async () => {
      await js(mainWin.webContents, "Object.assign(chatCfg(),{on:true,words:['smoketestword'],ch:{trade:true},overlay:false,notify:false,sound:false,hits:[]});save()");
      fs.appendFileSync(cfg.logPath, "2026/11/22 12:00:09 4 ab [INFO Client 1] $<GLD> SmokeSeller: WTS smoketestword 5 chaos\r\n");
      for (let i = 0; i < 20; i++) { await wait(500); const h = await js(mainWin.webContents, "chatCfg().hits.map(x=>x.name).join()"); if (h === "SmokeSeller") return { info: "caught SmokeSeller" }; }
      return { ok: false, info: "no match arrived" };
    });
    // Windows media controls ("now playing"): must answer; nothing playing is fine
    await run("Windows media bridge answers", async () => {
      const r = await Promise.race([mediaBridge.now(), wait(25e3).then(() => ({ error: "no answer in 25 s" }))]);
      if (r && r.error && /doesn't offer/.test(r.error)) { rep.warnings.push("This Windows build has no media controls: " + r.error); return { info: r.error }; }
      return { ok: !(r && r.error), info: JSON.stringify(r) };
    });
    await run("text size: the overlay and price check follow their own settings", async () => {
      await js(mainWin.webContents, "UI.overlayScale=150;UI.scale=125;save();applyA11y();pushScale()"); await wait(800);
      const o = await js(overlayWin.webContents, "document.documentElement.style.zoom"), p = await js(priceWin.webContents, "document.documentElement.style.zoom"), m = await js(mainWin.webContents, "document.documentElement.style.zoom");
      const zf = mainWin.webContents.getZoomFactor();
      await js(mainWin.webContents, "UI.overlayScale=100;UI.scale=100;save();applyA11y();pushScale()");
      return { ok: o === "1.5" && p === "1.25" && m === "1.25" && Math.abs(zf - 1) < 0.01, info: `main ${m}, price ${p}, overlay ${o}, Electron zoom ${zf}` };
    });
    await run("characters: a second character keeps its own progress", async () => {
      await js(mainWin.webContents, "S.campAct=7;S.logChar='SmokeMain';save();ensureChars();newChar('SmokeAlt')");
      await new Promise((r) => mainWin.webContents.once("did-finish-load", r)); await wait(1500);
      const alt = await js(mainWin.webContents, "({act:S.campAct||1,active:activeChar().name})");
      await js(mainWin.webContents, "S.campAct=3;save();switchChar(charList().list.find(x=>x.name!=='SmokeAlt').id)");
      await new Promise((r) => mainWin.webContents.once("did-finish-load", r)); await wait(1500);
      const main = await js(mainWin.webContents, "({act:S.campAct,active:activeChar().name,n:charList().list.length})");
      return { ok: alt.active === "SmokeAlt" && alt.act === 1 && main.act === 7 && main.n === 2, info: JSON.stringify({ alt, main }) };
    });
    await run("stash grid: highlight shows, line-up mode cancels back to where it was", async () => {
      stashHighlight({ left: 3, top: 2, w: 1, h: 1, quad: false, item: "Smoke test", price: "1 chaos", buyer: "", seconds: 5 }); await wait(1500);
      const shown = !!stashWin && stashWin.isVisible() && !stashWin.webContents.isCrashed() && /stash\.html$/.test(stashWin.webContents.getURL());
      const cells = await js(stashWin.webContents, "document.querySelectorAll('.cell').length");
      const before = JSON.stringify(stashWin.getBounds()); stashCalibrate(); await wait(500);
      stashWin.setBounds({ ...stashWin.getBounds(), x: stashWin.getBounds().x + 40 }); stashEndCal(false); await wait(300);
      const after = JSON.stringify(stashWin.getBounds());
      return { ok: shown && cells === 1 && before === after && !stashWin.isVisible(), info: `shown ${shown}, cells ${cells}, bounds kept ${before === after}` };
    });
    await run("phone screen: refuses without the key, serves with it", async () => {
      cfg.phoneEnabled = true; cfg.phonePort = 47790; startPhone(); await wait(1000);
      const get = (p) => new Promise((resolve) => { httpLib.get({ host: "127.0.0.1", port: 47790, path: p }, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => resolve({ code: r.statusCode, body: b })); }).on("error", (e) => resolve({ code: 0, body: e.message })); });
      const no = await get("/data?k=wrong"), page = await get("/?k=" + cfg.phoneKey), data = await get("/data?k=" + cfg.phoneKey), st = phoneStatus();
      cfg.phoneEnabled = false; startPhone();
      const ok = no.code === 403 && page.code === 200 && /Exile Companion/.test(page.body) && data.code === 200 && JSON.parse(data.body).overlay && /^<svg/.test(st.qr || "<svg");
      return { ok, info: `no key ${no.code}, page ${page.code}, data ${data.code}, addresses ${st.urls.length}` };
    });
    await run("Twitch: chat connection opens (anonymous, read-only)", async () => {
      if (typeof WebSocket !== "function") return { ok: false, info: "no WebSocket" };
      const r = await new Promise((resolve) => {
        const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443"); const to = setTimeout(() => { try { ws.close(); } catch (e) { /* ignore */ } resolve("timeout"); }, 15000);
        ws.onopen = () => { ws.send("NICK justinfan" + Math.floor(10000 + Math.random() * 80000)); };
        ws.onmessage = (ev) => { const m = twitchLib.parseIrc(String(ev.data).split("\r\n")[0]); if (m.command === "001") { clearTimeout(to); ws.close(); resolve("welcome"); } };
        ws.onerror = () => { clearTimeout(to); resolve("error"); };
      });
      return { ok: r === "welcome", info: r };
    });
    await run("Twitch: the client ID can start a sign-in (code only, nothing approved)", async () => {
      if (!twitchClient()) return { ok: false, info: "no client ID" };
      const r = await twitchForm("https://id.twitch.tv/oauth2/device", { client_id: twitchClient(), scopes: "chat:read chat:edit" });
      return { ok: r.status === 200 && !!(r.data && r.data.user_code && r.data.device_code), info: r.status === 200 ? "Twitch gave a sign-in code" : `${r.status} ${(r.data && r.data.message) || ""}` };
    });
    await run("Path of Building numbers: compares a ring against the example build", async () => {
      if (!pobAvailable()) return { ok: false, info: "the Path of Building helper isn't in this build" };
      if (!process.env.EC_SMOKE_POB) return { info: "skipped (no Path of Building on this machine)" };
      cfg.pobPath = process.env.EC_SMOKE_POB; cfg.pobEnabled = true;
      pobXml = await js(mainWin.webContents, "EXAMPLE_XML");
      const ring = "Item Class: Rings\nRarity: Rare\nTest Ring\nTwo-Stone Ring\n--------\nItem Level: 84\n--------\n+16% to Fire and Cold Resistances (implicit)\n--------\n+80 to maximum Life\n+45% to Lightning Resistance\n+35% to Cold Resistance\n";
      const t0 = Date.now(), r = await pobCompare(ring), first = Date.now() - t0;
      const t1 = Date.now(), r2 = await pobCompare(ring), second = Date.now() - t1;
      if (pobRunner) { pobRunner.stop(); pobRunner = null; }
      const b = r.ok && r.summary && r.summary.best;
      return { ok: !!b && r2.ok && /^Ring [12]$/.test(b.slot), info: b ? `${b.slot}: DPS ${b.dpsPct.toFixed(1)}%, life ${Math.round(b.d.life)}, EHP ${b.ehpPct.toFixed(1)}% · first ${first} ms, then ${second} ms` : JSON.stringify(r).slice(0, 200) };
    });
    await run("safe-mode state answers", () => ({ info: JSON.stringify({ safe: SAFE }) }));
  } catch (e) { step("test run", false, (e && e.stack) || e); }
  clearTimeout(guard);
  finish(0);
}

/* ---------------- app lifecycle ---------------- */
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
  if (process.platform === "win32") app.setAppUserModelId("app.exilecompanion.desktop");
  // safe mode: asked for (--safe-mode), or the last two starts never finished (crash or freeze while starting).
  // It turns off the overlay, price window, hotkeys, media, Discord, streaming and graphics acceleration.
  GUARD = startupGuard(path.join(app.getPath("userData"), "starting.json"));
  SAFE = process.argv.includes("--safe-mode") ? "asked" : GUARD.unsafe ? "crashed" : "";
  if (SAFE) app.disableHardwareAcceleration();
  LOG.info("app", `Exile Companion ${VERSION} starting · Electron ${process.versions.electron} · ${os.type()} ${os.release()}${SAFE ? ` · SAFE MODE (${SAFE === "asked" ? "asked for" : `last ${GUARD.fails} starts didn't finish`})` : ""}`);
  app.whenReady().then(async () => {
    T_READY = Date.now();
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
    if (!SAFE) {
      createOverlay();
      createPrice();
      registerHotkeys();
      startClipboardWatch();
      setTimeout(pollNow, 5000);
    }
    mainWin.webContents.once("did-finish-load", () => {
      LOG.info("startup", `ready in ${T_READY - T0} ms, main page loaded in ${Date.now() - T0} ms`);
      setTimeout(() => GUARD.started(), 10000);
      if (SMOKE) { runSmoke(); return; }
      startLog();
      setupUpdater();   // kept in safe mode so a fix can still arrive
      if (SAFE) return;
      detectLeague().then((l) => sendMain("league", l));
      setInterval(() => { detectLeague().then((l) => l && sendMain("league", l)).catch(() => {}); }, 6 * 3600e3);
      startDiscord(); startStream(); startPhone(); twitchConnect();
    });
  });
  app.on("will-quit", () => { LOG.info("app", "quit"); if (GUARD) GUARD.started(); /* a normal quit (or an update restart) is not a failed start */ globalShortcut.unregisterAll(); clearInterval(clipTimer); if (tail) tail.stop(); if (discord) discord.close(); if (streamServer) streamServer.close(); if (phoneServer) phoneServer.close(); twitchClose(); if (pobRunner) pobRunner.stop(); });
  app.on("window-all-closed", () => app.quit());
}

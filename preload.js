// Bridge between the windows and the main process. Exposed as window.exileDesktop.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld("exileDesktop", {
  isDesktop: true,
  // settings
  getConfig: () => ipcRenderer.invoke("cfg:get"),
  setConfig: (patch) => ipcRenderer.invoke("cfg:set", patch),
  detectLeague: () => ipcRenderer.invoke("league:detect"),
  onLeague: on("league"),
  onWarning: on("app:warning"),
  // live log
  detectLogs: () => ipcRenderer.invoke("log:detect"),
  chooseLog: () => ipcRenderer.invoke("log:choose"),
  readLogTail: (mb) => ipcRenderer.invoke("log:tail", mb),
  onLogEvents: on("log:events"),
  onLogStatus: on("log:status"),
  // overlay
  publishOverlay: (data) => ipcRenderer.send("overlay:publish", data),
  onOverlayData: on("overlay:data"),
  overlayAction: (a) => ipcRenderer.send("overlay:action", a),
  onOverlayAction: on("overlay:action"),
  onOverlayInteractive: on("overlay:interactive"),
  onOverlayVisible: on("overlay:visible"),
  onOverlayToast: on("overlay:toast"),
  toggleOverlay: (v) => ipcRenderer.send("overlay:toggle", v),
  setInteractive: (v) => ipcRenderer.send("overlay:interactive", v),
  resetOverlay: () => ipcRenderer.send("overlay:reset"),
  // price check
  // network requests also tell the page when they start and finish, for its loading bar
  http: async (req) => {
    try { window.dispatchEvent(new CustomEvent("ec-busy", { detail: 1 })); } catch (e) { /* no page */ }
    try { return await ipcRenderer.invoke("http", req); }
    finally { try { window.dispatchEvent(new CustomEvent("ec-busy", { detail: -1 })); } catch (e) { /* no page */ } }
  },
  onPriceItem: on("price:item"),
  closePrice: () => ipcRenderer.send("price:close"),
  testPrice: (text) => ipcRenderer.send("price:test", text),
  // account (GGG)
  acctStatus: () => ipcRenderer.invoke("acct:status"),
  setSession: (s) => ipcRenderer.invoke("acct:setSession", s),
  login: () => ipcRenderer.invoke("acct:login"),
  logout: () => ipcRenderer.invoke("acct:logout"),
  characters: (a) => ipcRenderer.invoke("acct:chars", a),
  character: (a) => ipcRenderer.invoke("acct:char", a),
  stashList: (a) => ipcRenderer.invoke("acct:stashList", a),
  stashTab: (a) => ipcRenderer.invoke("acct:stashTab", a),
  leagueAccount: (a) => ipcRenderer.invoke("acct:leagueAccount", a),
  remoteFilters: () => ipcRenderer.invoke("acct:filters"),
  saveRemoteFilter: (a) => ipcRenderer.invoke("acct:saveFilter", a),
  currencyHour: (id) => ipcRenderer.invoke("cx:hour", { id }),
  // local loot filters
  listFilters: () => ipcRenderer.invoke("filter:list"),
  readFilter: (name) => ipcRenderer.invoke("filter:read", { name }),
  openFilterFolder: () => ipcRenderer.invoke("filter:openFolder"),
  browserGo: (url) => ipcRenderer.invoke("browser:go", url),
  browserNav: (what) => ipcRenderer.send("browser:nav", what),
  browserBounds: (b) => ipcRenderer.send("browser:bounds", b),
  browserState: () => ipcRenderer.invoke("browser:state"),
  browserClear: () => ipcRenderer.invoke("browser:clear"),
  browserExternal: (url) => ipcRenderer.send("browser:external", url),
  onBrowserState: on("browser:state"),
  onBrowserBlocked: on("browser:blocked"),
  onBrowserShow: on("browser:show"),
  chooseFilter: () => ipcRenderer.invoke("filter:choose"),
  // browser pinned over the game
  pinToggle: (a) => ipcRenderer.invoke("pin:toggle", a || {}),
  pinNav: (what) => ipcRenderer.send("pin:nav", what),
  pinGo: (url) => ipcRenderer.invoke("pin:go", url),
  pinOpacity: (v) => ipcRenderer.invoke("pin:opacity", v),
  onPinState: on("pin:state"),
  onPinBlocked: on("pin:blocked"),
  // media: mini player over the game and "now playing" from Windows
  mediaToggle: (a) => ipcRenderer.invoke("media:toggle", a || {}),
  mediaGo: (url) => ipcRenderer.invoke("media:go", url),
  mediaPlayer: (cmd, arg) => ipcRenderer.invoke("media:player", { cmd, arg }),
  mediaPlayerState: () => ipcRenderer.invoke("media:playerState"),
  mediaNow: () => ipcRenderer.invoke("media:now"),
  mediaCmd: (c) => ipcRenderer.invoke("media:cmd", c),
  onMediaPlayer: on("media:player"),
  onMediaNow: on("media:now"),
  onMediaView: on("media:view"),
  onMediaBlocked: on("media:blocked"),
  onMediaClick: on("media:click"),
  toCraft: (item) => ipcRenderer.send("price:toCraft", item),
  onCraftItem: on("craft:item"),
  // recent price checks (in memory only)
  clipHistory: () => ipcRenderer.invoke("clip:history"),
  clipRecheck: (i) => ipcRenderer.send("clip:recheck", i),
  clipClear: () => ipcRenderer.send("clip:clear"),
  onClipHistory: on("clip:history"),
  writeFilter: (name, text) => ipcRenderer.invoke("filter:write", { name, text }),
  // notifications, discord, gear snapshot
  notify: (n) => ipcRenderer.send("notify", n),
  discordActivity: (a) => ipcRenderer.send("discord:activity", a),
  discordRestart: () => ipcRenderer.send("discord:restart"),
  onDiscordStatus: on("discord:status"),
  publishGear: (g) => ipcRenderer.send("gear:publish", g),
  getGear: () => ipcRenderer.invoke("gear:get"),
  onOverlayTrades: on("overlay:trades"),
  publishStream: (d) => ipcRenderer.send("stream:publish", d),
  onOverlayPage: on("overlay:page"),
  cheatList: () => ipcRenderer.invoke("cheat:list"),
  cheatAdd: () => ipcRenderer.invoke("cheat:add"),
  cheatRemove: (n) => ipcRenderer.invoke("cheat:remove", n),
  cheatRestore: (n) => ipcRenderer.invoke("cheat:restore", n),
  suspendHotkeys: (on) => ipcRenderer.send("hotkeys:suspend", !!on),
  backupSave: (json) => ipcRenderer.invoke("backup:save", json),
  backupOpen: () => ipcRenderer.invoke("backup:open"),
  backupAuto: (json) => ipcRenderer.invoke("backup:auto", json),
  onStreamStatus: on("stream:status"),
  // updates
  updateStatus: () => ipcRenderer.invoke("update:status"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.send("update:install"),
  onUpdate: on("update:status"),
  // misc
  copy: (text) => ipcRenderer.send("clip:write", text),
  openExternal: (url) => ipcRenderer.send("open:external", url),
  diagnostics: () => ipcRenderer.invoke("diag:get"),
  saveReport: (text) => ipcRenderer.invoke("diag:save", text),
});

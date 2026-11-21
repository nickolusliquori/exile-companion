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
  http: (req) => ipcRenderer.invoke("http", req),
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

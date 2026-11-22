"use strict";
// File-name helpers for loot filters. No Electron imports, so they can be tested on their own.
const path = require("path");

// Keep the name as the user sees it (NeverSink's files contain an apostrophe), but never allow a folder
// part or characters Windows forbids in file names.
function safeFilterName(n) {
  const base = path.win32.basename(path.posix.basename(String(n || "")));
  const clean = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/^\.+/, "").trim();
  return /\.filter$/i.test(clean) ? clean : "";
}

module.exports = { safeFilterName };

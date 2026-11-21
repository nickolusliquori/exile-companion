// Clipboard helpers for the price check. Pure functions so they can be tested without Electron.
"use strict";

// After a price check we flip a trailing line break on the copied item text.
// The next Ctrl+C on the same item then produces different text than what is on the
// clipboard, so the watcher sees it as a new copy. Pasting the text elsewhere is unaffected.
function markItemText(t) {
  return /\r?\n$/.test(t) ? t.replace(/\s+$/, "") : t + "\r\n";
}

module.exports = { markItemText };

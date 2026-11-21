// Clipboard helpers for the price check. No Electron imports, so they can be tested on their own.
"use strict";

// Electron 44+ reads the clipboard through a W3C-style API that can change line endings
// (\r\n -> \n) and drop a trailing line break. Compare text in a form those changes don't affect.
const canon = (s) => String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/\n+$/, "");

// After a price check we toggle one trailing space on the item text and put it back on the clipboard.
// The next Ctrl+C on the same item then differs from what's on the clipboard, so it counts as a new copy.
// A trailing space survives line-ending clean-up, and pasting the text into trade sites or PoB still works.
function markItemText(t) {
  const s = String(t == null ? "" : t);
  return / +$/.test(s) ? s.replace(/ +$/, "") : s + " ";
}

// read(): Promise<string>, write(text): Promise, onItem(text), isItem(text) -> bool, enabled() -> bool
function createClipWatcher({ read, write, onItem, isItem, enabled }) {
  let last = null;      // canonical form of what we last saw on the clipboard
  let own = null;       // canonical form of the text we last wrote ourselves
  let busy = false;
  return {
    async prime() { last = canon(await read()); },
    // tell the watcher about text the app puts on the clipboard for other reasons (copy buttons, hotkeys)
    expect(text) { own = canon(text); },
    async poll() {
      if (busy) return false;
      busy = true;
      try {
        const raw = await read();
        const c = canon(raw);
        if (c === last) return false;
        last = c;
        if (c === own) return false;
        if (!(enabled ? enabled() : true) || !isItem(raw)) return false;
        onItem(raw);
        const marked = markItemText(c);
        own = canon(marked); last = own;
        await write(marked);
        return true;
      } finally { busy = false; }
    },
  };
}

module.exports = { markItemText, canon, createClipWatcher };

"use strict";
// Sites the in-app browser opens directly. Anything else asks first and opens in the user's own browser.
const WEB_HOSTS = [
  "pathofexile.com", "poe.ninja", "poewiki.net", "poedb.tw", "pobb.in", "pastebin.com", "poelab.com",
  "craftofexile.com", "filterblade.xyz", "poe.re",
  // signing in to pathofexile.com with Steam
  "steamcommunity.com",
];
function webHostAllowed(u) {
  try {
    const url = new URL(String(u));
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const h = url.hostname.toLowerCase();
    return WEB_HOSTS.some((d) => h === d || h.endsWith("." + d));
  } catch (e) { return false; }
}
// Only the page itself is kept on the allowlist. Frames inside a page (Cloudflare's "verify you are human"
// check, embedded videos) load from other sites and must be left alone, as any browser does.
function blockNavigation(url, isMainFrame) { return isMainFrame !== false && !webHostAllowed(url); }
module.exports = { WEB_HOSTS, webHostAllowed, blockNavigation };

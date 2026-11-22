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
module.exports = { WEB_HOSTS, webHostAllowed };

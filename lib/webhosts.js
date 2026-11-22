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

// Sites the media mini player opens. These play without copy protection (DRM); Netflix, Hulu, Disney+,
// Apple Music and similar need Widevine, which this app's browser doesn't have.
const MEDIA_HOSTS = [
  "youtube.com", "youtu.be", "youtube-nocookie.com", "twitch.tv", "kick.com", "soundcloud.com",
  // signing in to YouTube goes through Google's account pages
  "accounts.google.com",
];
function mediaHostAllowed(u) {
  try {
    const url = new URL(String(u));
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const h = url.hostname.toLowerCase();
    return MEDIA_HOSTS.some((d) => h === d || h.endsWith("." + d));
  } catch (e) { return false; }
}
module.exports = { WEB_HOSTS, webHostAllowed, blockNavigation, MEDIA_HOSTS, mediaHostAllowed };

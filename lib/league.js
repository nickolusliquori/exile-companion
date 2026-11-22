// Picks the league the app should use from GGG's trade league list. Pure, so it can be tested.
// list: [{id, realm}], newest first as GGG sends it. Returns {league, challenge, reason}.
"use strict";
const PERMANENT = /^(standard|hardcore)$/i;
const NOT_MAIN = /standard|hardcore|\bhc\b|ssf|solo|ruthless|private|\(PL\d+\)/i;

function pickLeague(list, { current, lastChallenge, pinned } = {}) {
  const pc = (list || []).filter((l) => l && l.id && (l.realm || "pc") === "pc");
  const challenge = (pc.find((l) => !NOT_MAIN.test(l.id)) || {}).id || null;
  const exists = (id) => pc.some((l) => l.id === id);
  if (!current) return { league: challenge, challenge, reason: "first run" };
  if (pinned) return { league: current, challenge, reason: "pinned" };
  if (!challenge) return { league: current, challenge, reason: "no challenge league listed" };
  // the league in use has ended (it's no longer listed): move to the current challenge league
  if (!exists(current) && !PERMANENT.test(current)) return { league: challenge, challenge, reason: "ended" };
  // a new challenge league launched since we last looked, and the user was on the previous one
  if (lastChallenge && challenge !== lastChallenge && current === lastChallenge) return { league: challenge, challenge, reason: "launched" };
  return { league: current, challenge, reason: "unchanged" };
}
module.exports = { pickLeague };

// "Now playing" for whatever plays in Windows (Spotify, Apple Music, a browser tab…), through Windows' own
// media controls (GlobalSystemMediaTransportControls). One PowerShell process stays open and answers one JSON
// line per command, so polling is cheap. This only reads and controls media sessions; it never touches the game.
"use strict";
const { spawn } = require("child_process");

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + String.raw`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(5000) | Out-Null; $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ($mgrType::RequestAsync()) $mgrType
[Console]::Out.WriteLine('{"ready":true}')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null -or $line -eq 'quit') { break }
  try {
    $s = $mgr.GetCurrentSession()
    if ($s -eq $null) { [Console]::Out.WriteLine('{"none":true}'); continue }
    switch ($line) {
      'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
      'next'   { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
      'prev'   { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
    }
    $p = Await ($s.TryGetMediaPropertiesAsync()) $propType
    $info = $s.GetPlaybackInfo()
    $o = [ordered]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = $info.PlaybackStatus.ToString(); canNext = $info.Controls.IsNextEnabled; canPrev = $info.Controls.IsPreviousEnabled }
    [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  } catch { [Console]::Out.WriteLine((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress)) }
}
`;

// friendly names for common apps (SourceAppUserModelId)
function appName(id) {
  const s = String(id || "");
  const known = [[/spotify/i, "Spotify"], [/AppleMusic|AppleInc\.AppleMusic/i, "Apple Music"], [/chrome/i, "Chrome"], [/msedge/i, "Edge"], [/firefox/i, "Firefox"],
    [/stremio/i, "Stremio"], [/vlc/i, "VLC"], [/ZuneMusic|Media ?Player/i, "Media Player"], [/Netflix/i, "Netflix"], [/AmazonMusic/i, "Amazon Music"], [/Tidal/i, "TIDAL"], [/Deezer/i, "Deezer"], [/Exile ?Companion|electron/i, "Exile Companion"]];
  const hit = known.find(([re]) => re.test(s));
  return hit ? hit[1] : s.replace(/\.exe$/i, "").split(/[\\!]/).pop() || "Media";
}
function parseLine(line) {
  try { const o = JSON.parse(line); if (o && o.app !== undefined) o.appName = appName(o.app); return o; } catch (e) { return { error: "Unreadable reply" }; }
}

function createMedia({ platform = process.platform, spawnFn = spawn } = {}) {
  let proc = null, buf = "", waiting = [], ready = false, failed = null;
  function start() {
    if (platform !== "win32") { failed = "Now playing works on Windows only."; return; }
    if (proc) return;
    try {
      // the script goes in as -EncodedCommand (UTF-16LE base64) so stdin stays free for our commands
      const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
      proc = spawnFn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) { failed = "Couldn't start Windows PowerShell."; return; }
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d) => {
      buf += d; let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        if (line === '{"ready":true}') { ready = true; continue; }
        const w = waiting.shift(); if (w) w(parseLine(line));
      }
    });
    proc.on("exit", () => { proc = null; ready = false; waiting.splice(0).forEach((w) => w({ error: "Media bridge stopped." })); });
    proc.stderr.on("data", (d) => { if (!ready && /Windows\.Media|TypeLoad|Unable to find type/i.test(String(d))) failed = "This version of Windows doesn't offer media controls to apps."; });
  }
  function send(cmd) {
    if (failed) return Promise.resolve({ error: failed });
    start();
    if (!proc) return Promise.resolve({ error: failed || "Media bridge unavailable." });
    return new Promise((resolve) => {
      const t = setTimeout(() => { const i = waiting.indexOf(done); if (i >= 0) waiting.splice(i, 1); resolve({ error: "No answer from Windows media controls." }); }, 8000);
      function done(r) { clearTimeout(t); resolve(r); }
      waiting.push(done);
      proc.stdin.write(cmd + "\r\n");
    });
  }
  return {
    now: () => send("get"),
    command: (c) => (["toggle", "next", "prev"].includes(c) ? send(c) : Promise.resolve({ error: "Unknown command" })),
    stop: () => { if (proc) { try { proc.stdin.write("quit\r\n"); proc.kill(); } catch (e) { /* gone */ } proc = null; } },
  };
}

module.exports = { createMedia, appName, parseLine, SCRIPT };

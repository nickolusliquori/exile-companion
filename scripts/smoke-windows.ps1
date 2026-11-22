# Windows test run: starts the packaged app in test mode (a throwaway profile), waits for its report and prints it.
# Used by the Release and Windows test workflows. Exit code 0 = every step passed and no errors were logged.
param([string]$Exe = "dist\win-unpacked\Exile Companion.exe")
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Exe)) { throw "App not found: $Exe" }
$report = Join-Path $env:RUNNER_TEMP "ec-smoke.json"
Remove-Item $report -ErrorAction SilentlyContinue
$env:EC_SMOKE = $report
$p = Start-Process -FilePath $Exe -PassThru
if (-not $p.WaitForExit(240000)) { Stop-Process -Id $p.Id -Force; throw "The app didn't finish the test run within 4 minutes." }
if (-not (Test-Path $report)) { throw "The app exited without writing a report (it probably crashed while starting)." }
$r = Get-Content $report -Raw | ConvertFrom-Json
Write-Host "Exile Companion $($r.app) · Electron $($r.electron) · $($r.os)"
foreach ($s in $r.steps) { Write-Host ("{0}  {1}{2}" -f ($(if ($s.ok) { "PASS" } else { "FAIL" })), $s.name, $(if ($s.info) { " · " + $s.info } else { "" })) }
foreach ($w in $r.warnings) { Write-Host "::warning::$w" }
if ($r.errors.Count) { Write-Host "Errors logged:"; $r.errors | ForEach-Object { Write-Host "  $_" } }
Write-Host "--- app log ---"; $r.log | ForEach-Object { Write-Host $_ }
if (-not $r.ok) { Write-Host "::error::The Windows test run failed (see above)."; exit 1 }
Write-Host "Windows test run passed."

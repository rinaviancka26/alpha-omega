# make-shortcut.ps1 - puts a desktop shortcut to start.cmd, named after the app in mission.card.md,
# with launcher\app.ico (built by `npm run assets` from raw\icon.png, or the placeholder icon). Pure ASCII.
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
& node (Join-Path $Root 'scripts\card.mjs') | Out-Null
$card = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'web\src\card.generated.json') | ConvertFrom-Json
$name = ($card.appName -replace '[\\/:*?"<>|]', '').Trim()
$ico = Join-Path $Root 'launcher\app.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop "$name.lnk"
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = Join-Path $Root 'start.cmd'
$s.WorkingDirectory = $Root
$s.Description = "Start $name"
if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
$s.Save()
Write-Host "Shortcut created: $lnk" -ForegroundColor Green

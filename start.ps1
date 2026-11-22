# start.ps1 - Windows PowerShell 5.1 launcher. Pure ASCII on purpose.
# Checks ports 4317 (server) and 4316 (web), starts only the half that is down (each in its own window),
# installs node_modules if missing, then opens http://localhost:4316.
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$WebPort = 4316
$ServerPort = 4317

function Test-Port([int]$Port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(400) -and $c.Connected
        $c.Close()
        return [bool]$ok
    } catch { return $false }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js was not found. Install Node.js LTS (22.x) from https://nodejs.org and run start.cmd again.' -ForegroundColor Red
    exit 1
}
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) { Write-Host 'npm was not found (it ships with Node.js LTS).' -ForegroundColor Red; exit 1 }
$npmPath = $npm.Source

# card -> generated JSON (also gives us the app name for window titles)
& node (Join-Path $Root 'scripts\card.mjs')
if ($LASTEXITCODE -ne 0) { Write-Host 'mission.card.md is invalid - fix it and try again.' -ForegroundColor Red; exit 1 }
$card = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'web\src\card.generated.json') | ConvertFrom-Json
$AppName = $card.appName

foreach ($dir in @($Root, (Join-Path $Root 'server'), (Join-Path $Root 'web'))) {
    if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
        Write-Host "Installing dependencies in $dir ..." -ForegroundColor Cyan
        Push-Location $dir
        try { & $npmPath install; if ($LASTEXITCODE -ne 0) { throw "npm install failed in $dir" } } finally { Pop-Location }
    }
}

function Start-Half([string]$Name, [string]$Dir, [int]$Port) {
    if (Test-Port $Port) { Write-Host "$Name already running on port $Port - leaving it alone." -ForegroundColor Green; return }
    Write-Host "Starting $Name on port $Port ..." -ForegroundColor Cyan
    $title = "$AppName $Name ($Port)"
    $cmd = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$Dir'; & '$npmPath' run dev"
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd) -WorkingDirectory $Dir | Out-Null
}

Start-Half 'server' (Join-Path $Root 'server') $ServerPort
Start-Half 'web' (Join-Path $Root 'web') $WebPort

$deadline = (Get-Date).AddSeconds(90)
while (-not ((Test-Port $WebPort) -and (Test-Port $ServerPort))) {
    if ((Get-Date) -gt $deadline) { Write-Host 'Timed out waiting for ports 4316/4317 - check the two server windows for errors.' -ForegroundColor Red; exit 1 }
    Start-Sleep -Milliseconds 500
}
Write-Host "$AppName is up: http://localhost:$WebPort" -ForegroundColor Green
Start-Process "http://localhost:$WebPort"

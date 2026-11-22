# stop.ps1 - frees ports 4316 (web) and 4317 (server). Pure ASCII on purpose. Windows PowerShell 5.1.
$ErrorActionPreference = 'Continue'
$ports = @(4316, 4317)
$pids = @()
foreach ($p in $ports) {
    $found = @()
    try { $found = @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess) } catch {
        # fallback for systems without Get-NetTCPConnection
        $found = @(netstat -ano -p TCP | Select-String -Pattern (":$p\s+\S+\s+LISTENING\s+(\d+)") | ForEach-Object { [int]$_.Matches[0].Groups[1].Value })
    }
    foreach ($id in $found) { if ($id -gt 0 -and $pids -notcontains $id) { $pids += $id } }
}
if ($pids.Count -eq 0) { Write-Host 'Nothing is listening on 4316/4317.' -ForegroundColor Green; exit 0 }
foreach ($id in $pids) {
    Write-Host "Stopping process tree $id ..." -ForegroundColor Cyan
    & taskkill.exe /PID $id /T /F | Out-Null
}
Start-Sleep -Milliseconds 800
$still = @()
foreach ($p in $ports) { try { if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop) { $still += $p } } catch { } }
if ($still.Count) { Write-Host "Still listening: $($still -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host 'Ports 4316 and 4317 are free.' -ForegroundColor Green

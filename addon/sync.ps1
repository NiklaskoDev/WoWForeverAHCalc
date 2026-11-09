# Copies prices from your home server into this addon's Data.lua.
# WoW addons can't use the network, so this runs on the PC next to the game.
param([switch]$Once, [int]$Minutes = 5)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$dataFile = Join-Path $PSScriptRoot 'Data.lua'
$tempFile = "$dataFile.tmp"
$serverFile = Join-Path $PSScriptRoot 'server.txt'

$server = ''
if (Test-Path -LiteralPath $serverFile) {
    $server = "$(Get-Content -LiteralPath $serverFile -TotalCount 1)".Trim()
}
if (-not $server) {
    $server = (Read-Host 'Home server address, for example http://192.168.1.10:8778').Trim()
    Set-Content -LiteralPath $serverFile -Value $server -Encoding Ascii
}
$server = $server.TrimEnd('/')

$lastTs = $null

function Update-Prices {
    $status = Invoke-RestMethod -Uri "$server/api/status" -UseBasicParsing -TimeoutSec 30
    if (-not $status.ts) {
        Write-Host "$(Get-Date -Format HH:mm)  The server has no prices yet."
        return
    }
    if ($status.ts -eq $script:lastTs) { return }

    Invoke-WebRequest -Uri "$server/api/addon/prices.lua" -UseBasicParsing -OutFile $tempFile -TimeoutSec 120
    if ("$(Get-Content -LiteralPath $tempFile -TotalCount 1)" -notlike 'ForeverAHPrices_Data*') {
        Remove-Item -LiteralPath $tempFile -Force
        throw 'the server sent something other than a price file'
    }
    Move-Item -LiteralPath $tempFile -Destination $dataFile -Force
    $script:lastTs = $status.ts
    Write-Host "$(Get-Date -Format HH:mm)  Prices updated. Type /reload in game to load them."
}

Write-Host "Syncing prices from $server every $Minutes minutes. Leave this window open while you play."
while ($true) {
    try {
        Update-Prices
    } catch {
        Write-Host "$(Get-Date -Format HH:mm)  Couldn't update prices: $($_.Exception.Message)"
        if ($Once) { exit 1 }
    }
    if ($Once) { exit 0 }
    Start-Sleep -Seconds ($Minutes * 60)
}

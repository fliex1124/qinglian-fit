$ErrorActionPreference = 'Stop'
$fitPidPath = Join-Path $PSScriptRoot '.local/server.json'
if (-not (Test-Path -LiteralPath $fitPidPath)) { Write-Host '没有找到本项目的服务记录。'; return }
$fitInfo = Get-Content -Raw -LiteralPath $fitPidPath | ConvertFrom-Json
$fitProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$fitInfo.pid)"
if (-not $fitProcess) { Write-Host '服务已经停止。'; return }
$fitExpected = Join-Path $PSScriptRoot 'server.py'
if ($fitProcess.CommandLine -notlike "*$fitExpected*") { throw '进程不属于本项目，已停止操作。' }
Stop-Process -Id ([int]$fitInfo.pid)
Write-Host '轻练 FIT 服务已停止，浏览器数据保留。'

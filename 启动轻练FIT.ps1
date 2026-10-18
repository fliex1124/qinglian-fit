$ErrorActionPreference = 'Stop'
$fitRoot = $PSScriptRoot
$fitUrl = 'http://127.0.0.1:8788'
$running = $false
try {
    $fitStatus = Invoke-RestMethod "$fitUrl/api/status" -TimeoutSec 2
    $running = $null -ne $fitStatus.keyConfigured
} catch { }
if (-not $running) {
    $env:FIT_PORT = '8788'
    $fitPython = (Get-Command python -ErrorAction Stop).Source
    Start-Process -FilePath $fitPython -ArgumentList ('"' + (Join-Path $fitRoot 'server.py') + '"') -WorkingDirectory $fitRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $fitRoot 'server.log') -RedirectStandardError (Join-Path $fitRoot 'server-error.log')
    for ($fitAttempt = 0; $fitAttempt -lt 20; $fitAttempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $fitStatus = Invoke-RestMethod "$fitUrl/api/status" -TimeoutSec 1
            $running = $true
            break
        } catch { }
    }
}
if (-not $running) { throw '启动失败，请检查 server-error.log。' }
Start-Process $fitUrl
Write-Host "轻练 FIT 已打开：$fitUrl"
Write-Host 'AI密钥已配置：' $fitStatus.keyConfigured

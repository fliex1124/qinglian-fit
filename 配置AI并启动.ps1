# Key lives only in this process and its child server, never in a file.
$ErrorActionPreference = 'Stop'
$fitExisting = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue
if ($fitExisting) {
    Write-Host '请先运行同目录的“停止轻练FIT.ps1”，再运行本脚本。'
    return
}
$fitSecret = Read-Host '请在本机输入通义千问 API Key（隐藏输入，不要发到聊天中）' -AsSecureString
$fitPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($fitSecret)
try {
    $env:QWEN_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($fitPtr)
    if ([string]::IsNullOrWhiteSpace($env:QWEN_API_KEY)) { throw '密钥为空' }
    $fitEndpoint = Read-Host '兼容接口完整地址（回车使用北京 DashScope 默认地址）'
    if ($fitEndpoint) {
        $fitUri = [uri]$fitEndpoint
        if ($fitUri.Scheme -ne 'https' -or $fitUri.Host -notlike '*.aliyuncs.com') { throw '请输入阿里云官方 HTTPS 接口地址。' }
        $env:QWEN_BASE_URL = $fitEndpoint
    }
    & (Join-Path $PSScriptRoot '启动轻练FIT.ps1')
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($fitPtr)
    Remove-Item Env:QWEN_API_KEY -ErrorAction SilentlyContinue
}

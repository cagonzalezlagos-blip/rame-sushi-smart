$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$mutex = New-Object System.Threading.Mutex($false,'Local\RameSushiPrintAgent')
if (!$mutex.WaitOne(0)) { Write-Host 'El agente ya esta funcionando.'; Start-Sleep -Seconds 3; exit 0 }
try {
 $config = Get-Content -LiteralPath (Join-Path $root 'printer-config.json') -Raw | ConvertFrom-Json
 $secure = Get-Content -LiteralPath (Join-Path $root 'printer-key.dpapi') -Raw | ConvertTo-SecureString
 $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try { $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
 $env:SUPABASE_URL = $config.url
 $env:WINDOWS_PRINTER_NAME = $config.printer
 $env:POLL_SECONDS = '5'
 & node.exe (Join-Path $root 'print-agent\agent.js')
 if ($LASTEXITCODE -ne 0) { throw 'El agente termino con un error. Revisa el mensaje anterior.' }
} catch {
 Write-Host $_.Exception.Message -ForegroundColor Red
 Read-Host 'Pulsa Enter para cerrar'
} finally {
 Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
 $mutex.ReleaseMutex()
 $mutex.Dispose()
}

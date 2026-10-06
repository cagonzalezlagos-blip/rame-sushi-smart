$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$install = Join-Path $env:LOCALAPPDATA 'RameSushi'
New-Item -ItemType Directory -Force -Path $install | Out-Null
Copy-Item -Path (Join-Path $root 'print-agent') -Destination $install -Recurse -Force
Copy-Item -Path (Join-Path $root 'Iniciar-Impresion.ps1') -Destination $install -Force
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) {
 $link = $shell.CreateShortcut((Join-Path $desktop 'Rame Sushi.lnk'))
 $link.TargetPath = $edge
 $link.Arguments = '--app=https://rame-sushi-smart.vercel.app/'
 $link.Save()
} else {
 Set-Content -Path (Join-Path $desktop 'Rame Sushi.url') -Value "[InternetShortcut]`r`nURL=https://rame-sushi-smart.vercel.app/" -Encoding ASCII
}
Write-Host 'Acceso a Rame Sushi creado en el escritorio.' -ForegroundColor Green
$answer = Read-Host 'Configurar ahora la impresion automatica? (S/N)'
if ($answer -notmatch '^[sS]$') { Write-Host 'Puedes ejecutar este instalador nuevamente para configurar la impresora.'; exit 0 }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (!$node -or !$npm) {
 Start-Process 'https://nodejs.org/en/download'
 throw 'Instala Node.js LTS, cierra esta ventana y vuelve a ejecutar INSTALAR-RAME.cmd.'
}
$printers = @(Get-Printer | Sort-Object Name)
if (!$printers.Count) { throw 'Instala primero el controlador de tu impresora y verifica que aparezca en Windows.' }
for ($i=0; $i -lt $printers.Count; $i++) { Write-Host ("{0}. {1}" -f ($i+1),$printers[$i].Name) }
$choice = 0
if (![int]::TryParse((Read-Host 'Numero de la impresora de comandas'),[ref]$choice) -or $choice -lt 1 -or $choice -gt $printers.Count) { throw 'Seleccion de impresora invalida.' }
$printer = $printers[$choice-1].Name
Write-Host 'Se necesita la service_role key del proyecto Supabase de Rame.'
Write-Host 'Se introduce solo aqui y se protege con tu cuenta de Windows. No la envies por chat ni la subas a GitHub.'
$key = Read-Host 'Clave privada (no se mostrara)' -AsSecureString
if ($key.Length -lt 20) { throw 'Clave incompleta.' }
$key | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $install 'printer-key.dpapi') -Encoding ASCII
@{printer=$printer;url='https://ngqyxevyrfkdyuatklnl.supabase.co'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'printer-config.json') -Encoding UTF8
Push-Location (Join-Path $install 'print-agent')
try { & $npm.Source ci; if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias. Revisa internet e intenta nuevamente.' } } finally { Pop-Location }
$link = $shell.CreateShortcut((Join-Path $desktop 'Rame - Impresion.lnk'))
$link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $install 'Iniciar-Impresion.ps1') + '"'
$link.WorkingDirectory = $install
$link.Save()
$startupAnswer = Read-Host 'Iniciar la impresion automaticamente al entrar a Windows? (S/N)'
$startupPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Rame - Impresion.lnk'
if ($startupAnswer -match '^[sS]$') { Copy-Item (Join-Path $desktop 'Rame - Impresion.lnk') $startupPath -Force }
Write-Host 'Instalacion preparada. Abre Rame - Impresion para iniciar el agente.' -ForegroundColor Green
Write-Host 'Los pedidos pendientes de impresion se enviaran al iniciar. Revisa la cola antes de abrirlo.'

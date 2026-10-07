$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'RameSushi'
$mutex=New-Object System.Threading.Mutex($false,'Local\RameSushiPrintAgent')
$locked=$false
try {
 if (!(Test-Path (Join-Path $root 'printer-config.json')) -or !(Test-Path (Join-Path $root 'printer-key.dpapi'))) { throw 'No se encontro la instalacion de Rame en esta cuenta de Windows. Usa el mismo usuario con el que instalaste la impresora.' }
 $locked=$mutex.WaitOne(0)
 if (!$locked) { throw 'Cierra primero la ventana Rame - Impresion y vuelve a ejecutar esta actualizacion.' }
 $source=Join-Path $PSScriptRoot 'print-agent'
 $target=Join-Path $root 'print-agent'
 $backup=Join-Path $root ('respaldo-impresion-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
 New-Item -ItemType Directory -Force -Path $backup | Out-Null
 foreach ($name in @('agent.js','ticket-model.js','escpos.js','print-ticket.ps1')) {
  $old=Join-Path $target $name
  if(Test-Path $old) { Copy-Item -LiteralPath $old -Destination $backup }
  Copy-Item -LiteralPath (Join-Path $source $name) -Destination $target -Force
 }
 Write-Host 'Actualizacion lista. Se conservaron la impresora, la clave y el inicio automatico.' -ForegroundColor Green
 Write-Host 'Abre Rame - Impresion desde el escritorio.'
 Write-Host 'Prueba una comanda: letra grande, sin logo y sin abrir el cajon.'
 Write-Host 'Luego prueba el boton Abrir cajon en la app.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red }
finally { if($locked){$mutex.ReleaseMutex()};$mutex.Dispose();Read-Host 'Pulsa Enter para cerrar' }

$installDir = Join-Path $env:LOCALAPPDATA 'MoviesVlcHandler'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'movies-vlc-handler.ps1') -Destination $installDir -Force

$protocolKey = 'HKCU:\Software\Classes\movies-vlc'
New-Item -Force -Path $protocolKey | Out-Null
Set-ItemProperty -Path $protocolKey -Name '(Default)' -Value 'Movies VLC protocol'
Set-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value ''
New-Item -Force -Path "$protocolKey\shell\open\command" | Out-Null
$handlerPath = Join-Path $installDir 'movies-vlc-handler.ps1'
Set-ItemProperty -Path "$protocolKey\shell\open\command" -Name '(Default)' -Value ('"{0}" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}" "%1"' -f (Join-Path $PSHOME 'powershell.exe'), $handlerPath)

Write-Host 'Movies VLC handler installed for this Windows user.'

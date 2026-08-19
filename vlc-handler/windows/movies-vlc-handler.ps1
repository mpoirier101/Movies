param([Parameter(Mandatory = $true)][string]$Uri)

$parsed = [Uri]$Uri
if ($parsed.Scheme -ne 'movies-vlc' -or $parsed.Host -ne 'play') {
  throw 'Invalid Movies VLC link.'
}

$encodedUrl = ($parsed.Query.TrimStart('?') -split '&' |
  Where-Object { $_ -like 'url=*' } |
  Select-Object -First 1)
if (-not $encodedUrl) { throw 'Missing video URL.' }
$videoUrl = [Uri]::UnescapeDataString($encodedUrl.Substring(4))
$video = [Uri]$videoUrl
if ($video.Host -ne '192.168.0.188' -or $video.AbsolutePath -ne '/api/video' -or
    -not (($video.Scheme -eq 'https' -and $video.Port -eq 443) -or ($video.Scheme -eq 'http' -and $video.Port -eq 3000))) {
  throw 'This handler only accepts Movies video links from the NAS.'
}

$vlcPaths = @(
  "$env:ProgramFiles\VideoLAN\VLC\vlc.exe",
  "${env:ProgramFiles(x86)}\VideoLAN\VLC\vlc.exe"
)
$vlc = $vlcPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $vlc) { throw 'VLC was not found. Install VLC, then try again.' }

Start-Process -FilePath $vlc -ArgumentList @($video.AbsoluteUri)

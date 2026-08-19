#!/usr/bin/env bash
set -euo pipefail

python3 - "$1" <<'PY'
import subprocess
import sys
from urllib.parse import parse_qs, urlparse

link = urlparse(sys.argv[1])
if link.scheme != "movies-vlc" or link.netloc != "play":
    raise SystemExit("Invalid Movies VLC link")
video_url = parse_qs(link.query).get("url", [""])[0]
video = urlparse(video_url)
if video.hostname != "192.168.0.188" or video.path != "/api/video" or (video.scheme, video.port) not in (("https", 443), ("http", 3000)):
    raise SystemExit("This handler only accepts Movies video links from the NAS")
subprocess.Popen(["vlc", video_url], start_new_session=True)
PY

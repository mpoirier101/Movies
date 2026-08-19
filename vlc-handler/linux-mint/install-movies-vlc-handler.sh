#!/usr/bin/env bash
set -euo pipefail

install_dir="$HOME/.local/share/movies-vlc"
applications_dir="$HOME/.local/share/applications"
mkdir -p "$install_dir" "$applications_dir"
install -m 755 "$(dirname "$0")/movies-vlc-handler.sh" "$install_dir/movies-vlc-handler.sh"

cat > "$applications_dir/movies-vlc.desktop" <<EOF
[Desktop Entry]
Name=Movies VLC Launcher
Exec=$install_dir/movies-vlc-handler.sh %u
Type=Application
Terminal=false
MimeType=x-scheme-handler/movies-vlc;
NoDisplay=true
EOF

xdg-mime default movies-vlc.desktop x-scheme-handler/movies-vlc
update-desktop-database "$applications_dir" 2>/dev/null || true
echo 'Movies VLC handler installed for this Linux Mint user.'

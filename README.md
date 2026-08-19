# Movies App

Cross-platform replacement for Movies.hta — runs on **Windows and Linux** using Node.js.
No npm packages required — uses only Node.js built-ins.

---

## Requirements

- [Node.js](https://nodejs.org/) v14 or newer

---

## NAS deployment (OpenMediaVault)

The shared installation runs as a Docker service on the NAS and is available to
every LAN computer at:

```
https://192.168.0.188
```

Docker starts at NAS boot and the Movies/Caddy containers use `restart: unless-stopped`,
so it starts automatically after a NAS reboot. Its configuration lives in
`/opt/movies/compose.yaml` on the NAS. The Video library is mounted directly as:

```
/srv/dev-disk-by-uuid-0a5a52bb-5cb0-48f8-9419-fdebd3804c67/Video → /video
```

The service's persistent cache is `/opt/movies/data/cache.json` on the NAS.

### Trust the NAS certificate

The NAS creates a private certificate authority for Movies. Each computer must
trust its root certificate before Chrome will treat the address as secure.

- **Linux Mint:** run the following once in a terminal, then completely close
  and reopen Chrome:

  ```bash
  scp michel@192.168.0.188:/opt/movies/movies-nas-root-ca.crt ~/Downloads/
  sudo install -m 0644 ~/Downloads/movies-nas-root-ca.crt /usr/local/share/ca-certificates/
  sudo update-ca-certificates
  ```

- **Windows:** import `movies-nas-root-ca.crt` into **Current User → Trusted
  Root Certification Authorities**.

### VLC playback on each computer

The browser cannot start an application on the computer that clicked a link by
itself. The `movies-vlc://` handler bridges that gap: it validates a NAS video
URL and launches **that computer's** VLC.

- **Windows:** run `install-movies-vlc-handler.ps1` from the project’s
  `vlc-handler/windows` folder.
- **Linux Mint:** run `bash install-movies-vlc-handler.sh` from the project’s
  `vlc-handler/linux-mint` folder.

Install the handler once for each user account that will use Play. VLC must be
installed on that computer.

## Local development setup

### 1. Configure your NAS path

Open **`server.js`** and edit the `CONFIG` block near the top:

```js
const CONFIG = {
  port: 3000,

  // Windows UNC  : "\\\\NAS-DLINK\\Video"
  // Windows drive: "Z:\\Video"
  // Linux mount  : "/mnt/nas/Video"
  rootPath: os.platform() === "win32"
    ? "\\\\NAS-DLINK\\Video"
    : "/mnt/nas/Video",

  videoExtensions: ["avi", "mkv", "mp4", "ts", "flv", "m4v"],
};
```

You can set different paths for Windows and Linux in the same file, or
hardcode a single path if you only use one OS.

---

### 2. Run the app

**Windows:**
```
Double-click start.bat
```
or in a terminal:
```
node server.js
```

**Linux / macOS:**
```bash
chmod +x start.sh
./start.sh
```
or directly:
```bash
node server.js
```

The app will automatically open in your default browser at `http://localhost:3000`.

---

## Features

| Feature | Notes |
|---|---|
| **Category menu** | All sub-folders of your Video root, auto-detected |
| **Poster grid** | Reads `<MovieName>.jpg` alongside the video file |
| **Click to play** | Opens the video in your default media player |
| **Right-click menu** | Play, Move, permanently Delete, IMDB search, YouTube trailer, View poster |
| **Search by name** | Searches across ALL categories in real time |

---

## Folder / file naming

The app expects each movie to have a matching poster with the same base name:

```
Video/
  Sci-Fi/
    The Matrix.mkv
    The Matrix.jpg      ← poster
    Dune.avi
    Dune.jpg
  Action/
    ...
```

---

## Notes

- The app serves poster images directly from the NAS through the Node server,
  so the browser never needs direct NAS access.
- No data is sent anywhere — everything runs locally on `127.0.0.1`.
- Move relocates the video and its matching poster between detected categories.
- Delete permanently removes the video and its matching poster after confirmation.
  It does not use the Recycle Bin; keep backups of the NAS library.
- The NAS deployment is LAN-only. Anyone on the LAN can Move or permanently
  Delete files, by design. Do not expose port 3000 to the internet.

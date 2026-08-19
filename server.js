/**
 * Movies App - Node.js Server v3.3
 * Cross-platform: Windows (UNC/mapped drive) + Linux (CIFS mount)
 * Added: persistent JSON cache, Move API, Refresh API
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const CONFIG = {
  port: Number(process.env.MOVIES_PORT) || 3000,
  bindAddress: process.env.MOVIES_BIND_ADDRESS || "127.0.0.1",
  rootPath: process.env.MOVIES_ROOT || (os.platform() === "win32"
    ? "\\\\NAS\\Video"
    : "/home/tv/Desktop/NAS/Video"),
  videoExtensions: ["avi", "mkv", "mp4", "ts", "flv", "m4v"],
  // Cache file lives next to server.js
  cachePath: process.env.MOVIES_CACHE_PATH || path.join(__dirname, "cache.json"),
  pidPath: process.env.MOVIES_PID_PATH || path.join(__dirname, "server.pid"),
};

// ──────────────────────────────────────────────
// MIME
// ──────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".avi":  "video/x-msvideo",
  ".mkv":  "video/x-matroska",
  ".mp4":  "video/mp4",
  ".m4v":  "video/x-m4v",
  ".ts":   "video/mp2t",
  ".flv":  "video/x-flv",
};

// ──────────────────────────────────────────────
// CACHE
// Structure: { folders: [...], files: { categoryName: [...] } }
// ──────────────────────────────────────────────
let CACHE = { folders: [], files: {} };

/** Build the full cache by scanning the NAS. Saves to disk. */
function buildCache() {
  console.log("[cache] Building from NAS...");
  const start   = Date.now();
  const folders = scanFolders();
  const files   = {};
  for (const folder of folders) {
    files[folder] = scanFiles(folder);
  }
  CACHE = { folders, files, builtAt: new Date().toISOString() };
  saveCache();
  console.log(`[cache] Done — ${folders.length} folders, ${Object.values(files).reduce((n, f) => n + f.length, 0)} movies (${Date.now() - start}ms)`);
  return CACHE;
}

/** Refresh a single folder in the cache by scanning only that NAS directory. */
function refreshFolder(category) {
  const safe = (category || "").split(/[\\/]/).pop();
  if (!safe) throw new Error("Missing category");

  const folderPath = path.join(CONFIG.rootPath, safe);
  if (!fs.existsSync(folderPath)) throw new Error("Folder not found: " + folderPath);

  CACHE.folders = CACHE.folders || [];
  CACHE.files = CACHE.files || {};

  if (!CACHE.folders.includes(safe)) {
    CACHE.folders.push(safe);
    CACHE.folders.sort((a, b) => {
      if (a === "NEW") return -1;
      if (b === "NEW") return  1;
      return a.localeCompare(b);
    });
  }

  CACHE.files[safe] = scanFiles(safe);
  CACHE.updatedAt = new Date().toISOString();
  saveCache();

  console.log(`[cache] Refreshed ${safe} — ${CACHE.files[safe].length} movies`);
  return { category: safe, files: CACHE.files[safe], folders: CACHE.folders, updatedAt: CACHE.updatedAt };
}

/** Save cache to disk. */
function saveCache() {
  try {
    const temporaryPath = CONFIG.cachePath + ".tmp";
    fs.writeFileSync(temporaryPath, JSON.stringify(CACHE, null, 2), "utf8");
    fs.renameSync(temporaryPath, CONFIG.cachePath);
  } catch (e) {
    console.error("[cache] Save failed:", e.message);
  }
}

/** Load cache from disk. Returns true if successful. */
function loadCache() {
  try {
    if (!fs.existsSync(CONFIG.cachePath)) return false;
    const raw = fs.readFileSync(CONFIG.cachePath, "utf8");
    CACHE = JSON.parse(raw);
    const total = Object.values(CACHE.files || {}).reduce((n, f) => n + f.length, 0);
    console.log(`[cache] Loaded from disk — ${(CACHE.folders||[]).length} folders, ${total} movies (built ${CACHE.builtAt || "unknown"})`);
    return true;
  } catch (e) {
    console.error("[cache] Load failed:", e.message);
    return false;
  }
}

// ──────────────────────────────────────────────
// NAS Scan helpers (used only when building cache)
// ──────────────────────────────────────────────

function scanFolders() {
  const root = CONFIG.rootPath;
  if (!fs.existsSync(root)) return [];
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort((a, b) => {
        if (a === "NEW") return -1;
        if (b === "NEW") return  1;
        return a.localeCompare(b);
      });
  } catch (e) {
    console.error("[scanFolders]", e.message);
    return [];
  }
}

function scanFiles(category) {
  const folderPath = path.join(CONFIG.rootPath, category);
  if (!fs.existsSync(folderPath)) return [];
  try {
    const entries = fs.readdirSync(folderPath);
    const posters = new Map();
    for (const entry of entries) {
      const extension = path.extname(entry).slice(1).toLowerCase();
      if (["jpg", "jpeg", "png"].includes(extension)) {
        posters.set(entry.slice(0, -path.extname(entry).length).toLowerCase(), entry);
      }
    }
    return entries
      .filter((f) => CONFIG.videoExtensions.includes(fileExt(f)))
      .map((f) => {
        const basename = f.split(/[\\/]/).pop();
        const name     = basename.replace(/\.[^.]+$/, "");
        const poster   = posters.get(name.toLowerCase()) || null;
        return { name, file: basename, category, poster };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.error("[scanFiles]", e.message);
    return [];
  }
}

function fileExt(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

function safeLeaf(value, label) {
  if (typeof value !== "string" || !value || value === "." || value === ".." ||
      value.includes("\0") || value.includes("/") || value.includes("\\")) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function rootChild(...parts) {
  const root = path.resolve(CONFIG.rootPath);
  const target = path.resolve(root, ...parts);
  const relative = path.relative(root, target);
  if (relative === "" || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Path is outside the video root");
  }
  return target;
}

function cachedMovie(category, file, poster) {
  const movie = ((CACHE.files || {})[category] || []).find((entry) => entry.file === file);
  if (!movie || movie.poster !== poster) throw new Error("Movie is not in the current cache");
  return movie;
}

function readJsonBody(req, callback) {
  let body = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 64 * 1024) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooLarge) return callback(new Error("Request body is too large"));
    try {
      callback(null, JSON.parse(body));
    } catch (e) {
      callback(new Error("Invalid JSON request body"));
    }
  });
  req.on("error", (e) => callback(e));
}

function serveVideo(req, res, filePath) {
  const size = fs.statSync(filePath).size;
  const mimeType = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;
  const headers = { "Accept-Ranges": "bytes", "Content-Type": mimeType };

  if (!range) {
    res.writeHead(200, { ...headers, "Content-Length": size });
    return fs.createReadStream(filePath).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    return res.end();
  }
  const start = match[1] === "" ? 0 : Number(match[1]);
  const end = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    return res.end();
  }
  const safeEnd = Math.min(end, size - 1);
  res.writeHead(206, {
    ...headers,
    "Content-Length": safeEnd - start + 1,
    "Content-Range": `bytes ${start}-${safeEnd}/${size}`,
  });
  fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
}

// ──────────────────────────────────────────────
// HTTP Server
// ──────────────────────────────────────────────

const server = http.createServer((req, res) => {
  try {
    handleRequest(req, res);
  } catch (e) {
    console.error("[server error]", e.message);
    if (!res.headersSent) { res.writeHead(500); res.end("Internal server error"); }
  }
});

function handleRequest(req, res) {
  const reqUrl   = new URL(req.url, "http://localhost");
  const pathname = reqUrl.pathname;

  // ── GET /api/folders ─── served from cache ─
  if (pathname === "/api/folders") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(CACHE.folders || []));
  }

  // ── GET /api/files?category=X ─── from cache
  if (pathname === "/api/files") {
    const category = reqUrl.searchParams.get("category") || "";
    const safe     = category.split(/[\\/]/).pop();
    const files    = (CACHE.files || {})[safe] || [];
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(files));
  }

  // ── GET /api/search?q=X ─── from cache ─────
  if (pathname === "/api/search") {
    const query   = (reqUrl.searchParams.get("q") || "").toLowerCase().trim();
    const results = [];
    if (query) {
      for (const folder of (CACHE.folders || [])) {
        for (const f of ((CACHE.files || {})[folder] || [])) {
          if (f.name.toLowerCase().includes(query)) results.push(f);
        }
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(results));
  }

  // ── POST /api/refresh ── rebuild cache ──────
  if (pathname === "/api/refresh" && req.method === "POST") {
    buildCache();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      folders: CACHE.folders,
      builtAt: CACHE.builtAt,
    }));
  }

  // ── POST /api/refresh-quick ── refresh only NEW folder ─
  if (pathname === "/api/refresh-quick" && req.method === "POST") {
    try {
      const refreshed = refreshFolder("NEW");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ok: true,
        category: refreshed.category,
        files: refreshed.files,
        folders: refreshed.folders,
        updatedAt: refreshed.updatedAt,
        builtAt: CACHE.builtAt || null,
      }));
    } catch (e) {
      console.error("[refresh-quick]", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ── Legacy local-play endpoint ───────────────
  // Playback now uses the movies-vlc:// handler on the computer that clicked Play.
  if (pathname === "/api/play") {
    res.writeHead(410, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "Use the Movies VLC handler instead." }));
  }

  // ── GET /api/video?category=X&file=Y ─────────
  // Streams a cached video to VLC or another LAN client, including byte-range seeking.
  if (pathname === "/api/video") {
    try {
      const category = safeLeaf(reqUrl.searchParams.get("category"), "category");
      const file = safeLeaf(reqUrl.searchParams.get("file"), "file");
      const movie = ((CACHE.files || {})[category] || []).find((entry) => entry.file === file);
      if (!movie) throw new Error("Movie is not in the current cache");
      const filePath = rootChild(category, file);
      if (!fs.existsSync(filePath)) throw new Error("File not found");
      return serveVideo(req, res, filePath);
    } catch (e) {
      res.writeHead(e.message === "File not found" ? 404 : 400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ── POST /api/move ───────────────────────────
  // Body: { category, file, poster, targetCategory }
  // Moves video + poster on NAS, updates cache in memory + disk.
  if (pathname === "/api/move" && req.method === "POST") {
    readJsonBody(req, (bodyError, body) => {
      try {
        if (bodyError) throw bodyError;
        const { category, file, poster, targetCategory } = body;
        const srcCat = safeLeaf(category, "source category");
        const tgtCat = safeLeaf(targetCategory, "destination category");
        const safeFile = safeLeaf(file, "file");
        const safePoster = poster === null ? null : safeLeaf(poster, "poster");

        if (srcCat === tgtCat) {
          throw new Error("Source and destination are the same");
        }
        const movie = cachedMovie(srcCat, safeFile, safePoster);
        if (!(CACHE.folders || []).includes(tgtCat)) throw new Error("Destination category is not in the current cache");

        const srcVideo = rootChild(srcCat, safeFile);
        const dstVideo = rootChild(tgtCat, safeFile);
        const srcPoster = safePoster ? rootChild(srcCat, safePoster) : null;
        const dstPoster = safePoster ? rootChild(tgtCat, safePoster) : null;
        if (!fs.existsSync(srcVideo)) throw new Error("Video file not found");
        if (fs.existsSync(dstVideo)) throw new Error("A video with this name already exists in the destination");
        if (srcPoster && !fs.existsSync(srcPoster)) throw new Error("Poster file not found");
        if (dstPoster && fs.existsSync(dstPoster)) throw new Error("A poster with this name already exists in the destination");

        let videoMoved = false;
        if (safePoster) {
          try {
            fs.renameSync(srcVideo, dstVideo);
            videoMoved = true;
            fs.renameSync(srcPoster, dstPoster);
          } catch (e) {
            if (videoMoved && fs.existsSync(dstVideo) && !fs.existsSync(srcVideo)) {
              try { fs.renameSync(dstVideo, srcVideo); } catch (rollbackError) {
                throw new Error(`Move failed and rollback failed: ${rollbackError.message}`);
              }
            }
            throw new Error("Move failed: " + e.message);
          }
        } else {
          fs.renameSync(srcVideo, dstVideo);
        }

        // Update cache — remove from source, add to destination
        CACHE.files[srcCat] = CACHE.files[srcCat].filter((entry) => entry.file !== safeFile);
        const moved = { ...movie, category: tgtCat };
        CACHE.files[tgtCat] = CACHE.files[tgtCat] || [];
        CACHE.files[tgtCat].push(moved);
        CACHE.files[tgtCat].sort((a, b) => a.name.localeCompare(b.name));
        saveCache();

        console.log(`[move] "${safeFile}" : ${srcCat} → ${tgtCat}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));

      } catch (e) {
        console.error("[move]", e.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, errors: [e.message] }));
      }
    });
    return;
  }

  // ── POST /api/delete ────────────────────────
  // Body: { category, file, poster }
  // Deletes video + poster from NAS, removes from cache.
  if (pathname === "/api/delete" && req.method === "POST") {
    readJsonBody(req, (bodyError, body) => {
      try {
        if (bodyError) throw bodyError;
        const { category, file, poster } = body;
        const safeCat = safeLeaf(category, "category");
        const safeFile = safeLeaf(file, "file");
        const safePoster = poster === null ? null : safeLeaf(poster, "poster");
        cachedMovie(safeCat, safeFile, safePoster);

        const videoPath = rootChild(safeCat, safeFile);
        const posterPath = safePoster ? rootChild(safeCat, safePoster) : null;
        if (!fs.existsSync(videoPath)) throw new Error("Video file not found");
        if (posterPath && !fs.existsSync(posterPath)) throw new Error("Poster file not found");

        // Rename both files before deletion. If staging fails, restore any file already staged.
        const token = `.deleting-${process.pid}-${Date.now()}`;
        const stagedVideo = videoPath + token;
        const stagedPoster = posterPath ? posterPath + token : null;
        let videoStaged = false;
        try {
          fs.renameSync(videoPath, stagedVideo);
          videoStaged = true;
          if (posterPath) fs.renameSync(posterPath, stagedPoster);
        } catch (e) {
          if (videoStaged && fs.existsSync(stagedVideo) && !fs.existsSync(videoPath)) {
            try { fs.renameSync(stagedVideo, videoPath); } catch (rollbackError) {
              throw new Error(`Delete failed and rollback failed: ${rollbackError.message}`);
            }
          }
          throw new Error("Delete failed: " + e.message);
        }

        try {
          if (stagedPoster) fs.unlinkSync(stagedPoster);
          fs.unlinkSync(stagedVideo);
        } catch (e) {
          // If neither staged file was removed, restore the original state.
          if (fs.existsSync(stagedVideo) && (!stagedPoster || fs.existsSync(stagedPoster))) {
            try {
              if (stagedPoster) fs.renameSync(stagedPoster, posterPath);
              fs.renameSync(stagedVideo, videoPath);
            } catch (rollbackError) {
              throw new Error(`Delete partially completed; manual check required: ${rollbackError.message}`);
            }
            throw new Error("Delete failed; both files were restored: " + e.message);
          }
          throw new Error("Delete partially completed; manual check required: " + e.message);
        }

        // Remove from cache
        if (CACHE.files[safeCat]) {
          CACHE.files[safeCat] = CACHE.files[safeCat].filter(f => f.file !== safeFile);
        }
        saveCache();

        console.log(`[delete] "${safeFile}" from ${safeCat}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));

      } catch (e) {
        console.error("[delete]", e.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, errors: [e.message] }));
      }
    });
    return;
  }

  // ── GET /api/report ── counts from cache ────
  if (pathname === "/api/report") {
    const rows = (CACHE.folders || []).map(folder => ({
      category: folder,
      count: ((CACHE.files || {})[folder] || []).length,
    }));
    const total = rows.reduce((n, r) => n + r.count, 0);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ rows, total, builtAt: CACHE.builtAt || null }));
  }

  // ── GET /api/poster?category=X&file=Y ───────
  if (pathname === "/api/poster") {
    let category;
    let posterFile;
    try {
      category = safeLeaf(reqUrl.searchParams.get("category"), "category");
      posterFile = safeLeaf(reqUrl.searchParams.get("file"), "poster");
    } catch (_) {
      return servePlaceholder(res);
    }
    if (!((CACHE.files || {})[category] || []).some((movie) => movie.poster === posterFile)) return servePlaceholder(res);
    const imgPath = rootChild(category, posterFile);
    if (!fs.existsSync(imgPath)) return servePlaceholder(res);
    const mimeType = MIME[path.extname(imgPath).toLowerCase()] || "image/jpeg";
    fs.readFile(imgPath, (err, data) => {
      if (err) { console.error("[poster]", err.message); return servePlaceholder(res); }
      res.writeHead(200, { "Content-Type": mimeType, "Content-Length": data.length });
      res.end(data);
    });
    return;
  }

  // ── GET /api/debug?category=X ───────────────
  // ── Static files ─────────────────────────────
  let filePath = (pathname === "/" || pathname === "")
    ? path.join(__dirname, "index.html")
    : path.join(__dirname, decodeURIComponent(pathname));

  const staticRoot = path.resolve(__dirname) + path.sep;
  if (!path.resolve(filePath).startsWith(staticRoot)) { res.writeHead(403); return res.end("Forbidden"); }
  if (!fs.existsSync(filePath))        { res.writeHead(404); return res.end("Not found"); }

  const mimeType = MIME[path.extname(filePath).toLowerCase()] || "text/plain";
  res.writeHead(200, { "Content-Type": mimeType });
  const stream = fs.createReadStream(filePath);
  stream.on("error", (e) => { console.error("[static]", e.message); if (!res.writableEnded) res.end(); });
  stream.pipe(res);
}

function servePlaceholder(res) {
  const px = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC",
    "base64"
  );
  res.writeHead(200, { "Content-Type": "image/png" });
  res.end(px);
}

process.on("uncaughtException",  (e) => console.error("[uncaughtException]", e.message));
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("exit", () => {
  try {
    if (fs.existsSync(CONFIG.pidPath) && fs.readFileSync(CONFIG.pidPath, "utf8").trim() === String(process.pid)) {
      fs.unlinkSync(CONFIG.pidPath);
    }
  } catch (_) {
    // A stale PID file is harmless; restart.bat removes it before launching again.
  }
});

// ──────────────────────────────────────────────
// STARTUP — load cache or build it
// ──────────────────────────────────────────────
server.listen(CONFIG.port, CONFIG.bindAddress, () => {
  fs.writeFileSync(CONFIG.pidPath, String(process.pid), "utf8");
  console.log(`\n🎬  Movies App running on ${CONFIG.bindAddress}:${CONFIG.port}`);
  console.log(`    Root path : ${CONFIG.rootPath}`);
  console.log(`    Platform  : ${os.platform()}`);
  console.log(`    Cache     : ${CONFIG.cachePath}\n`);

  // Load existing cache from disk.
  // If no cache exists yet, the user must click Refresh in the browser.
  if (!loadCache()) {
    console.log("[cache] No cache found — click Refresh in the browser to build it.");
    CACHE = { folders: [], files: {}, builtAt: null };
  }
});

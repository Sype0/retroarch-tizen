/*
 * TizenBrew service: lets a phone on the same network send a ROM to the TV.
 *
 * TizenBrew runs this file in a Node.js vm sandbox on the TV (Node 4 on old
 * models), so stick to ES5 and built-in modules.
 *
 *   phone  --GET /-------------------> phone.html (proxied from the module files)
 *   phone  --POST /api/upload--------> one request per file (a game may be
 *                                      several files, e.g. .cue + .bin); the
 *                                      last one turns the batch into "pending"
 *   TV app --GET /api/pending (poll)-> { id, core, main, files: [names] }
 *   TV app --GET /api/rom/<id>/<i>---> bytes of file i
 *   TV app --GET /api/done/<id>------> clears pending
 */
"use strict";

var http = require("http");
var https = require("https");
var os = require("os");

var PORT = 8085;
var MAX_UPLOAD = 512 * 1024 * 1024;
var FILES_BASE = (typeof process !== "undefined" && process.env && process.env.RA_PHONE_BASE) ||
   "https://cdn.jsdelivr.net/gh/Sype0/retroarch-tizen/app/";
var PHONE_FILES = { "/": "phone.html", "/phone.html": "phone.html", "/cores.js": "cores.js" };
var TYPES = { html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8" };

var pending = null;   /* { id, core, main, files: [{ name, data }] } */
var batches = {};     /* upload batches still being received */
var nextId = 1;
var fileCache = {};

function localIp() {
   var ifaces = os.networkInterfaces();
   var best = null;
   Object.keys(ifaces).forEach(function (name) {
      ifaces[name].forEach(function (a) {
         if (a.family !== "IPv4" && a.family !== 4) return;
         if (a.internal) return;
         /* prefer private LAN ranges */
         if (!best || /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address)) best = a.address;
      });
   });
   return best || "127.0.0.1";
}

function send(res, status, body, type) {
   res.writeHead(status, {
      "Content-Type": type || "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-store"
   });
   res.end(body);
}

function json(res, obj) {
   send(res, 200, JSON.stringify(obj));
}

function getRemote(url, cb) {
   (url.indexOf("https:") === 0 ? https : http).get(url, function (r) {
      var chunks = [];
      r.on("data", function (c) { chunks.push(c); });
      r.on("end", function () {
         if (r.statusCode !== 200) cb(new Error("HTTP " + r.statusCode));
         else cb(null, Buffer.concat(chunks));
      });
   }).on("error", cb);
}

function servePhoneFile(res, file) {
   var cached = fileCache[file];
   if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
      send(res, 200, cached.data, TYPES[file.split(".").pop()]);
      return;
   }
   getRemote(FILES_BASE + file, function (err, data) {
      if (err) {
         if (cached) send(res, 200, cached.data, TYPES[file.split(".").pop()]);
         else send(res, 502, "TV internete bağlanamadı: " + err.message, "text/plain; charset=utf-8");
         return;
      }
      fileCache[file] = { data: data, at: Date.now() };
      send(res, 200, data, TYPES[file.split(".").pop()]);
   });
}

function handleUpload(req, res, query) {
   var name = (query.name || "rom.bin").replace(/[\/\\]/g, "_");
   var batchId = query.batch || String(Date.now());
   var chunks = [];
   var size = 0;
   var aborted = false;
   req.on("data", function (c) {
      if (aborted) return;
      size += c.length;
      if (size > MAX_UPLOAD) {
         aborted = true;
         chunks = [];
         delete batches[batchId];
         send(res, 413, JSON.stringify({ error: "Dosya çok büyük (en fazla 512 MB)" }));
         req.destroy();
         return;
      }
      chunks.push(c);
   });
   req.on("end", function () {
      if (aborted) return;
      /* only one batch is kept, so a new game drops an unfinished one */
      if (!batches[batchId]) batches = {};
      var batch = batches[batchId] || (batches[batchId] = []);
      batch.push({ name: name, data: Buffer.concat(chunks) });
      if (query.last === "1") {
         delete batches[batchId];
         pending = { id: nextId++, core: query.core || "", main: query.main || name, files: batch };
      }
      json(res, { ok: true });
   });
}

function parseQuery(url) {
   var q = {};
   var i = url.indexOf("?");
   if (i < 0) return q;
   url.slice(i + 1).split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
   });
   return q;
}

var server = http.createServer(function (req, res) {
   var path = req.url.split("?")[0];
   if (req.method === "OPTIONS") { send(res, 204, ""); return; }

   if (path === "/api/info") {
      var ip = localIp();
      json(res, { ip: ip, port: PORT, url: "http://" + ip + ":" + PORT + "/" });
   } else if (path === "/api/pending") {
      json(res, pending ? {
         id: pending.id,
         core: pending.core,
         main: pending.main,
         files: pending.files.map(function (f) { return { name: f.name, size: f.data.length }; })
      } : null);
   } else if (path.indexOf("/api/rom/") === 0) {
      var parts = path.split("/");
      var f = pending && pending.id === parseInt(parts[3], 10) && pending.files[parseInt(parts[4], 10)];
      if (!f) { send(res, 404, "{}"); return; }
      send(res, 200, f.data, "application/octet-stream");
   } else if (path.indexOf("/api/done/") === 0) {
      if (pending && pending.id === parseInt(path.slice(10), 10)) pending = null;
      json(res, { ok: true });
   } else if (path === "/api/upload" && req.method === "POST") {
      handleUpload(req, res, parseQuery(req.url));
   } else if (PHONE_FILES[path]) {
      servePhoneFile(res, PHONE_FILES[path]);
   } else {
      send(res, 404, "Not found", "text/plain");
   }
});

server.on("error", function (e) {
   /* Already running from an earlier launch of the module. */
   if (e.code !== "EADDRINUSE") console.log("[retroarch-tizen] service error: " + e.message);
});

server.listen(PORT, "0.0.0.0");

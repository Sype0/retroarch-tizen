/*
 * RetroArch for Tizen - launcher and web player glue.
 *
 * Based on RetroArch's pkg/emscripten/libretro/libretro.js (GPLv3), reworked
 * for TV use: remote-control navigation, ROM loading from USB storage or an
 * HTTP folder, remote keys translated into keyboard events for RetroArch.
 *
 * Deliberately written without optional chaining, arrow functions in hot
 * paths or other syntax newer than what Tizen 6.5's Chromium 85 supports.
 */
(function () {
   "use strict";

   var REMOTE_BASE = "https://sype0.github.io/retroarch-tizen/";
   var RA_HOME = "/home/web_user/retroarch";
   var CFG_PATH = RA_HOME + "/userdata/retroarch.cfg";
   var ROM_DIR = RA_HOME + "/roms";

   /* Inside the .wgt (file://) and inside TizenBrew (served by its local
      proxy on 127.0.0.1) the big files come from GitHub Pages. */
   var ASSET_BASE = (function () {
      var m = /[?&]base=([^&]+)/.exec(location.search);
      if (m) return decodeURIComponent(m[1]);
      if (location.protocol === "file:" || location.hostname === "127.0.0.1")
         return REMOTE_BASE;
      return "./";
   })();

   var hasTizen = typeof tizen !== "undefined";
   var $ = function (id) { return document.getElementById(id); };
   var canvas = $("canvas");

   (window.__raEarlyErrors || []).forEach(window.raShowError);

   function log() {
      console.log.apply(console, ["[ra-tizen]"].concat([].slice.call(arguments)));
   }

   /* ------------------------------------------------------------------ */
   /* Remote keys                                                          */
   /* ------------------------------------------------------------------ */

   var TV_KEYS = ["ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",
      "MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop",
      "MediaRewind", "MediaFastForward", "ChannelUp", "ChannelDown",
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

   if (hasTizen && tizen.tvinputdevice) {
      TV_KEYS.forEach(function (k) {
         try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* not on this model */ }
      });
   }

   var KEY = {
      LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
      BACK: 10009, ESC: 27, BACKSPACE: 8,
      RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406
   };

   function k(code, key, keyCode) { return { code: code, key: key, keyCode: keyCode }; }
   function cmd(name) { return { cmd: name }; }

   /* Remote key -> keyboard key understood by RetroArch's default binds
      (x = A, z = B, s = X, a = Y, q/w = L/R, Enter = Start, RShift = Select),
      or a RetroArch command for the hotkey-like functions. */
   var REMOTE_MAP = {
      37: k("ArrowLeft", "ArrowLeft", 37),
      38: k("ArrowUp", "ArrowUp", 38),
      39: k("ArrowRight", "ArrowRight", 39),
      40: k("ArrowDown", "ArrowDown", 40),
      13: k("KeyX", "x", 88),
      10009: k("KeyZ", "z", 90),
      404: k("Enter", "Enter", 13),
      405: k("ShiftRight", "Shift", 16),
      406: k("KeyS", "s", 83),
      50: k("KeyA", "a", 65),
      49: k("KeyQ", "q", 81),
      51: k("KeyW", "w", 87),
      403: cmd("MENU_TOGGLE"),
      48: cmd("MENU_TOGGLE"),
      427: cmd("SAVE_STATE"),
      428: cmd("LOAD_STATE"),
      10252: cmd("PAUSE_TOGGLE"),
      415: cmd("PAUSE_TOGGLE"),
      19: cmd("PAUSE_TOGGLE")
   };

   var CMD_KEYS = {
      MENU_TOGGLE: k("F1", "F1", 112),
      SAVE_STATE: k("F2", "F2", 113),
      LOAD_STATE: k("F4", "F4", 115),
      PAUSE_TOGGLE: k("KeyP", "p", 80)
   };

   function sendKey(type, m) {
      var ev = new KeyboardEvent(type, { key: m.key, code: m.code, bubbles: true, cancelable: true });
      try {
         Object.defineProperty(ev, "keyCode", { get: function () { return m.keyCode; } });
         Object.defineProperty(ev, "which", { get: function () { return m.keyCode; } });
      } catch (e) { /* ignore */ }
      ev.__ra = true;
      canvas.dispatchEvent(ev);
   }

   /* RetroArch samples key state once per frame, so a release arriving in
      the same frame as the press would be lost. Hold keys for a minimum time. */
   var MIN_HOLD_MS = 60;
   var downAt = {};

   var playing = false;

   function onKey(e) {
      if (e.__ra) return;
      if (playing) {
         /* RetroArch listens on #canvas and keys off event.code, which TV
            remotes don't provide; re-dispatch a proper keyboard event. */
         var m = REMOTE_MAP[e.keyCode];
         if (!m && e.code) m = { code: e.code, key: e.key, keyCode: e.keyCode };
         if (!m) return;
         e.preventDefault();
         e.stopImmediatePropagation();
         if (m.cmd && Module && Module.retroArchSend) {
            if (e.type === "keydown" && !e.repeat) Module.retroArchSend(m.cmd);
            return;
         }
         /* legacy cores have no command interface: use the default hotkeys */
         if (m.cmd) m = CMD_KEYS[m.cmd];
         if (e.type === "keydown") {
            downAt[m.code] = Date.now();
            sendKey("keydown", m);
         } else {
            var held = Date.now() - (downAt[m.code] || 0);
            setTimeout(function () { sendKey("keyup", m); }, Math.max(0, MIN_HOLD_MS - held));
         }
         return;
      }
      if (e.type !== "keydown") return;
      if (loadingActive) { e.preventDefault(); return; }
      navKey(e);
   }

   window.addEventListener("keydown", onKey, true);
   window.addEventListener("keyup", onKey, true);

   /* ------------------------------------------------------------------ */
   /* Launcher navigation                                                  */
   /* ------------------------------------------------------------------ */

   var screenStack = [];
   var currentScreen = null;

   function showScreen(id, push) {
      if (push !== false && currentScreen) screenStack.push(currentScreen);
      var screens = document.querySelectorAll(".screen");
      for (var i = 0; i < screens.length; i++) screens[i].classList.remove("active");
      currentScreen = id;
      $(id).classList.add("active");
      focusFirst();
   }

   function goBack() {
      if (!screenStack.length) {
         exitApp();
         return;
      }
      showScreen(screenStack.pop(), false);
   }

   function exitApp() {
      if (hasTizen && tizen.application) {
         try { tizen.application.getCurrentApplication().exit(); return; } catch (e) { /* ignore */ }
      }
      history.back();
   }

   function focusables() {
      return [].slice.call($(currentScreen).querySelectorAll(".btn, .item, .tile, input.focusable"));
   }

   function setFocus(el) {
      var old = document.querySelector(".focused");
      if (old) old.classList.remove("focused");
      if (!el) return;
      el.classList.add("focused");
      el.scrollIntoView({ block: "nearest" });
      if (el.tagName === "INPUT") el.focus();
      else if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur();
   }

   function focusFirst() {
      setFocus(focusables()[0]);
   }

   /* Spatial navigation: pick the closest element in the pressed direction. */
   function moveFocus(dir) {
      var cur = document.querySelector(".focused");
      var els = focusables();
      if (!cur || els.indexOf(cur) < 0) { setFocus(els[0]); return; }
      var a = cur.getBoundingClientRect();
      var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      var best = null, bestScore = Infinity;
      els.forEach(function (el) {
         if (el === cur) return;
         var b = el.getBoundingClientRect();
         var dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
         var main, cross;
         if (dir === "left") { main = -dx; cross = dy; }
         else if (dir === "right") { main = dx; cross = dy; }
         else if (dir === "up") { main = -dy; cross = dx; }
         else { main = dy; cross = dx; }
         if (main <= 1) return;
         var score = main + Math.abs(cross) * 2;
         if (score < bestScore) { bestScore = score; best = el; }
      });
      if (best) setFocus(best);
   }

   function navKey(e) {
      var focused = document.querySelector(".focused");
      var inInput = focused && focused.tagName === "INPUT";
      switch (e.keyCode) {
         case KEY.LEFT: if (inInput) return; moveFocus("left"); break;
         case KEY.RIGHT: if (inInput) return; moveFocus("right"); break;
         case KEY.UP: moveFocus("up"); break;
         case KEY.DOWN: moveFocus("down"); break;
         case KEY.ENTER:
            if (inInput) { $("btn-url-ok").click(); break; }
            if (focused) focused.click();
            break;
         case KEY.BACK:
         case KEY.ESC:
            goBack();
            break;
         case KEY.BACKSPACE:
            if (inInput) return;
            goBack();
            break;
         default:
            return;
      }
      e.preventDefault();
   }

   /* Gamepad support in the launcher (RetroArch handles pads itself). */
   var padPrev = {};
   function pollPads() {
      if (!playing && navigator.getGamepads) {
         var pads = navigator.getGamepads();
         for (var i = 0; i < pads.length; i++) {
            var p = pads[i];
            if (!p) continue;
            var map = { 12: KEY.UP, 13: KEY.DOWN, 14: KEY.LEFT, 15: KEY.RIGHT, 0: KEY.ENTER, 1: KEY.BACK };
            var ax = p.axes || [];
            var state = {
               12: p.buttons[12] && p.buttons[12].pressed || ax[1] < -0.6,
               13: p.buttons[13] && p.buttons[13].pressed || ax[1] > 0.6,
               14: p.buttons[14] && p.buttons[14].pressed || ax[0] < -0.6,
               15: p.buttons[15] && p.buttons[15].pressed || ax[0] > 0.6,
               0: p.buttons[0] && p.buttons[0].pressed,
               1: p.buttons[1] && p.buttons[1].pressed
            };
            Object.keys(map).forEach(function (b) {
               var id = i + ":" + b;
               if (state[b] && !padPrev[id] && !loadingActive)
                  navKey({ keyCode: map[b], preventDefault: function () {} });
               padPrev[id] = state[b];
            });
         }
      }
      requestAnimationFrame(pollPads);
   }
   requestAnimationFrame(pollPads);

   function el(tag, cls, html) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html !== undefined) e.innerHTML = html;
      return e;
   }

   function esc(s) {
      return String(s).replace(/[&<>"]/g, function (c) {
         return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
      });
   }

   function fmtSize(n) {
      if (n == null || isNaN(n)) return "";
      if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
      return Math.max(1, Math.round(n / 1024)) + " KB";
   }

   /* ------------------------------------------------------------------ */
   /* Loading overlay                                                      */
   /* ------------------------------------------------------------------ */

   var loadingActive = false;

   function loading(text, frac) {
      loadingActive = text !== null;
      $("loading").classList.toggle("active", loadingActive);
      if (text) $("loading-text").textContent = text;
      $("loading-bar").style.width = (frac == null ? 0 : Math.round(frac * 100)) + "%";
   }

   function fail(msg, err) {
      loading(null);
      window.raShowError(msg + (err ? ": " + (err.message || err) : ""));
      log(msg, err);
   }

   /* ------------------------------------------------------------------ */
   /* Downloads                                                            */
   /* ------------------------------------------------------------------ */

   function download(url, label) {
      return new Promise(function (resolve, reject) {
         var xhr = new XMLHttpRequest();
         xhr.open("GET", url, true);
         xhr.responseType = "arraybuffer";
         xhr.onprogress = function (e) {
            if (label) loading(label + (e.total ? " (" + fmtSize(e.loaded) + " / " + fmtSize(e.total) + ")" : " (" + fmtSize(e.loaded) + ")"),
               e.total ? e.loaded / e.total : null);
         };
         xhr.onload = function () {
            /* status 0 is what file:// URLs report */
            if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response && xhr.response.byteLength))
               resolve(xhr.response);
            else reject(new Error("HTTP " + xhr.status + " " + url));
         };
         xhr.onerror = function () { reject(new Error("Ağ hatası: " + url)); };
         xhr.send();
      });
   }

   function downloadText(url) {
      return new Promise(function (resolve, reject) {
         var xhr = new XMLHttpRequest();
         xhr.open("GET", url, true);
         xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
            else reject(new Error("HTTP " + xhr.status));
         };
         xhr.onerror = function () { reject(new Error("Bağlanılamadı")); };
         xhr.send();
      });
   }

   function loadScript(url) {
      return new Promise(function (resolve, reject) {
         var s = document.createElement("script");
         s.src = url;
         s.onload = resolve;
         s.onerror = function () { reject(new Error("Script yüklenemedi: " + url)); };
         document.body.appendChild(s);
      });
   }

   /* ------------------------------------------------------------------ */
   /* Filesystem (BrowserFS, same layout as the upstream web player)       */
   /* ------------------------------------------------------------------ */

   var fsReady = null;

   function initUserFS() {
      return new Promise(function (resolve) {
         var BFS = BrowserFS.FileSystem;
         if (!BFS.IndexedDB.isAvailable()) {
            log("IndexedDB unavailable, settings will not persist");
            resolve(new BFS.InMemory());
            return;
         }
         BFS.IndexedDB.Create({ storeName: "RetroArch" }, function (e, idbfs) {
            if (e) { log("idbfs", e); resolve(new BFS.InMemory()); return; }
            BFS.AsyncMirror.Create({ sync: new BFS.InMemory(), async: idbfs }, function (e2, fs) {
               if (e2) { log("afs", e2); resolve(new BFS.InMemory()); return; }
               resolve(fs);
            });
         });
      });
   }

   function initBundleFS() {
      return download(ASSET_BASE + "assets/frontend/bundle.zip", "RetroArch dosyaları indiriliyor").then(function (buf) {
         return new Promise(function (resolve, reject) {
            var Buffer = BrowserFS.BFSRequire("buffer").Buffer;
            var u8 = new Uint8Array(buf);
            BrowserFS.FileSystem.ZipFS.Create({ zipData: Buffer.from ? Buffer.from(u8) : Buffer(u8) }, function (e, fs) {
               if (e) reject(e); else resolve(fs);
            });
         });
      });
   }

   function initFS() {
      if (!fsReady) {
         fsReady = Promise.all([initUserFS(), initBundleFS()]).then(function (r) {
            var mfs = new BrowserFS.FileSystem.MountableFileSystem();
            mfs.mount(RA_HOME, r[1]);
            mfs.mount(RA_HOME + "/cores", new BrowserFS.FileSystem.InMemory());
            mfs.mount(RA_HOME + "/roms", new BrowserFS.FileSystem.InMemory());
            mfs.mount(RA_HOME + "/userdata", r[0]);
            BrowserFS.initialize(mfs);
         });
      }
      return fsReady;
   }

   /* Settings written on first start only; RetroArch saves over them. */
   var DEFAULT_CFG = [
      'menu_driver = "rgui"',
      'rgui_browser_directory = "' + ROM_DIR + '"',
      'rgui_show_start_screen = "false"',
      'video_smooth = "false"',
      'video_font_size = "24.000000"',
      'audio_latency = "128"',
      'input_exit_emulator = "nul"',
      'input_autodetect_enable = "true"',
      'menu_show_core_updater = "false"',
      'menu_show_online_updater = "false"',
      'config_save_on_exit = "true"',
      'core_info_cache_enable = "false"',
      'savestate_thumbnail_enable = "false"',
      ""
   ].join("\n");

   function mkdirp(FS, path) {
      var parts = path.split("/"), cur = "";
      for (var i = 1; i < parts.length; i++) {
         cur += "/" + parts[i];
         try { FS.mkdir(cur); } catch (e) { /* exists */ }
      }
   }

   /* ------------------------------------------------------------------ */
   /* Starting RetroArch                                                   */
   /* ------------------------------------------------------------------ */

   var Module = null;
   var pendingRom = null; /* { main, files: [{ name, data: Uint8Array }] } */

   function relaunch(core) {
      /* Loading another wasm module in the same page leaks the old one; a
         reload is the cheap and reliable way on memory-constrained TVs. */
      if (core) {
         var id = core.split("/").pop().replace(/_libretro\.core$/, "");
         try { sessionStorage.setItem("ra_boot_core", id); } catch (e) { /* ignore */ }
      }
      location.reload();
   }

   /* Old (2019) non-modular builds, still the only N64 core on the libretro
      web buildbot: configured through a global Module before the script
      runs, and the whole RetroArch frontend of that era is baked in. */
   function loadLegacyCore(wasm) {
      return new Promise(function (resolve, reject) {
         var mod = {
            noInitialRun: true,
            arguments: [],
            canvas: canvas,
            wasmBinary: wasm,
            locateFile: function (path) { return ASSET_BASE + "cores/" + path; },
            print: function (t) { console.log("stdout:", t); },
            printErr: function (t) { console.log("stderr:", t); },
            onRuntimeInitialized: function () { resolve(mod); },
            onAbort: function (what) { reject(new Error("abort: " + what)); }
         };
         window.Module = mod;
         loadScript(window.__RA_SCRIPT_URL).catch(reject);
      });
   }

   function startCore(core) {
      loading("RetroArch hazırlanıyor…", null);
      var factoryName = "libretro_" + core.id;

      initFS().then(function () {
         return download(ASSET_BASE + "cores/" + core.id + "_libretro.wasm", core.emu + " indiriliyor");
      }).then(function (wasm) {
         loading("Başlatılıyor…", 1);
         window.__RA_SCRIPT_URL = ASSET_BASE + "cores/" + core.id + "_libretro.js";
         if (core.legacy) return loadLegacyCore(wasm);
         var p = window[factoryName] ? Promise.resolve() : loadScript(window.__RA_SCRIPT_URL);
         return p.then(function () {
            if (!window[factoryName]) throw new Error(factoryName + " bulunamadı");
            return window[factoryName]({
               noInitialRun: true,
               canvas: canvas,
               wasmBinary: wasm,
               locateFile: function (path) { return ASSET_BASE + "cores/" + path; },
               preRun: [function (mod) { mod.ENV.LIBRARY_PATH = RA_HOME + "/cores/" + core.id + "_libretro.core"; }],
               print: function (t) { console.log("stdout:", t); },
               printErr: function (t) { console.log("stderr:", t); },
               retroArchSend: function (msg) { this.EmscriptenSendCommand(msg); },
               retroArchRecv: function () { return this.EmscriptenReceiveCommandReply(); },
               retroArchExit: function (c) { relaunch(c); }
            });
         });
      }).then(function (mod) {
         Module = mod;
         window.Module = mod;
         /* legacy builds keep their runtime in globals */
         var FS = mod.FS || window.FS;
         var bfs = new BrowserFS.EmscriptenFS(FS, mod.PATH || window.PATH, mod.ERRNO_CODES || window.ERRNO_CODES);
         mkdirp(FS, "/home");
         FS.mount(bfs, { root: "/home" }, "/home");

         /* RetroArch expects core files to exist; the real code is the
            already loaded wasm module. */
         RA_CORES.forEach(function (c) {
            FS.writeFile(RA_HOME + "/cores/" + c.id + "_libretro.core", new Uint8Array());
         });

         mkdirp(FS, RA_HOME + "/userdata");
         var hasCfg = true;
         try { FS.stat(CFG_PATH); } catch (e) { hasCfg = false; }
         if (!hasCfg) FS.writeFile(CFG_PATH, DEFAULT_CFG);

         var content = "--menu";
         if (pendingRom) {
            pendingRom.files.forEach(function (f) {
               FS.writeFile(ROM_DIR + "/" + f.name, f.data);
            });
            content = ROM_DIR + "/" + pendingRom.main;
            pendingRom = null;
         }

         loading(null);
         playing = true;
         document.body.classList.add("playing");
         canvas.focus();
         mod.callMain(["-v", content, "-c", CFG_PATH]);
      }).catch(function (err) {
         playing = false;
         document.body.classList.remove("playing");
         fail(core.emu + " başlatılamadı", err);
      });
   }

   /* ------------------------------------------------------------------ */
   /* Screens                                                              */
   /* ------------------------------------------------------------------ */

   var selectedCore = null;

   function buildHome() {
      var grid = $("core-grid");
      RA_CORES.forEach(function (c) {
         var t = el("button", "tile", '<div class="sys">' + esc(c.name) + '</div><div class="emu">' + esc(c.emu) + "</div>");
         t.onclick = function () { openSource(c); };
         grid.appendChild(t);
      });
      $("btn-help").onclick = function () { showScreen("screen-help"); };
      $("btn-reset").onclick = resetSettings;
   }

   function resetSettings() {
      try { localStorage.removeItem("ra_net_url"); } catch (e) { /* ignore */ }
      if (!window.indexedDB) return;
      var req = indexedDB.deleteDatabase("RetroArch");
      req.onsuccess = function () { alert("Ayarlar ve kayıtlar silindi."); };
      req.onerror = function () { alert("Silinemedi."); };
   }

   function openSource(core) {
      selectedCore = core;
      $("source-title").textContent = core.name + " — " + core.emu;
      var list = $("source-list");
      list.innerHTML = "";

      function add(label, meta, fn) {
         var b = el("button", "item", "<span>" + esc(label) + "</span><span class=\"meta\">" + esc(meta || "") + "</span>");
         b.onclick = fn;
         list.appendChild(b);
      }

      if (usbAvailable()) add("USB bellekten ROM seç", "", browseUsbRoot);
      var net = savedNetUrl();
      if (net) add("Ağ klasöründen ROM seç", net, function () { browseHttp(net); });
      add(net ? "Ağ klasörü adresini değiştir" : "Ağ klasöründen ROM seç", "HTTP", function () {
         $("url-input").value = net || "http://";
         showScreen("screen-url");
      });
      add("RetroArch menüsünü aç", "ROM olmadan", function () { startCore(core); });
      showScreen("screen-source");
   }

   /* ---- File browser (shared by USB and HTTP) ---- */

   function matchesCore(name) {
      var ext = name.split(".").pop().toLowerCase();
      return ext === "zip" || ext === "7z" || selectedCore.ext.indexOf(ext) >= 0;
   }

   /* entries: [{ name, dir: bool, size, open: fn }] */
   function showBrowser(title, path, entries, push) {
      $("browser-title").textContent = title;
      $("browser-path").textContent = path;
      var list = $("browser-list");
      list.innerHTML = "";
      entries.sort(function (a, b) {
         if (a.dir !== b.dir) return a.dir ? -1 : 1;
         return a.name.localeCompare(b.name);
      });
      var shown = 0;
      entries.forEach(function (en) {
         if (!en.dir && !matchesCore(en.name)) return;
         shown++;
         var b = el("button", "item", "<span>" + (en.dir ? "📁 " : "") + esc(en.name) + "</span><span class=\"meta\">" + (en.dir ? "" : fmtSize(en.size)) + "</span>");
         b.onclick = en.open;
         list.appendChild(b);
      });
      if (!shown) list.appendChild(el("div", "muted", "Bu klasörde " + esc(selectedCore.name) + " için dosya yok."));
      showScreen("screen-browser", push);
   }

   function playRom(name, data) {
      pendingRom = { main: name, files: [{ name: name, data: data }] };
      startCore(selectedCore);
   }

   /* ---- USB (Tizen filesystem API, only inside the .wgt) ---- */

   function usbAvailable() {
      return hasTizen && !!tizen.filesystem;
   }

   function browseUsbRoot() {
      tizen.filesystem.listStorages(function (storages) {
         var usb = storages.filter(function (s) { return s.type === "EXTERNAL" && s.state === "MOUNTED"; });
         if (!usb.length) { fail("Takılı USB bellek bulunamadı"); return; }
         if (usb.length === 1) { browseUsb(usb[0].label, true); return; }
         showBrowser("USB", "", usb.map(function (s) {
            return { name: s.label, dir: true, open: function () { browseUsb(s.label, true); } };
         }), true);
      }, function (e) { fail("USB listelenemedi", e); });
   }

   function browseUsb(path, push) {
      tizen.filesystem.resolve(path, function (dir) {
         dir.listFiles(function (files) {
            var entries = files.filter(function (f) { return f.name.charAt(0) !== "."; }).map(function (f) {
               return {
                  name: f.name,
                  dir: f.isDirectory,
                  size: f.fileSize,
                  open: f.isDirectory
                     ? function () { browseUsb(path + "/" + f.name); }
                     : function () { readUsbFile(f); }
               };
            });
            showBrowser("USB", path, entries, push);
         }, function (e) { fail("Klasör okunamadı", e); });
      }, function (e) { fail("Klasör açılamadı: " + path, e); }, "r");
   }

   function readUsbFile(f) {
      loading(f.name + " okunuyor…", null);
      setTimeout(function () {
         try {
            /* Tizen 5+ API: returns a Uint8Array directly. */
            if (tizen.filesystem.openFile) {
               var h = tizen.filesystem.openFile(f.fullPath, "r");
               var data = h.readData();
               h.close();
               playRom(f.name, data);
               return;
            }
         } catch (e) { log("openFile failed, falling back", e); }
         f.openStream("r", function (stream) {
            try {
               var bytes = stream.readBytes(f.fileSize);
               stream.close();
               playRom(f.name, new Uint8Array(bytes));
            } catch (e) { fail("Dosya okunamadı", e); }
         }, function (e) { fail("Dosya açılamadı", e); });
      }, 50);
   }

   /* ---- HTTP folder (directory listing of any static web server) ---- */

   function savedNetUrl() {
      try { return localStorage.getItem("ra_net_url") || ""; } catch (e) { return ""; }
   }

   $("btn-url-ok").onclick = function () {
      var url = $("url-input").value.trim();
      if (!/^https?:\/\//.test(url)) url = "http://" + url;
      if (url.charAt(url.length - 1) !== "/") url += "/";
      try { localStorage.setItem("ra_net_url", url); } catch (e) { /* ignore */ }
      browseHttp(url);
   };

   function browseHttp(url, push) {
      loading("Bağlanılıyor…", null);
      downloadText(url).then(function (html) {
         loading(null);
         var doc = new DOMParser().parseFromString(html, "text/html");
         var seen = {};
         var entries = [];
         [].forEach.call(doc.querySelectorAll("a[href]"), function (a) {
            var href = a.getAttribute("href");
            if (!href || href.charAt(0) === "?" || href.charAt(0) === "#" || /^(\.\.\/?|\/)$/.test(href)) return;
            var abs;
            try { abs = new URL(href, url).href; } catch (e) { return; }
            if (abs.indexOf(url) !== 0 || abs === url || seen[abs]) return;
            seen[abs] = true;
            var dir = abs.charAt(abs.length - 1) === "/";
            var name = decodeURIComponent(abs.slice(url.length).replace(/\/$/, ""));
            if (name.indexOf("/") >= 0) return;
            entries.push({
               name: name,
               dir: dir,
               open: dir
                  ? function () { browseHttp(abs); }
                  : function () {
                     download(abs, name + " indiriliyor").then(function (buf) {
                        playRom(name, new Uint8Array(buf));
                     }).catch(function (e) { fail("İndirilemedi", e); });
                  }
            });
         });
         showBrowser("Ağ klasörü", url, entries, push);
      }).catch(function (e) {
         fail("Ağ klasörüne bağlanılamadı (" + url + ")", e);
      });
   }

   /* ---- Phone link (TizenBrew service in tizenbrew/service.js) ---- */

   var SERVICE = "http://127.0.0.1:8085/";

   function getJSON(url) {
      return downloadText(url).then(function (t) { return JSON.parse(t); });
   }

   function showQr(url) {
      var qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      $("qr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
      $("phone-url").textContent = url;
      $("phone-panel").style.display = "flex";
   }

   function receiveFromPhone(p) {
      var done = function () { return downloadText(SERVICE + "api/done/" + p.id); };
      var core = RA_CORES.filter(function (c) { return c.id === p.core; })[0];
      if (!core) { fail("Bilinmeyen sistem: " + p.core); return done().catch(function () {}); }
      selectedCore = core;
      var files = [];
      return p.files.reduce(function (chain, f, i) {
         return chain.then(function () {
            return download(SERVICE + "api/rom/" + p.id + "/" + i, "Telefondan alınıyor: " + f.name).then(function (buf) {
               files.push({ name: f.name, data: new Uint8Array(buf) });
            });
         });
      }, Promise.resolve()).then(done).then(function () {
         pendingRom = { main: p.main, files: files };
         startCore(core);
      }).catch(function (e) {
         fail("Telefondan alınamadı", e);
         return done().catch(function () {}); /* don't retry the same upload forever */
      });
   }

   /* The service only exists when running as a TizenBrew module; elsewhere
      the first request fails and the QR panel just stays hidden. */
   function pollPhone(delay) {
      setTimeout(function () {
         getJSON(SERVICE + "api/pending").then(function (p) {
            if (!p || loadingActive) { pollPhone(1000); return; }
            if (playing) {
               /* A new game while one is running: restart the page, the
                  pending game is picked up again after the reload. */
               location.reload();
               return;
            }
            receiveFromPhone(p).then(function () { pollPhone(1000); });
         }, function () { pollPhone(5000); });
      }, delay);
   }

   function initPhoneLink() {
      if (location.protocol === "https:") return; /* mixed content */
      getJSON(SERVICE + "api/info").then(function (info) {
         showQr(info.url);
         pollPhone(0);
      }, function () {
         /* TizenBrew starts the service asynchronously; retry a few times */
         initPhoneLink.tries = (initPhoneLink.tries || 0) + 1;
         if (initPhoneLink.tries < 6) setTimeout(initPhoneLink, 2000);
      });
   }

   /* ------------------------------------------------------------------ */
   /* Boot                                                                 */
   /* ------------------------------------------------------------------ */

   $("subtitle").textContent = "Samsung Tizen TV · " + (hasTizen ? "Tizen" : "tarayıcı") +
      " · " + ((/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1] ? "Chromium " + /Chrome\/(\d+)/.exec(navigator.userAgent)[1] : navigator.userAgent);

   buildHome();
   initPhoneLink();
   showScreen("screen-home", false);

   /* A core switch from RetroArch's own menu reloads the page into it. */
   var bootCore = null;
   try { bootCore = sessionStorage.getItem("ra_boot_core"); sessionStorage.removeItem("ra_boot_core"); } catch (e) { /* ignore */ }
   if (bootCore) {
      var c = RA_CORES.filter(function (x) { return x.id === bootCore; })[0];
      if (c) { selectedCore = c; startCore(c); }
   }
})();

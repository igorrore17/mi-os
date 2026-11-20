// =========================================================================
// MySpatialOS — Fase 3: Motor 360° + Gestor de Ventanas + Apps + Manos
// =========================================================================

import { registerExtraApps } from "./apps.js?v=3";
import { initHandControl } from "./hands.js?v=3";

const bootScreen = document.getElementById("bootScreen");
const bootBtn = document.getElementById("bootBtn");
const bootStatus = document.getElementById("bootStatus");
const bgVideo = document.getElementById("bgVideo");
const bgCustom = document.getElementById("bgCustom");
const bgGrid = document.getElementById("bgGrid");
const stage = document.getElementById("spatialStage");
const handOverlay = document.getElementById("handOverlay");
const topBar = document.getElementById("topBar");
const sysMetrics = document.getElementById("sysMetrics");
const dock = document.getElementById("dock");
const recenterBtn = document.getElementById("recenterBtn");
const gyroBtn = document.getElementById("gyroBtn");
const handsBtn = document.getElementById("handsBtn");
const hideUiBtn = document.getElementById("hideUiBtn");
const restoreUiBtn = document.getElementById("restoreUiBtn");
const camSwitchBtn = document.getElementById("camSwitchBtn");
const bgFileInput = document.getElementById("bgFileInput");

const DEFAULT_THEME = {
  accent: "#38bdf8",
  glassHex: "#141822",
  glassAlpha: 0.52,
  glassBlur: 16,
  radius: 22,
  dockBottom: 92,
  bgMode: "camera",
  customBgUrl: ""
};

let theme = loadTheme();

function loadTheme() {
  try {
    return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem("spatialos_theme") || "{}") };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

function hexToRgbStr(hex) {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function applyTheme() {
  const root = document.documentElement.style;
  root.setProperty("--accent", theme.accent);
  root.setProperty("--glass-rgb", hexToRgbStr(theme.glassHex));
  root.setProperty("--glass-alpha", String(theme.glassAlpha));
  root.setProperty("--glass-blur", `${theme.glassBlur}px`);
  root.setProperty("--win-radius", `${theme.radius}px`);
  root.setProperty("--dock-bottom", `${theme.dockBottom}px`);

  if (theme.bgMode === "camera") {
    bgVideo.style.display = "block";
    bgVideo.style.opacity = "1";
  } else {
    bgVideo.style.opacity = "";
    bgVideo.style.display = "none";
  }

  bgGrid.style.display = theme.bgMode === "grid" ? "block" : "none";
  bgCustom.style.display = theme.bgMode === "custom" ? "block" : "none";
  if (theme.customBgUrl) {
    bgCustom.style.backgroundImage = `url(${theme.customBgUrl})`;
  }

  localStorage.setItem("spatialos_theme", JSON.stringify(theme));
}

let facingMode = "environment";
let currentStream = null;

async function startCamera() {
  if (currentStream) currentStream.getTracks().forEach((t) => t.stop());
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, min: 30 }
      },
      audio: false
    });
    bgVideo.srcObject = currentStream;
    bgVideo.classList.toggle("mirror", facingMode === "user");
    await bgVideo.play();
    camSwitchBtn.textContent = facingMode === "environment" ? "CAM: BACK" : "CAM: FRONT";
  } catch (err) {
    bootStatus.textContent = `Cámara no disponible (${err.message}). Usando modo rejilla.`;
    theme.bgMode = "grid";
    applyTheme();
  }
}

const PX_PER_DEG = 8.2;

const cam = {
  gyroEnabled: true,
  hasGyroData: false,
  rawYaw: 0,
  rawPitch: 0,
  zeroYaw: 0,
  zeroPitch: 0,
  yaw: 0,
  pitch: 0,
  manualYaw: 0,
  manualPitch: 0
};

function wrapDeg(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function onDeviceOrientation(e) {
  if (e.alpha === null || e.beta === null || e.gamma === null) return;
  const a = (e.alpha * Math.PI) / 180;
  const b = (e.beta * Math.PI) / 180;
  const g = (e.gamma * Math.PI) / 180;

  const vx = -Math.sin(g) * Math.cos(a) - Math.cos(g) * Math.sin(b) * Math.sin(a);
  const vy = -Math.sin(g) * Math.sin(a) + Math.cos(g) * Math.sin(b) * Math.cos(a);
  const vz = -Math.cos(g) * Math.cos(b);

  const yawDeg = (Math.atan2(vx, vy) * 180) / Math.PI;
  const pitchDeg = (Math.asin(Math.max(-1, Math.min(1, vz))) * 180) / Math.PI;

  cam.rawYaw = yawDeg;
  cam.rawPitch = pitchDeg;

  if (!cam.hasGyroData) {
    cam.hasGyroData = true;
    cam.zeroYaw = yawDeg;
    cam.zeroPitch = pitchDeg;
  }
}

function recenterView() {
  cam.zeroYaw = cam.rawYaw;
  cam.zeroPitch = cam.rawPitch;
  cam.manualYaw = 0;
  cam.manualPitch = 0;
}

let bgPanning = false, bgPanStartX = 0, bgPanStartY = 0, bgStartYaw = 0, bgStartPitch = 0;
stage.addEventListener("pointerdown", (e) => {
  if (e.target !== stage) return;
  bgPanning = true;
  bgPanStartX = e.clientX;
  bgPanStartY = e.clientY;
  bgStartYaw = cam.manualYaw;
  bgStartPitch = cam.manualPitch;
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener("pointermove", (e) => {
  if (!bgPanning) return;
  cam.manualYaw = wrapDeg(bgStartYaw - (e.clientX - bgPanStartX) / PX_PER_DEG);
  cam.manualPitch = Math.max(-75, Math.min(75, bgStartPitch + (e.clientY - bgPanStartY) / PX_PER_DEG));
});
stage.addEventListener("pointerup", () => { bgPanning = false; });

const windows = [];
let nextWinId = 1;
let topZ = 10;

function focusWindow(win) {
  topZ++;
  win.el.style.zIndex = topZ;
  for (const w of windows) w.el.classList.toggle("focused", w.id === win.id);
}

function createWindow({ title, appId, w = 270, h = 230, yawOffset = 0, pitchOffset = 0, buildContent }) {
  const id = nextWinId++;
  const el = document.createElement("section");
  el.className = "spWin";
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;

  el.innerHTML = `
    <div class="winHeader">
      <span class="winTitle">${title}</span>
      <span class="winTitle" style="opacity:0.45">#${id}</span>
    </div>
    <div class="winBody"></div>
    <div class="winControlsBar">
      <button class="winCloseBtn" aria-label="Cerrar">✕</button>
      <div class="winDragPill"></div>
    </div>
    <div class="winResizeHandle"></div>
  `;

  const win = {
    id, appId, el,
    yaw: wrapDeg(cam.yaw + yawOffset),
    pitch: Math.max(-65, Math.min(65, cam.pitch + pitchOffset)),
    w, h, cleanup: null
  };

  const body = el.querySelector(".winBody");
  win.cleanup = buildContent(body, win) || null;

  el.addEventListener("pointerdown", () => focusWindow(win));

  el.querySelector(".winCloseBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (win.cleanup) win.cleanup();
    el.remove();
    const idx = windows.findIndex((item) => item.id === id);
    if (idx !== -1) windows.splice(idx, 1);
  });

  const attachDrag = (handleEl) => {
    let dragging = false, sx = 0, sy = 0, startYaw = 0, startPitch = 0;
    handleEl.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      focusWindow(win);
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      startYaw = win.yaw; startPitch = win.pitch;
      handleEl.setPointerCapture(e.pointerId);
    });
    handleEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      win.yaw = wrapDeg(startYaw + (e.clientX - sx) / PX_PER_DEG);
      win.pitch = Math.max(-70, Math.min(70, startPitch - (e.clientY - sy) / PX_PER_DEG));
    });
    handleEl.addEventListener("pointerup", () => { dragging = false; });
  };
  attachDrag(el.querySelector(".winHeader"));
  attachDrag(el.querySelector(".winDragPill"));

  const resizer = el.querySelector(".winResizeHandle");
  let resizing = false, rx = 0, ry = 0, rw = 0, rh = 0;
  resizer.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    focusWindow(win);
    resizing = true;
    rx = e.clientX; ry = e.clientY;
    rw = win.w; rh = win.h;
    resizer.setPointerCapture(e.pointerId);
  });
  resizer.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    win.w = Math.max(190, Math.min(window.innerWidth * 0.92, rw + (e.clientX - rx)));
    win.h = Math.max(130, Math.min(window.innerHeight * 0.72, rh + (e.clientY - ry)));
    el.style.width = `${win.w}px`;
    el.style.height = `${win.h}px`;
  });
  resizer.addEventListener("pointerup", () => { resizing = false; });

  stage.appendChild(el);
  windows.push(win);
  focusWindow(win);
  return win;
}

const APPS = {
  notes() {
    createWindow({
      title: "Apuntes",
      appId: "notes",
      w: 270,
      h: 220,
      buildContent(body) {
        const ta = document.createElement("textarea");
        ta.className = "noteArea";
        ta.placeholder = "Escribe tus apuntes aquí (se guardan solos)...";
        ta.value = localStorage.getItem("spatialos_note_main") || "";
        ta.addEventListener("input", () => localStorage.setItem("spatialos_note_main", ta.value));
        body.appendChild(ta);
      }
    });
  },

  clock() {
    createWindow({
      title: "Reloj Espacial",
      appId: "clock",
      w: 230,
      h: 140,
      buildContent(body) {
        body.innerHTML = `<div class="clockBig">--:--</div><div class="clockDate">---</div>`;
        const big = body.querySelector(".clockBig");
        const dateEl = body.querySelector(".clockDate");
        const tick = () => {
          const d = new Date();
          big.textContent = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          dateEl.textContent = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
      }
    });
  },

  themes() {
    createWindow({
      title: "Personalizar OS",
      appId: "themes",
      w: 285,
      h: 315,
      buildContent(body) {
        body.innerHTML = `
          <div class="cfgGroup">
            <div class="presetBar">
              <button class="miniBtn" data-p="apple">APPLE</button>
              <button class="miniBtn" data-p="cyber">CYBER</button>
              <button class="miniBtn" data-p="crimson">CRIMSON</button>
              <button class="miniBtn" data-p="oled">OLED</button>
            </div>
          </div>
          <div class="cfgGroup">
            <div class="cfgRow"><span>Color Acento</span><input id="tAccent" type="color" value="${theme.accent}"></div>
            <div class="cfgRow"><span>Color Cristal</span><input id="tGlass" type="color" value="${theme.glassHex}"></div>
            <div class="cfgRow"><span>Opacidad</span><input id="tAlpha" type="range" min="10" max="95" value="${Math.round(theme.glassAlpha * 100)}"></div>
            <div class="cfgRow"><span>Desenfoque</span><input id="tBlur" type="range" min="0" max="30" value="${theme.glassBlur}"></div>
            <div class="cfgRow"><span>Bordes</span><input id="tRad" type="range" min="4" max="32" value="${theme.radius}"></div>
            <div class="cfgRow"><span>Altura Dock</span><input id="tDock" type="range" min="16" max="150" value="${theme.dockBottom}"></div>
          </div>
          <div class="cfgGroup">
            <div class="presetBar">
              <button class="miniBtn" data-bg="camera">CÁMARA</button>
              <button class="miniBtn" data-bg="black">NEGRO</button>
              <button class="miniBtn" data-bg="grid">REJILLA</button>
              <button class="miniBtn" data-bg="custom">FOTO</button>
            </div>
          </div>
        `;

        const bind = (id, fn) => body.querySelector(id).addEventListener("input", fn);
        bind("#tAccent", (e) => { theme.accent = e.target.value; applyTheme(); });
        bind("#tGlass", (e) => { theme.glassHex = e.target.value; applyTheme(); });
        bind("#tAlpha", (e) => { theme.glassAlpha = e.target.value / 100; applyTheme(); });
        bind("#tBlur", (e) => { theme.glassBlur = +e.target.value; applyTheme(); });
        bind("#tRad", (e) => { theme.radius = +e.target.value; applyTheme(); });
        bind("#tDock", (e) => { theme.dockBottom = +e.target.value; applyTheme(); });

        const PRESETS = {
          apple: { accent: "#38bdf8", glassHex: "#1c2230", glassAlpha: 0.48, glassBlur: 18, radius: 24 },
          cyber: { accent: "#00ff88", glassHex: "#061410", glassAlpha: 0.65, glassBlur: 10, radius: 10 },
          crimson: { accent: "#f43f5e", glassHex: "#1a090e", glassAlpha: 0.62, glassBlur: 14, radius: 16 },
          oled: { accent: "#ffffff", glassHex: "#000000", glassAlpha: 0.85, glassBlur: 4, radius: 18 }
        };

        body.querySelectorAll("[data-p]").forEach((btn) => {
          btn.addEventListener("click", () => {
            Object.assign(theme, PRESETS[btn.dataset.p]);
            applyTheme();
            body.querySelector("#tAccent").value = theme.accent;
            body.querySelector("#tGlass").value = theme.glassHex;
            body.querySelector("#tAlpha").value = Math.round(theme.glassAlpha * 100);
            body.querySelector("#tBlur").value = theme.glassBlur;
            body.querySelector("#tRad").value = theme.radius;
          });
        });

        body.querySelectorAll("[data-bg]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const mode = btn.dataset.bg;
            if (mode === "custom") bgFileInput.click();
            else { theme.bgMode = mode; applyTheme(); }
          });
        });
      }
    });
  }
};

registerExtraApps(APPS, createWindow);

initHandControl({
  video: bgVideo,
  overlayCanvas: handOverlay,
  toggleBtn: handsBtn,
  getMirror: () => facingMode === "user",
  getWindows: () => windows,
  focusWindow,
  wrapDeg,
  pxPerDeg: PX_PER_DEG
});

bgFileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    theme.customBgUrl = reader.result;
    theme.bgMode = "custom";
    applyTheme();
  };
  reader.readAsDataURL(file);
});

document.querySelectorAll(".dockBtn[data-app]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const fn = APPS[btn.dataset.app];
    if (fn) fn();
  });
});

recenterBtn.addEventListener("click", recenterView);

gyroBtn.addEventListener("click", () => {
  cam.gyroEnabled = !cam.gyroEnabled;
  gyroBtn.textContent = cam.gyroEnabled ? "GIRO: ON" : "GIRO: OFF";
  gyroBtn.classList.toggle("active", cam.gyroEnabled);
});

camSwitchBtn.addEventListener("click", async () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  theme.bgMode = "camera";
  applyTheme();
  await startCamera();
});

function setUiHidden(hidden) {
  topBar.style.display = hidden ? "none" : "flex";
  dock.style.display = hidden ? "none" : "flex";
  restoreUiBtn.style.display = hidden ? "block" : "none";
}
hideUiBtn.addEventListener("click", () => setUiHidden(true));
restoreUiBtn.addEventListener("click", () => setUiHidden(false));

function renderLoop() {
  const targetYaw = (cam.gyroEnabled && cam.hasGyroData)
    ? wrapDeg(cam.rawYaw - cam.zeroYaw + cam.manualYaw)
    : cam.manualYaw;
  const targetPitch = (cam.gyroEnabled && cam.hasGyroData)
    ? Math.max(-75, Math.min(75, cam.rawPitch - cam.zeroPitch + cam.manualPitch))
    : cam.manualPitch;

  cam.yaw = wrapDeg(cam.yaw + wrapDeg(targetYaw - cam.yaw) * 0.25);
  cam.pitch += (targetPitch - cam.pitch) * 0.25;

  const cx = window.innerWidth * 0.5;
  const cy = window.innerHeight * 0.45;

  for (const win of windows) {
    const dYaw = wrapDeg(win.yaw - cam.yaw);
    const dPitch = cam.pitch - win.pitch;

    if (Math.abs(dYaw) > 105) {
      win.el.style.visibility = "hidden";
      continue;
    }
    win.el.style.visibility = "visible";

    const sx = cx + dYaw * PX_PER_DEG - win.w * 0.5;
    const sy = cy + dPitch * PX_PER_DEG - win.h * 0.5;
    const rotY = Math.max(-28, Math.min(28, -dYaw * 0.42));
    const rotX = Math.max(-22, Math.min(22, -dPitch * 0.35));

    win.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) rotateY(${rotY.toFixed(1)}deg) rotateX(${rotX.toFixed(1)}deg)`;
  }

  sysMetrics.textContent = `YAW:${Math.round(cam.yaw)}°  PITCH:${Math.round(cam.pitch)}°  WIN:${windows.length}`;
  requestAnimationFrame(renderLoop);
}

bootBtn.addEventListener("click", async () => {
  bootBtn.disabled = true;
  bootStatus.textContent = "Activando giroscopio y cámara...";

  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res === "granted") window.addEventListener("deviceorientation", onDeviceOrientation);
    } else {
      window.addEventListener("deviceorientation", onDeviceOrientation);
    }
  } catch {}

  applyTheme();
  await startCamera();

  bootScreen.style.display = "none";
  setUiHidden(false);
  gyroBtn.classList.add("active");

  APPS.clock();
  APPS.themes();
  windows[0].yaw = wrapDeg(cam.yaw - 18);
  windows[1].yaw = wrapDeg(cam.yaw + 14);

  requestAnimationFrame(renderLoop);
});

// =========================================================================
// MySpatialOS — Fase 3: Control Aéreo con Manos (MediaPipe + Espacio 360°)
// =========================================================================

import {
  FilesetResolver,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

class OneEuroFilter {
  constructor(minCutoff = 1.6, beta = 0.045, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
  alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }
  reset() { this.xPrev = null; this.dxPrev = 0; this.tPrev = null; }
  filter(x, tMs) {
    if (this.xPrev === null) { this.xPrev = x; this.tPrev = tMs; return x; }
    const dt = Math.max(0.001, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = dxHat;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }
}

function createSlot() {
  return {
    active: false,
    lastSeen: 0,
    x: 0,
    y: 0,
    fx: new OneEuroFilter(1.6, 0.045, 1.0),
    fy: new OneEuroFilter(1.6, 0.045, 1.0),
    pinching: false,
    justPinched: false,
    pinchConsumed: false,
    grabWin: null,
    startX: 0,
    startY: 0,
    startYaw: 0,
    startPitch: 0,
    hoverType: "none" // "none" | "btn" | "close" | "win"
  };
}

export function initHandControl({
  video,
  overlayCanvas,
  toggleBtn,
  getMirror,
  getWindows,
  focusWindow,
  wrapDeg,
  pxPerDeg
}) {
  const ctx = overlayCanvas.getContext("2d");
  const detCanvas = document.createElement("canvas");
  const detCtx = detCanvas.getContext("2d", { alpha: false });

  let landmarker = null;
  let loading = false;
  let enabled = false;
  let rafId = null;
  let lastVideoTime = -1;
  let lastClickAt = 0;

  const slots = [createSlot(), createSlot()];
  const ripples = [];

  // Estado de escalado con 2 manos sobre la misma ventana
  const twoHand = {
    win: null,
    startDist: 1,
    startW: 250,
    startH: 200,
    startMidX: 0,
    startMidY: 0,
    startYaw: 0,
    startPitch: 0
  };

  function resize() {
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function getCoverRect(vw, vh, cw, ch) {
    const vr = vw / vh;
    const cr = cw / ch;
    if (cr > vr) {
      const w = cw, h = cw / vr;
      return { x: 0, y: (ch - h) * 0.5, w, h };
    }
    const h = ch, w = ch * vr;
    return { x: (cw - w) * 0.5, y: 0, w, h };
  }

  function mapPoint(lm, rect, mirror) {
    const nx = mirror ? 1 - lm.x : lm.x;
    return { x: rect.x + nx * rect.w, y: rect.y + lm.y * rect.h };
  }

  function getScaledFrame(vw, vh) {
    const targetW = 360;
    if (vw <= targetW) return video;
    const dh = Math.round((targetW * vh) / vw);
    if (detCanvas.width !== targetW || detCanvas.height !== dh) {
      detCanvas.width = targetW;
      detCanvas.height = dh;
    }
    detCtx.drawImage(video, 0, 0, targetW, dh);
    return detCanvas;
  }

  function resetAllSlots() {
    twoHand.win = null;
    for (const s of slots) {
      s.active = false;
      s.pinching = false;
      s.justPinched = false;
      s.pinchConsumed = false;
      s.grabWin = null;
      s.hoverType = "none";
      s.fx.reset();
      s.fy.reset();
    }
  }

  function getHitTargets(x, y) {
    const els = document.elementsFromPoint(x, y);
    let btn = null;
    let closeBtn = null;
    let winObj = null;
    const wins = getWindows();

    for (const el of els) {
      if (!closeBtn && el.classList?.contains("winCloseBtn")) closeBtn = el;
      if (!btn && (el.tagName === "BUTTON" || el.closest?.("button"))) {
        btn = el.tagName === "BUTTON" ? el : el.closest("button");
      }
      if (!winObj && el.classList?.contains("spWin")) {
        winObj = wins.find((w) => w.el === el) || null;
      }
    }
    return { btn, closeBtn, winObj };
  }

  function updateSlots(rawHands, now, rect, mirror) {
    const rawPinches = rawHands.map((h) => {
      const p4 = mapPoint(h[4], rect, mirror);
      const p8 = mapPoint(h[8], rect, mirror);
      const p0 = mapPoint(h[0], rect, mirror);
      const p9 = mapPoint(h[9], rect, mirror);
      const scale = Math.hypot(p9.x - p0.x, p9.y - p0.y) || 1;
      return {
        x: (p4.x + p8.x) * 0.5,
        y: (p4.y + p8.y) * 0.5,
        ratio: Math.hypot(p4.x - p8.x, p4.y - p8.y) / scale
      };
    });

    const used = [false, false];
    const assigned = [null, null];

    if (rawPinches.length === 2 && slots[0].active && slots[1].active) {
      const dSame = Math.hypot(rawPinches[0].x - slots[0].x, rawPinches[0].y - slots[0].y) +
                    Math.hypot(rawPinches[1].x - slots[1].x, rawPinches[1].y - slots[1].y);
      const dSwap = Math.hypot(rawPinches[0].x - slots[1].x, rawPinches[0].y - slots[1].y) +
                    Math.hypot(rawPinches[1].x - slots[0].x, rawPinches[1].y - slots[0].y);
      if (dSwap < dSame) { assigned[0] = rawPinches[1]; assigned[1] = rawPinches[0]; }
      else { assigned[0] = rawPinches[0]; assigned[1] = rawPinches[1]; }
    } else {
      for (const rp of rawPinches) {
        let best = -1, bestD = Infinity;
        for (let i = 0; i < 2; i++) {
          if (used[i]) continue;
          const d = slots[i].active ? Math.hypot(rp.x - slots[i].x, rp.y - slots[i].y) : 9999 + i;
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best !== -1) { used[best] = true; assigned[best] = rp; }
      }
    }

    for (let i = 0; i < 2; i++) {
      const s = slots[i];
      const rp = assigned[i];
      s.justPinched = false;

      if (rp) {
        s.active = true;
        s.lastSeen = now;
        s.x = s.fx.filter(rp.x, now);
        s.y = s.fy.filter(rp.y, now);

        const was = s.pinching;
        if (!was && rp.ratio < 0.39) {
          s.pinching = true;
          s.justPinched = true;
          s.pinchConsumed = false;
        } else if (was && rp.ratio > 0.55) {
          s.pinching = false;
          s.pinchConsumed = false;
          s.grabWin = null;
        }
      } else if (now - s.lastSeen > 170) {
        s.active = false;
        s.pinching = false;
        s.pinchConsumed = false;
        s.grabWin = null;
        s.hoverType = "none";
        s.fx.reset();
        s.fy.reset();
      }
    }
  }

  function processInteractions(now) {
    const wins = getWindows();
    const [h0, h1] = slots;

    // 1. Limpiar referencias a ventanas cerradas
    for (const s of slots) {
      if (s.grabWin && !wins.includes(s.grabWin)) s.grabWin = null;
    }
    if (twoHand.win && !wins.includes(twoHand.win)) twoHand.win = null;

    // 2. Detectar hover + clics aéreos en botones (prioridad sobre arrastre)
    const hits = slots.map((s) => (s.active ? getHitTargets(s.x, s.y) : null));

    for (let i = 0; i < 2; i++) {
      const s = slots[i];
      const hit = hits[i];
      if (!s.active || !hit) { s.hoverType = "none"; continue; }

      if (hit.closeBtn) s.hoverType = "close";
      else if (hit.btn) s.hoverType = "btn";
      else if (hit.winObj) s.hoverType = "win";
      else s.hoverType = "none";

      if (s.justPinched && !s.grabWin && (hit.closeBtn || hit.btn)) {
        // Evitar doble clic accidental en el propio botón de MANOS
        const targetBtn = hit.closeBtn || hit.btn;
        if (now - lastClickAt > 260 && targetBtn !== toggleBtn) {
          lastClickAt = now;
          targetBtn.click();
          s.pinchConsumed = true;
          ripples.push({
            x: s.x,
            y: s.y,
            r: 8,
            maxR: 38,
            alpha: 0.9,
            color: hit.closeBtn ? "248, 113, 113" : "56, 189, 248"
          });
        }
      }
    }

    // 3. Doble pinch sobre la MISMA ventana -> Escalar + Mover
    const bothPinching = h0.active && h1.active && h0.pinching && h1.pinching && !h0.pinchConsumed && !h1.pinchConsumed;
    let sharedWin = null;

    if (bothPinching) {
      if (twoHand.win) sharedWin = twoHand.win;
      else if (h0.grabWin && h1.grabWin === h0.grabWin) sharedWin = h0.grabWin;
      else if (h0.grabWin && !h1.grabWin && hits[1]?.winObj === h0.grabWin) sharedWin = h0.grabWin;
      else if (h1.grabWin && !h0.grabWin && hits[0]?.winObj === h1.grabWin) sharedWin = h1.grabWin;
      else if (!h0.grabWin && !h1.grabWin && hits[0]?.winObj && hits[0].winObj === hits[1]?.winObj) sharedWin = hits[0].winObj;
    }

    if (sharedWin) {
      const midX = (h0.x + h1.x) * 0.5;
      const midY = (h0.y + h1.y) * 0.5;
      const dist = Math.max(28, Math.hypot(h1.x - h0.x, h1.y - h0.y));

      if (twoHand.win !== sharedWin) {
        twoHand.win = sharedWin;
        h0.grabWin = sharedWin;
        h1.grabWin = sharedWin;
        focusWindow(sharedWin);
        twoHand.startDist = dist;
        twoHand.startW = sharedWin.w;
        twoHand.startH = sharedWin.h;
        twoHand.startMidX = midX;
        twoHand.startMidY = midY;
        twoHand.startYaw = sharedWin.yaw;
        twoHand.startPitch = sharedWin.pitch;
      }

      const scale = dist / twoHand.startDist;
      sharedWin.w = Math.max(190, Math.min(window.innerWidth * 0.92, twoHand.startW * scale));
      sharedWin.h = Math.max(130, Math.min(window.innerHeight * 0.74, twoHand.startH * scale));
      sharedWin.el.style.width = `${sharedWin.w}px`;
      sharedWin.el.style.height = `${sharedWin.h}px`;

      sharedWin.yaw = wrapDeg(twoHand.startYaw + (midX - twoHand.startMidX) / pxPerDeg);
      sharedWin.pitch = Math.max(-70, Math.min(70, twoHand.startPitch - (midY - twoHand.startMidY) / pxPerDeg));
      return;
    }

    if (twoHand.win) {
      twoHand.win = null;
      // Si una mano sigue pellizcando, continúa arrastrando sin salto
      for (const s of slots) {
        if (s.pinching && s.grabWin) {
          s.startX = s.x;
          s.startY = s.y;
          s.startYaw = s.grabWin.yaw;
          s.startPitch = s.grabWin.pitch;
        } else {
          s.grabWin = null;
        }
      }
    }

    // 4. Arrastre independiente por mano (hasta 2 ventanas a la vez)
    for (let i = 0; i < 2; i++) {
      const s = slots[i];
      const other = slots[1 - i];
      if (!s.active || !s.pinching || s.pinchConsumed) continue;

      if (!s.grabWin && s.justPinched) {
        const winObj = hits[i]?.winObj;
        if (winObj && winObj !== other.grabWin) {
          s.grabWin = winObj;
          focusWindow(winObj);
          s.startX = s.x;
          s.startY = s.y;
          s.startYaw = winObj.yaw;
          s.startPitch = winObj.pitch;
        }
      }

      if (s.grabWin) {
        s.grabWin.yaw = wrapDeg(s.startYaw + (s.x - s.startX) / pxPerDeg);
        s.grabWin.pitch = Math.max(-70, Math.min(70, s.startPitch - (s.y - s.startY) / pxPerDeg));
      }
    }
  }

  function drawOverlay() {
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Ondas de clic
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += (rp.maxR - rp.r) * 0.25;
      rp.alpha *= 0.84;
      ctx.strokeStyle = `rgba(${rp.color}, ${rp.alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
      if (rp.alpha < 0.03) ripples.splice(i, 1);
    }

    // Cursores de pellizco estilo VisionOS
    for (const s of slots) {
      if (!s.active) continue;
      const r = s.pinching ? 7 : 13;
      let fill = "rgba(255, 255, 255, 0.18)";
      let stroke = "rgba(255, 255, 255, 0.85)";

      if (s.hoverType === "close") {
        fill = "rgba(239, 68, 68, 0.85)";
        stroke = "#ffffff";
      } else if (s.pinching || s.grabWin) {
        fill = "rgba(56, 189, 248, 0.92)";
        stroke = "#ffffff";
      } else if (s.hoverType === "btn") {
        fill = "rgba(56, 189, 248, 0.35)";
        stroke = "#38bdf8";
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }

  function tick(now) {
    if (!enabled) return;

    if (landmarker && video.readyState >= 2) {
      // Safari iOS pausa el decodificador si display:none; lo mantenemos vivo con opacity:0
      if (video.style.display === "none") {
        video.style.display = "block";
        video.style.opacity = "0";
      }

      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const rect = getCoverRect(vw, vh, overlayCanvas.width, overlayCanvas.height);
        const res = landmarker.detectForVideo(getScaledFrame(vw, vh), now);
        updateSlots(res.landmarks || [], now, rect, getMirror());
      }
      processInteractions(now);
      drawOverlay();
    }

    rafId = requestAnimationFrame(tick);
  }

  async function setEnabled(next) {
    if (next === enabled) return;
    if (next) {
      if (!video.srcObject) {
        toggleBtn.textContent = "SIN CAM";
        return;
      }
      if (!landmarker) {
        if (loading) return;
        loading = true;
        toggleBtn.textContent = "CARGANDO...";
        try {
          const resolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
          );
          landmarker = await HandLandmarker.createFromOptions(resolver, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.35,
            minHandPresenceConfidence: 0.35,
            minTrackingConfidence: 0.35
          });
        } catch {
          loading = false;
          toggleBtn.textContent = "ERR MANOS";
          return;
        }
        loading = false;
      }

      enabled = true;
      resetAllSlots();
      lastVideoTime = -1;
      overlayCanvas.style.display = "block";
      toggleBtn.textContent = "MANOS: ON";
      toggleBtn.classList.add("active");
      rafId = requestAnimationFrame(tick);
    } else {
      enabled = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      resetAllSlots();
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCanvas.style.display = "none";
      if (video.style.opacity === "0") {
        video.style.opacity = "";
        video.style.display = "none";
      }
      toggleBtn.textContent = "MANOS: OFF";
      toggleBtn.classList.remove("active");
    }
  }

  toggleBtn.addEventListener("click", () => setEnabled(!enabled));
}

// =========================================================================
// MySpatialOS — Fase 3 v4: Pellizco 2D Estable + Anti-Rebote (2 frames)
// =========================================================================

import {
  FilesetResolver,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

class OneEuroFilter {
  constructor(minCutoff = 1.4, beta = 0.04, dCutoff = 1.0) {
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

// Punto medio calibrado en 2D: cierra al tocar, suelta al abrir ~1.5 cm, sin rebote
const PINCH_ENTER = 0.31;
const PINCH_RELEASE = 0.40;
const CONFIRM_FRAMES = 2;
const CLICK_COOLDOWN_MS = 360;

const HIT_OFFSETS = [
  [0, 0],
  [14, 0], [-14, 0], [0, 14], [0, -14],
  [10, 10], [-10, 10], [10, -10], [-10, -10]
];

function createSlot() {
  return {
    active: false,
    lastSeen: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    ratio: 1,
    fx: new OneEuroFilter(1.4, 0.04, 1.0),
    fy: new OneEuroFilter(1.4, 0.04, 1.0),

    pinching: false,
    justPinched: false,
    justReleased: false,
    enterStreak: 0,
    exitStreak: 0,
    lastClickAt: 0,

    mode: "none",
    grabWin: null,
    targetEl: null,
    scrollInfo: null,

    downX: 0,
    downY: 0,
    startYaw: 0,
    startPitch: 0,
    startW: 0,
    startH: 0,
    startScrollTop: 0,
    startScrollLeft: 0,
    scrollVx: 0,
    scrollVy: 0,

    hoverType: "none",
    hoverEl: null
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

  const slots = [createSlot(), createSlot()];
  const ripples = [];
  const inertia = [];
  const hoveredEls = new Set();

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

  function syncOverlaySize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
      overlayCanvas.width = w;
      overlayCanvas.height = h;
    }
  }
  window.addEventListener("resize", syncOverlaySize);
  window.visualViewport?.addEventListener("resize", syncOverlaySize);
  syncOverlaySize();

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

  function clearHoverClasses() {
    for (const el of hoveredEls) el.classList.remove("hand-hover");
    hoveredEls.clear();
  }

  function resetSlot(s) {
    s.active = false;
    s.ratio = 1;
    s.pinching = false;
    s.justPinched = false;
    s.justReleased = false;
    s.enterStreak = 0;
    s.exitStreak = 0;
    s.mode = "none";
    s.grabWin = null;
    s.targetEl = null;
    s.scrollInfo = null;
    s.hoverType = "none";
    s.hoverEl = null;
    s.fx.reset();
    s.fy.reset();
  }

  function resetAllSlots() {
    twoHand.win = null;
    clearHoverClasses();
    document.body.classList.remove("hand-dragging");
    for (const s of slots) resetSlot(s);
  }

  function findScrollableFromList(els) {
    for (const el of els) {
      if (!el || el === document.body || el === document.documentElement) continue;
      const st = getComputedStyle(el);
      const canY = (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 2;
      const canX = (st.overflowX === "auto" || st.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2;
      if (canY || canX) return { el, canX, canY };
    }
    return null;
  }

  function findWinFromEl(el, wins) {
    const sec = el?.closest?.(".spWin");
    if (!sec) return null;
    return wins.find((w) => w.el === sec) || null;
  }

  function getHitTargets(x, y) {
    const wins = getWindows();
    const centerEls = document.elementsFromPoint(x, y);

    let closeBtn = null;
    let dragHandle = null;
    let resizeHandle = null;
    let slider = null;
    let interactive = null;
    let winObj = null;

    for (const el of centerEls) {
      if (!winObj) winObj = findWinFromEl(el, wins);
      if (!closeBtn && el.classList?.contains("winCloseBtn")) closeBtn = el;
      if (!resizeHandle && el.classList?.contains("winResizeHandle")) resizeHandle = el;
      if (!dragHandle && (el.classList?.contains("winDragPill") || el.classList?.contains("winHeader"))) {
        dragHandle = el;
      }
      if (!slider && el.tagName === "INPUT" && el.type === "range") slider = el;
      if (!interactive) {
        const b = el.closest?.("button, input, select, textarea");
        if (b && !b.classList.contains("winCloseBtn") && !(b.tagName === "INPUT" && b.type === "range")) {
          interactive = b;
        }
      }
    }

    if (!closeBtn && !resizeHandle && !dragHandle && !slider && !interactive) {
      for (let k = 1; k < HIT_OFFSETS.length; k++) {
        const top = document.elementFromPoint(x + HIT_OFFSETS[k][0], y + HIT_OFFSETS[k][1]);
        if (!top) continue;
        if (!closeBtn && top.classList?.contains("winCloseBtn")) {
          closeBtn = top;
          if (!winObj) winObj = findWinFromEl(top, wins);
          break;
        }
        if (!resizeHandle && top.classList?.contains("winResizeHandle")) {
          resizeHandle = top;
          if (!winObj) winObj = findWinFromEl(top, wins);
          break;
        }
        if (!dragHandle && (top.classList?.contains("winDragPill") || top.classList?.contains("winHeader"))) {
          dragHandle = top;
          if (!winObj) winObj = findWinFromEl(top, wins);
          break;
        }
        if (!slider && top.tagName === "INPUT" && top.type === "range") {
          slider = top;
          break;
        }
        if (!interactive) {
          const b = top.closest?.("button, input, select, textarea");
          if (b && !b.classList.contains("winCloseBtn") && !(b.tagName === "INPUT" && b.type === "range")) {
            interactive = b;
            break;
          }
        }
      }
    }

    const scrollInfo = findScrollableFromList(centerEls);
    return { closeBtn, dragHandle, resizeHandle, slider, interactive, scrollInfo, winObj };
  }

  function updateSliderByX(sliderEl, x) {
    const r = sliderEl.getBoundingClientRect();
    if (r.width < 4) return;
    const pct = Math.max(0, Math.min(1, (x - r.left) / r.width));
    const min = parseFloat(sliderEl.min || "0");
    const max = parseFloat(sliderEl.max || "100");
    const step = parseFloat(sliderEl.step || "1");
    const val = Math.round((min + pct * (max - min)) / step) * step;
    if (String(val) !== sliderEl.value) {
      sliderEl.value = String(val);
      sliderEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function triggerElementClick(slot, el, x, y, now, isClose = false) {
    if (!el || el === toggleBtn) return false;
    if (now - slot.lastClickAt < CLICK_COOLDOWN_MS) return false;
    slot.lastClickAt = now;

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      el.focus();
      el.click();
    } else {
      el.click();
    }

    ripples.push({
      x, y, r: 7, maxR: 36, alpha: 0.92,
      color: isClose ? "248, 113, 113" : "56, 189, 248"
    });
    return true;
  }

  function updateSlots(rawHands, now, rect, mirror) {
    const rawPinches = rawHands.map((h) => {
      const p0 = mapPoint(h[0], rect, mirror);
      const p4 = mapPoint(h[4], rect, mirror);
      const p5 = mapPoint(h[5], rect, mirror);
      const p8 = mapPoint(h[8], rect, mirror);
      const p9 = mapPoint(h[9], rect, mirror);
      const p17 = mapPoint(h[17], rect, mirror);

      // Distancia 2D normalizada: sin el error Z monocular que bloqueaba pellizcos
      const scale = Math.max(
        Math.hypot(p9.x - p0.x, p9.y - p0.y),
        Math.hypot(p5.x - p17.x, p5.y - p17.y) * 1.15,
        26
      );
      const ratio = Math.hypot(p4.x - p8.x, p4.y - p8.y) / scale;

      return {
        x: p8.x * 0.72 + p4.x * 0.28,
        y: p8.y * 0.72 + p4.y * 0.28,
        ratio
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

      if (rp) {
        const wasActive = s.active;
        s.active = true;
        s.lastSeen = now;
        s.prevX = s.x;
        s.prevY = s.y;
        s.ratio = wasActive ? (s.ratio * 0.35 + rp.ratio * 0.65) : rp.ratio;

        const filtX = s.fx.filter(rp.x, now);
        const filtY = s.fy.filter(rp.y, now);

        const closingOnBtn = !s.pinching && s.ratio < 0.44 && (s.hoverType === "btn" || s.hoverType === "close");
        if (closingOnBtn && s.prevX) {
          s.x = s.prevX + (filtX - s.prevX) * 0.22;
          s.y = s.prevY + (filtY - s.prevY) * 0.22;
        } else {
          s.x = filtX;
          s.y = filtY;
        }

        // Confirmación de 2 frames seguidos para eliminar rebotes y dobles clics
        if (!s.pinching) {
          s.exitStreak = 0;
          if (s.ratio < PINCH_ENTER) {
            s.enterStreak++;
            if (s.enterStreak >= CONFIRM_FRAMES) {
              s.pinching = true;
              s.justPinched = true;
              s.enterStreak = 0;
            }
          } else {
            s.enterStreak = 0;
          }
        } else {
          s.enterStreak = 0;
          if (s.ratio > PINCH_RELEASE) {
            s.exitStreak++;
            if (s.exitStreak >= CONFIRM_FRAMES) {
              s.pinching = false;
              s.justReleased = true;
              s.exitStreak = 0;
            }
          } else {
            s.exitStreak = 0;
          }
        }
      } else if (now - s.lastSeen > 180) {
        // Cancelar limpio al perder la mano (nunca disparar clic fantasma)
        resetSlot(s);
      }
    }
  }

  function processInteractions(now) {
    const wins = getWindows();
    const [h0, h1] = slots;

    for (const s of slots) {
      if (s.grabWin && !wins.includes(s.grabWin)) {
        s.grabWin = null;
        s.mode = "none";
      }
    }
    if (twoHand.win && !wins.includes(twoHand.win)) twoHand.win = null;

    const hits = slots.map((s) => (s.active ? getHitTargets(s.x, s.y) : null));
    const nextHovered = new Set();

    for (let i = 0; i < 2; i++) {
      const s = slots[i];
      const hit = hits[i];
      if (!s.active || !hit) { s.hoverType = "none"; s.hoverEl = null; continue; }

      if (s.mode === "none") {
        if (hit.closeBtn) { s.hoverType = "close"; s.hoverEl = hit.closeBtn; }
        else if (hit.slider) { s.hoverType = "slider"; s.hoverEl = hit.slider; }
        else if (hit.resizeHandle) { s.hoverType = "handle"; s.hoverEl = hit.resizeHandle; }
        else if (hit.dragHandle) { s.hoverType = "handle"; s.hoverEl = hit.dragHandle; }
        else if (hit.interactive) { s.hoverType = "btn"; s.hoverEl = hit.interactive; }
        else if (hit.scrollInfo) { s.hoverType = "scroll"; s.hoverEl = null; }
        else { s.hoverType = "none"; s.hoverEl = null; }
      }
      if (s.hoverEl && s.hoverEl !== toggleBtn) nextHovered.add(s.hoverEl);
    }

    for (const el of hoveredEls) {
      if (!nextHovered.has(el)) { el.classList.remove("hand-hover"); hoveredEls.delete(el); }
    }
    for (const el of nextHovered) {
      if (!hoveredEls.has(el)) { el.classList.add("hand-hover"); hoveredEls.add(el); }
    }

    // Doble pinch en la misma ventana -> Escalar + Mover
    const busyTwoHand =
      h0.active && h1.active && h0.pinching && h1.pinching &&
      h0.mode !== "slider" && h1.mode !== "slider" &&
      h0.mode !== "scroll" && h1.mode !== "scroll";

    let sharedWin = null;
    if (busyTwoHand) {
      const w0 = h0.grabWin || hits[0]?.winObj;
      const w1 = h1.grabWin || hits[1]?.winObj;
      if (twoHand.win) sharedWin = twoHand.win;
      else if (w0 && w1 && w0 === w1) sharedWin = w0;
    }

    if (sharedWin) {
      const midX = (h0.x + h1.x) * 0.5;
      const midY = (h0.y + h1.y) * 0.5;
      const dist = Math.max(28, Math.hypot(h1.x - h0.x, h1.y - h0.y));

      if (twoHand.win !== sharedWin) {
        twoHand.win = sharedWin;
        h0.grabWin = sharedWin; h1.grabWin = sharedWin;
        h0.mode = "dragWin"; h1.mode = "dragWin";
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
      sharedWin.w = Math.max(210, Math.min(window.innerWidth * 0.94, twoHand.startW * scale));
      sharedWin.h = Math.max(150, Math.min(window.innerHeight * 0.76, twoHand.startH * scale));
      sharedWin.el.style.width = `${sharedWin.w}px`;
      sharedWin.el.style.height = `${sharedWin.h}px`;

      sharedWin.yaw = wrapDeg(twoHand.startYaw + (midX - twoHand.startMidX) / pxPerDeg);
      sharedWin.pitch = Math.max(-70, Math.min(70, twoHand.startPitch - (midY - twoHand.startMidY) / pxPerDeg));
      document.body.classList.add("hand-dragging");
      h0.justPinched = false; h1.justPinched = false;
      h0.justReleased = false; h1.justReleased = false;
      return;
    }

    if (twoHand.win) {
      twoHand.win = null;
      for (const s of slots) {
        if (s.pinching && s.grabWin) {
          s.mode = "dragWin";
          s.downX = s.x; s.downY = s.y;
          s.startYaw = s.grabWin.yaw; s.startPitch = s.grabWin.pitch;
        } else {
          s.mode = "none"; s.grabWin = null;
        }
      }
    }

    let anyDragging = false;

    for (let i = 0; i < 2; i++) {
      const s = slots[i];
      const other = slots[1 - i];
      const hit = hits[i];
      if (!s.active && !s.justReleased) continue;

      if (s.justPinched && hit) {
        s.downX = s.x;
        s.downY = s.y;
        s.scrollVx = 0;
        s.scrollVy = 0;

        if (hit.winObj) focusWindow(hit.winObj);

        if (hit.closeBtn) {
          triggerElementClick(s, hit.closeBtn, s.x, s.y, now, true);
          s.mode = "done";
        } else if (hit.slider) {
          s.mode = "slider";
          s.targetEl = hit.slider;
          updateSliderByX(hit.slider, s.x);
        } else if (hit.resizeHandle && hit.winObj && hit.winObj !== other.grabWin) {
          s.mode = "resizeWin";
          s.grabWin = hit.winObj;
          s.startW = hit.winObj.w;
          s.startH = hit.winObj.h;
        } else if (hit.dragHandle && hit.winObj && hit.winObj !== other.grabWin) {
          s.mode = "dragWin";
          s.grabWin = hit.winObj;
          s.startYaw = hit.winObj.yaw;
          s.startPitch = hit.winObj.pitch;
        } else if (hit.interactive && !hit.scrollInfo) {
          triggerElementClick(s, hit.interactive, s.x, s.y, now, false);
          s.mode = "done";
        } else if (hit.scrollInfo || hit.interactive) {
          s.mode = "pressOrScroll";
          s.targetEl = hit.interactive || null;
          s.scrollInfo = hit.scrollInfo || null;
          if (hit.scrollInfo) {
            s.startScrollTop = hit.scrollInfo.el.scrollTop;
            s.startScrollLeft = hit.scrollInfo.el.scrollLeft;
          }
        }
      }

      if (s.pinching) {
        const dx = s.x - s.downX;
        const dy = s.y - s.downY;

        if (s.mode === "dragWin" && s.grabWin) {
          s.grabWin.yaw = wrapDeg(s.startYaw + dx / pxPerDeg);
          s.grabWin.pitch = Math.max(-70, Math.min(70, s.startPitch - dy / pxPerDeg));
          anyDragging = true;
        } else if (s.mode === "resizeWin" && s.grabWin) {
          s.grabWin.w = Math.max(210, Math.min(window.innerWidth * 0.94, s.startW + dx));
          s.grabWin.h = Math.max(150, Math.min(window.innerHeight * 0.76, s.startH + dy));
          s.grabWin.el.style.width = `${s.grabWin.w}px`;
          s.grabWin.el.style.height = `${s.grabWin.h}px`;
          anyDragging = true;
        } else if (s.mode === "slider" && s.targetEl) {
          updateSliderByX(s.targetEl, s.x);
          anyDragging = true;
        } else if (s.mode === "pressOrScroll") {
          if (s.scrollInfo && Math.hypot(dx, dy) > 18) {
            s.mode = "scroll";
            s.targetEl = null;
            s.downX = s.x;
            s.downY = s.y;
            s.startScrollTop = s.scrollInfo.el.scrollTop;
            s.startScrollLeft = s.scrollInfo.el.scrollLeft;
          }
        } else if (s.mode === "scroll" && s.scrollInfo) {
          const { el, canX, canY } = s.scrollInfo;
          const prevTop = el.scrollTop;
          const prevLeft = el.scrollLeft;
          if (canY) el.scrollTop = s.startScrollTop - (s.y - s.downY) * 1.45;
          if (canX) el.scrollLeft = s.startScrollLeft - (s.x - s.downX) * 1.45;
          s.scrollVy = el.scrollTop - prevTop;
          s.scrollVx = el.scrollLeft - prevLeft;
          anyDragging = true;
        }
      }

      if (s.justReleased) {
        if (s.mode === "pressOrScroll" && s.targetEl) {
          triggerElementClick(s, s.targetEl, s.x, s.y, now, false);
        } else if (s.mode === "scroll" && s.scrollInfo) {
          if (Math.hypot(s.scrollVx, s.scrollVy) > 1.2) {
            inertia.push({
              el: s.scrollInfo.el,
              vx: s.scrollInfo.canX ? s.scrollVx : 0,
              vy: s.scrollInfo.canY ? s.scrollVy : 0
            });
          }
        }
        s.mode = "none";
        s.grabWin = null;
        s.targetEl = null;
        s.scrollInfo = null;
      }

      s.justPinched = false;
      s.justReleased = false;
    }

    document.body.classList.toggle("hand-dragging", anyDragging);
  }

  function stepInertia() {
    for (let i = inertia.length - 1; i >= 0; i--) {
      const it = inertia[i];
      it.el.scrollLeft += it.vx;
      it.el.scrollTop += it.vy;
      it.vx *= 0.9;
      it.vy *= 0.9;
      if (Math.hypot(it.vx, it.vy) < 0.35) inertia.splice(i, 1);
    }
  }

  function drawOverlay() {
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

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

    for (const s of slots) {
      if (!s.active) continue;

      const pinchProg = Math.max(0, Math.min(1, (0.58 - s.ratio) / (0.58 - PINCH_ENTER)));
      const outerR = s.pinching ? 6.5 : 17 - pinchProg * 8.5;

      let fill = "rgba(255, 255, 255, 0.16)";
      let stroke = "rgba(255, 255, 255, 0.85)";

      if (s.hoverType === "close") {
        fill = "rgba(239, 68, 68, 0.85)";
        stroke = "#ffffff";
      } else if (s.mode === "scroll") {
        fill = "rgba(168, 85, 247, 0.88)";
        stroke = "#ffffff";
      } else if (s.pinching || s.grabWin) {
        fill = "rgba(56, 189, 248, 0.94)";
        stroke = "#ffffff";
      } else if (s.hoverType === "btn" || s.hoverType === "handle" || s.hoverType === "slider") {
        fill = "rgba(56, 189, 248, 0.36)";
        stroke = "#38bdf8";
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, outerR, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = s.pinching ? 2.2 : 1.6;
      ctx.stroke();

      if (!s.pinching) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
    }
  }

  function tick(now) {
    if (!enabled) return;

    syncOverlaySize();

    if (landmarker && video.readyState >= 2 && video.videoWidth > 0) {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const rect = getCoverRect(vw, vh, overlayCanvas.width, overlayCanvas.height);
        const res = landmarker.detectForVideo(getScaledFrame(vw, vh), now);
        updateSlots(res.landmarks || [], now, rect, getMirror());
        processInteractions(now);
      }

      stepInertia();
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
      toggleBtn.textContent = "MANOS: OFF";
      toggleBtn.classList.remove("active");
    }
  }

  toggleBtn.addEventListener("click", () => setEnabled(!enabled));
}

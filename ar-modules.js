// =========================================================================
// MySpatialOS — Fase 4 v2: Katana Holográfica 2.5D + Oclusión Real de Mano
// + Rebote de Luz + Gojo + Hologramas (comparte MediaPipe de hands.js)
// =========================================================================

class OneEuroFilter {
  constructor(minCutoff = 2.4, beta = 0.06, dCutoff = 1.0) {
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

const KATANA_SKINS = [
  {
    name: "HOLO",
    isHolo: true,
    glowRGB: "56, 189, 248",
    coreRGB: "224, 247, 255",
    diamondGlow: "rgba(254, 243, 199, 0.88)",
    itoFill: "rgba(12, 24, 38, 0.62)",
    itoEdge: "rgba(125, 211, 252, 0.92)",
    tsubaRim: "#fef08a",
    tsubaMain: "#ca8a04",
    tsubaDark: "#713f12",
    habakiTop: "#fef08a", habakiMid: "#eab308", habakiBot: "#854d0e",
    sayaTop: "#1e3a5f", sayaMid: "#0c1929", sayaBot: "#040a12", sageo: "#38bdf8",
    fittings: "#0f172a", fittingsTrim: "#7dd3fc",
    trail: "125, 211, 252"
  },
  {
    name: "ACERO",
    isHolo: false,
    glowRGB: "200, 225, 255",
    spineTop: "#64748b", spineMid: "#94a3b8", spineDark: "#475569",
    edgeLight: "#f8fafc", edgeMid: "#cbd5e1", edgeDark: "#94a3b8",
    hamon: "rgba(255, 255, 255, 0.85)", bohi: "rgba(30, 41, 59, 0.42)",
    habakiTop: "#facc15", habakiMid: "#ca8a04", habakiBot: "#854d0e",
    tsubaMain: "#292524", tsubaRim: "#d4af37", tsubaDark: "#1c1917",
    samegawa: "#ebe5d9", ito: "#171717", itoHi: "#323236",
    fittings: "#1c1917", fittingsTrim: "#d4af37",
    sayaTop: "#1f242c", sayaMid: "#0c0e12", sayaBot: "#040507", sageo: "#27272a",
    trail: "226, 238, 255"
  },
  {
    name: "BLANCA",
    isHolo: false,
    glowRGB: "255, 255, 255",
    spineTop: "#cbd5e1", spineMid: "#f1f5f9", spineDark: "#94a3b8",
    edgeLight: "#ffffff", edgeMid: "#e2e8f0", edgeDark: "#cbd5e1",
    hamon: "rgba(255, 255, 255, 0.95)", bohi: "rgba(100, 116, 139, 0.32)",
    habakiTop: "#f8fafc", habakiMid: "#cbd5e1", habakiBot: "#64748b",
    tsubaMain: "#e2e8f0", tsubaRim: "#ffffff", tsubaDark: "#64748b",
    samegawa: "#cbd5e1", ito: "#f8fafc", itoHi: "#ffffff",
    fittings: "#e2e8f0", fittingsTrim: "#94a3b8",
    sayaTop: "#ffffff", sayaMid: "#e2e8f0", sayaBot: "#94a3b8", sageo: "#cbd5e1",
    trail: "255, 255, 255"
  },
  {
    name: "OBSIDIANA",
    isHolo: true,
    glowRGB: "244, 63, 94",
    coreRGB: "255, 228, 230",
    diamondGlow: "rgba(253, 164, 175, 0.9)",
    itoFill: "rgba(28, 8, 14, 0.72)",
    itoEdge: "rgba(251, 113, 133, 0.95)",
    tsubaRim: "#fb7185",
    tsubaMain: "#881337",
    tsubaDark: "#2d0611",
    habakiTop: "#fda4af", habakiMid: "#e11d48", habakiBot: "#4c0519",
    sayaTop: "#27272a", sayaMid: "#09090b", sayaBot: "#000000", sageo: "#be123c",
    fittings: "#09090b", fittingsTrim: "#fb7185",
    trail: "251, 113, 133"
  }
];

const CUBE_VERTS = [
  [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
  [-1,-1, 1], [1,-1, 1], [1,1, 1], [-1,1, 1]
];
const CUBE_EDGES = [
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7]
];

const GOJO_PARTICLES = Array.from({ length: 64 }, () => ({
  angle: Math.random() * Math.PI * 2,
  r: 0.15 + Math.random() * 1.5
}));

const HOLO_SPARKS = Array.from({ length: 24 }, () => ({
  t: Math.random(),
  offset: (Math.random() - 0.5) * 24,
  drift: (Math.random() - 0.5) * 18,
  speed: 0.25 + Math.random() * 0.55,
  size: 0.9 + Math.random() * 1.9,
  phase: Math.random() * Math.PI * 2
}));

function shortestAngleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-4) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function isPalmOpen(hand) {
  const wrist = hand[0];
  let extended = 0;
  for (const [tip, pip] of [[8,6],[12,10],[16,14],[20,18]]) {
    if (Math.hypot(hand[tip].x - wrist.x, hand[tip].y - wrist.y) >
        Math.hypot(hand[pip].x - wrist.x, hand[pip].y - wrist.y) * 1.18) {
      extended++;
    }
  }
  return extended >= 3;
}

function isIndexPointing(hand) {
  const wrist = hand[0];
  if (Math.hypot(hand[8].x - wrist.x, hand[8].y - wrist.y) <
      Math.hypot(hand[6].x - wrist.x, hand[6].y - wrist.y) * 1.15) return false;
  let folded = 0;
  for (const [tip, pip] of [[12,10],[16,14],[20,18]]) {
    if (Math.hypot(hand[tip].x - wrist.x, hand[tip].y - wrist.y) <
        Math.hypot(hand[pip].x - wrist.x, hand[pip].y - wrist.y) * 1.15) folded++;
  }
  return folded >= 2;
}

function getPalmMetrics(hand) {
  const cx = (hand[0].x + hand[5].x + hand[9].x + hand[13].x + hand[17].x) * 0.2;
  const cy = (hand[0].y + hand[5].y + hand[9].y + hand[13].y + hand[17].y) * 0.2;
  const scale = Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y);
  const angle = Math.atan2(hand[9].y - hand[0].y, hand[9].x - hand[0].x);
  return { cx, cy, scale, angle };
}

function getIndexTipOrigin(hand) {
  const tip = hand[8], pip = hand[6];
  const scale = Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y);
  return { x: tip.x + (tip.x - pip.x) * 0.45, y: tip.y + (tip.y - pip.y) * 0.45, scale };
}

function createKatanaSlot() {
  return {
    active: false, lastSeen: 0, x: 0, y: 0, scale: 80, fistW: 70, tilt: 0.2,
    rawHand: null,
    fx: new OneEuroFilter(2.4, 0.06, 1.0),
    fy: new OneEuroFilter(2.4, 0.06, 1.0),
    fAngle: new OneEuroFilter(2.2, 0.05, 1.0),
    hasAngle: false, unwrappedAngle: 0, angle: 0,
    isFist: false, justFisted: false, isOpen: false,
    fistSince: 0, openSince: 0,
    velHist: [], peakUpVy: 0, peakUpTime: 0
  };
}

export function createARModules({ APPS, createWindow, ensureHandsEnabled, bgCanvas }) {
  let mode = "off"; // "off" | "katana" | "gojo" | "holo" | "plasma" | "hud"
  let statusText = "Selecciona un módulo AR";
  let statusListener = null;
  let lastNow = performance.now();

  const camCanvas = bgCanvas || document.getElementById("bgCanvas");

  // Offscreen canvas compacto para recortar los dedos del vídeo a 60 FPS sin lag
  const occCanvas = document.createElement("canvas");
  occCanvas.width = 224;
  occCanvas.height = 224;
  const occCtx = occCanvas.getContext("2d");

  const palmOpenAnim = [0, 0];

  const katana = {
    state: "IDLE",
    hands: [createKatanaSlot(), createKatanaSlot()],
    handleSlot: -1, sheathSlot: -1, heldSlot: -1, heldSince: 0,
    x: 0, y: 0, angle: 0, angVel: 0, vx: 0, vy: 0, vAngle: 0,
    fistW: 72,
    handleLen: 168,
    tsubaOffset: 44,
    fullBladeLen: 310,
    tilt: 0.25,
    soriSign: -1,
    materialize: 0,
    drawDeadzone: 60, drawProgress: 0,
    releaseTime: 0, releasedBySlot: -1,
    transferCooldownUntil: 0, drawCooldownUntil: 0,
    skinIndex: 0,
    reverseGrip: false,
    summonMode: "fist", // "fist" (1 puño) | "two" (2 puños)
    occlusion: true,
    slowMo: true,
    trail: [], ripples: []
  };

  const gojo = {
    state: "NORMAL", stateStart: 0, blueAnim: 0, redAnim: 0,
    mergeX: 0, mergeY: 0, mergeScale: 80,
    purpleX: 0, purpleY: 0, prevPurpleX: 0, prevPurpleY: 0,
    launchVx: 0, launchVy: 0, flash: 0
  };

  function setStatus(txt) {
    if (statusText !== txt) {
      statusText = txt;
      if (statusListener) statusListener(txt);
    }
  }

  function resetKatana() {
    katana.state = "IDLE";
    katana.handleSlot = -1; katana.sheathSlot = -1; katana.heldSlot = -1;
    katana.drawProgress = 0; katana.angVel = 0; katana.materialize = 0;
    katana.vx = 0; katana.vy = 0; katana.vAngle = 0;
    katana.trail = [];
    katana.drawCooldownUntil = performance.now() + 450;
  }

  function resetGojo() {
    gojo.state = "NORMAL";
    gojo.blueAnim = 0;
    gojo.redAnim = 0;
    gojo.flash = 0;
  }

  function setMode(next) {
    mode = next;
    resetKatana();
    resetGojo();
    palmOpenAnim[0] = 0;
    palmOpenAnim[1] = 0;

    if (mode !== "off") ensureHandsEnabled();
    const HINTS = {
      off: "Módulos AR desactivados",
      katana: katana.summonMode === "fist"
        ? "Cierra un puño para empuñar la katana · Abre palma para guardar"
        : "Junta 2 puños y sepáralos para desenvainar",
      gojo: "Índice izq: Azul · Índice der: Rojo · Júntalos: Morado",
      holo: "Abre la palma para proyectar el Cubo 3D",
      plasma: "Abre la palma para invocar Plasma",
      hud: "Abre la palma para ver el HUD orbital"
    };
    setStatus(HINTS[mode] || "Listo");
  }

  function drawLightning(ctx, x1, y1, x2, y2, color, width, segments = 6, spread = 16) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      ctx.lineTo(
        x1 + (x2 - x1) * t + (Math.random() - 0.5) * spread,
        y1 + (y2 - y1) * t + (Math.random() - 0.5) * spread
      );
    }
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // =========================================================================
  // 1. MÓDULO KATANA HOLOGRÁFICA 2.5D + OCLUSIÓN DE PUÑO + REBOTE DE LUZ
  // =========================================================================
  function analyzeKatanaHand(hand, wasFist) {
    const wrist = hand[0];
    const palmLen = Math.hypot(hand[9].x - wrist.x, hand[9].y - wrist.y);
    const knuckleW = Math.hypot(hand[5].x - hand[17].x, hand[5].y - hand[17].y);
    const scale = Math.max(palmLen, knuckleW, 20);
    const fistW = Math.max(knuckleW, palmLen * 0.62, 34);

    // Centro del agarre desplazado entre nudillos y falanges cerradas
    const kx = (hand[5].x + hand[9].x + hand[13].x + hand[17].x) * 0.25;
    const ky = (hand[5].y + hand[9].y + hand[13].y + hand[17].y) * 0.25;
    const px = (hand[6].x + hand[10].x + hand[14].x + hand[18].x) * 0.25;
    const py = (hand[6].y + hand[10].y + hand[14].y + hand[18].y) * 0.25;
    const cx = kx * 0.52 + px * 0.48;
    const cy = ky * 0.52 + py * 0.48;

    const hasValidAxis = knuckleW > scale * 0.25;
    const rawAngle = hasValidAxis
      ? (katana.reverseGrip
          ? Math.atan2(hand[17].y - hand[5].y, hand[17].x - hand[5].x)
          : Math.atan2(hand[5].y - hand[17].y, hand[5].x - hand[17].x))
      : null;

    // Inclinación Z para perspectiva 2.5D de la tsuba
    const dz = (hand[5].z || 0) - (hand[17].z || 0);
    const tilt = Math.max(-0.7, Math.min(0.7, dz * 3.8));

    let extended = 0, curlSum = 0;
    for (const [tip, pip] of [[8,6],[12,10],[16,14],[20,18]]) {
      const dTipW = Math.hypot(hand[tip].x - wrist.x, hand[tip].y - wrist.y);
      const dPipW = Math.hypot(hand[pip].x - wrist.x, hand[pip].y - wrist.y);
      const dPalm = Math.hypot(hand[tip].x - kx, hand[tip].y - ky) / scale;
      curlSum += dPalm;
      if (dTipW > dPipW * 1.14 && dPalm > 1.04) extended++;
    }
    const avgCurl = curlSum * 0.25;
    // Histéresis en puño para que la oclusión nunca parpadee
    const isFist = wasFist
      ? (extended <= 1 && avgCurl < 1.24)
      : (extended <= 1 && avgCurl < 1.12);
    const isOpen = extended >= 3;

    return { x: cx, y: cy, scale, fistW, rawAngle, tilt, isFist, isOpen, rawHand: hand };
  }

  function getSlotVel(slot) {
    if (slot.velHist.length < 2) return { vx: 0, vy: 0 };
    const a = slot.velHist[0], b = slot.velHist[slot.velHist.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }

  function updateKatanaHands(mappedHands, now) {
    const slots = katana.hands;
    const raw = mappedHands.map((h, i) => analyzeKatanaHand(h, slots[i]?.isFist || false));
    const used = [false, false], assigned = [null, null];

    if (raw.length === 2 && slots[0].active && slots[1].active) {
      const dSame = Math.hypot(raw[0].x - slots[0].x, raw[0].y - slots[0].y) + Math.hypot(raw[1].x - slots[1].x, raw[1].y - slots[1].y);
      const dSwap = Math.hypot(raw[0].x - slots[1].x, raw[0].y - slots[1].y) + Math.hypot(raw[1].x - slots[0].x, raw[1].y - slots[0].y);
      if (dSwap < dSame) { assigned[0] = raw[1]; assigned[1] = raw[0]; }
      else { assigned[0] = raw[0]; assigned[1] = raw[1]; }
    } else {
      for (const r of raw) {
        let best = -1, bestD = Infinity;
        for (let s = 0; s < 2; s++) {
          if (used[s]) continue;
          const d = slots[s].active ? Math.hypot(r.x - slots[s].x, r.y - slots[s].y) : 9999 + s;
          if (d < bestD) { bestD = d; best = s; }
        }
        if (best !== -1) { used[best] = true; assigned[best] = r; }
      }
    }

    for (let s = 0; s < 2; s++) {
      const slot = slots[s], r = assigned[s];
      slot.justFisted = false;

      if (r) {
        slot.active = true; slot.lastSeen = now;
        slot.x = slot.fx.filter(r.x, now); slot.y = slot.fy.filter(r.y, now);
        slot.scale = r.scale;
        slot.fistW = slot.fistW ? (slot.fistW * 0.72 + r.fistW * 0.28) : r.fistW;
        slot.tilt = slot.tilt * 0.8 + r.tilt * 0.2;
        slot.rawHand = r.rawHand;

        if (!slot.isFist && r.isFist) {
          slot.justFisted = true;
          slot.fistSince = now;
        }
        if (!r.isFist) slot.fistSince = 0;
        slot.isFist = r.isFist;

        if (!slot.isOpen && r.isOpen) slot.openSince = now;
        if (!r.isOpen) slot.openSince = 0;
        slot.isOpen = r.isOpen;

        if (r.rawAngle !== null) {
          if (!slot.hasAngle) {
            slot.unwrappedAngle = r.rawAngle; slot.angle = r.rawAngle;
            slot.fAngle.reset(); slot.fAngle.filter(r.rawAngle, now); slot.hasAngle = true;
          } else {
            const delta = shortestAngleDiff(slot.unwrappedAngle, r.rawAngle);
            if (Math.abs(delta) < 2.2) {
              slot.unwrappedAngle += delta;
              slot.angle = slot.fAngle.filter(slot.unwrappedAngle, now);
            }
          }
        }

        slot.velHist.push({ t: now, x: slot.x, y: slot.y });
        while (slot.velHist.length > 0 && now - slot.velHist[0].t > 95) slot.velHist.shift();

        const vel = getSlotVel(slot);
        if (vel.vy < slot.peakUpVy || now - slot.peakUpTime > 150) {
          if (vel.vy < -180) { slot.peakUpVy = vel.vy; slot.peakUpTime = now; }
          else if (now - slot.peakUpTime > 150) slot.peakUpVy = 0;
        }
      } else if (now - slot.lastSeen > 300) {
        slot.active = false; slot.isFist = false; slot.isOpen = false;
        slot.fistSince = 0; slot.openSince = 0; slot.rawHand = null;
        slot.hasAngle = false; slot.velHist = []; slot.peakUpVy = 0;
        slot.fx.reset(); slot.fy.reset(); slot.fAngle.reset();
      }
    }
  }

  function updateKatanaDimensions(fistW, cw, ch, immediate = false) {
    const targetFist = Math.max(46, Math.min(115, fistW));
    const targetHandle = targetFist * 2.38;
    const targetTsuba = targetFist * 0.60;
    const targetBlade = Math.max(220, Math.min(Math.max(cw, ch) * 0.56, targetFist * 4.25));
    const k = immediate ? 1 : 0.16;
    katana.fistW += (targetFist - katana.fistW) * k;
    katana.handleLen += (targetHandle - katana.handleLen) * k;
    katana.tsubaOffset += (targetTsuba - katana.tsubaOffset) * k;
    katana.fullBladeLen += (targetBlade - katana.fullBladeLen) * k;
  }

  function computeSoriSign(hand, angle) {
    if (!hand) return -1;
    const cx = (hand[5].x + hand[17].x) * 0.5;
    const cy = (hand[5].y + hand[17].y) * 0.5;
    const wx = hand[0].x - cx;
    const wy = hand[0].y - cy;
    const bx = Math.cos(angle);
    const by = Math.sin(angle);
    const cross = bx * wy - by * wx;
    return cross >= 0 ? -1 : 1;
  }

  function drawSlashTrail(ctx, now) {
    const skin = KATANA_SKINS[katana.skinIndex];
    const tsubaLocal = katana.tsubaOffset;
    const cos = Math.cos(katana.angle), sin = Math.sin(katana.angle);
    const curBladeLen = katana.fullBladeLen * katana.materialize;
    const basePt = { x: katana.x + tsubaLocal * cos, y: katana.y + tsubaLocal * sin };
    const lx = tsubaLocal + curBladeLen;
    const ly = katana.soriSign * curBladeLen * 0.068;
    const tipPt = { x: katana.x + lx * cos - ly * sin, y: katana.y + lx * sin + ly * cos };

    if ((katana.state === "HELD" || katana.state === "AIRBORNE") && katana.materialize > 0.7) {
      const prev = katana.trail[katana.trail.length - 1];
      const spd = prev ? Math.hypot(tipPt.x - prev.tx, tipPt.y - prev.ty) : 0;
      katana.trail.push({ bx: basePt.x, by: basePt.y, tx: tipPt.x, ty: tipPt.y, spd, t: now });
    }
    while (katana.trail.length > 0 && (now - katana.trail[0].t > 130 || katana.trail.length > 10)) katana.trail.shift();
    if (katana.trail.length < 3) return;

    let maxSpd = 0;
    for (const p of katana.trail) if (p.spd > maxSpd) maxSpd = p.spd;
    if (maxSpd < 14) return;

    const intensity = Math.min(0.76, (maxSpd - 14) / 45);
    ctx.save();
    if (skin.isHolo) ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i < katana.trail.length; i++) {
      const p0 = katana.trail[i - 1], p1 = katana.trail[i];
      const a = (i / katana.trail.length) * intensity;
      ctx.fillStyle = `rgba(${skin.trail}, ${a * 0.36})`;
      ctx.beginPath();
      ctx.moveTo(p0.bx, p0.by); ctx.lineTo(p0.tx, p0.ty);
      ctx.lineTo(p1.tx, p1.ty); ctx.lineTo(p1.bx, p1.by);
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = `rgba(${skin.trail}, ${a * 0.92})`;
      ctx.lineWidth = 1.8 + (i / katana.trail.length) * 2.4;
      ctx.beginPath(); ctx.moveTo(p0.tx, p0.ty); ctx.lineTo(p1.tx, p1.ty); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRealisticSaya(ctx, sx, sy, angle, bladeLen, alpha, soriSign) {
    if (alpha <= 0.01) return;
    const skin = KATANA_SKINS[katana.skinIndex];
    const sayaLen = bladeLen * 0.96, sori = soriSign * bladeLen * 0.064, halfH = 8.2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    ctx.rotate(angle);

    const segs = 12, topPts = [], botPts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, px = t * sayaLen, cy = sori * t * t * 0.9, h = halfH * (1 - t * 0.14);
      topPts.push({ x: px, y: cy - h }); botPts.push({ x: px, y: cy + h });
    }

    const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    grad.addColorStop(0, skin.sayaTop); grad.addColorStop(0.32, skin.sayaMid); grad.addColorStop(1, skin.sayaBot);

    ctx.beginPath();
    ctx.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i <= segs; i++) ctx.lineTo(topPts[i].x, topPts[i].y);
    ctx.arcTo(sayaLen + 7, sori * 0.9, botPts[segs].x, botPts[segs].y, 6);
    for (let i = segs; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    ctx.strokeStyle = skin.isHolo ? `rgba(${skin.glowRGB}, 0.7)` : "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    const sageoX = sayaLen * 0.14;
    ctx.fillStyle = skin.sageo;
    ctx.fillRect(sageoX, -halfH - 0.5, 22, halfH * 2 + 1);
    ctx.fillStyle = skin.fittings;
    ctx.fillRect(-3, -halfH - 0.8, 7, halfH * 2 + 1.6);
    ctx.fillStyle = skin.fittingsTrim;
    ctx.fillRect(-3.5, -halfH - 0.8, 2, halfH * 2 + 1.6);
    ctx.restore();
  }

  // Guarda 2.5D dorada en perspectiva elíptica (como en las imágenes 2 y 3)
  function drawTsuba25D(ctx, tsubaX, hHalf, tilt, skin) {
    const rx = Math.max(7.5, hHalf * (1.02 + Math.abs(tilt) * 0.95));
    const ry = Math.max(21, hHalf * 3.05);
    const thickness = 3.8;

    ctx.save();

    // Resplandor suave detrás de la tsuba en modo holograma
    if (skin.isHolo) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(tsubaX, 0, 2, tsubaX, 0, ry * 1.35);
      halo.addColorStop(0, "rgba(254, 240, 138, 0.38)");
      halo.addColorStop(0.5, `rgba(${skin.glowRGB}, 0.22)`);
      halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(tsubaX, 0, ry * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Canto trasero (da volumen 3D al disco)
    ctx.fillStyle = skin.tsubaDark;
    ctx.beginPath();
    ctx.ellipse(tsubaX - thickness, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cara frontal metálica dorada
    const faceGrad = ctx.createLinearGradient(tsubaX - rx, -ry, tsubaX + rx, ry);
    faceGrad.addColorStop(0, skin.tsubaRim);
    faceGrad.addColorStop(0.28, skin.tsubaMain);
    faceGrad.addColorStop(0.55, skin.tsubaRim);
    faceGrad.addColorStop(0.82, skin.tsubaDark);
    faceGrad.addColorStop(1, skin.tsubaRim);

    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.ellipse(tsubaX, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Relieve interior y filigranas grabadas (sukashi)
    ctx.strokeStyle = "rgba(66, 32, 6, 0.65)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(tsubaX, 0, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(254, 249, 195, 0.7)";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(tsubaX + 0.5, 0, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 2 aberturas laterales estilizadas (hitsu-ana)
    ctx.fillStyle = "rgba(35, 18, 5, 0.7)";
    ctx.beginPath();
    ctx.ellipse(tsubaX, -ry * 0.52, rx * 0.24, ry * 0.16, 0, 0, Math.PI * 2);
    ctx.ellipse(tsubaX, ry * 0.52, rx * 0.24, ry * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Borde brillante exterior
    ctx.strokeStyle = skin.tsubaRim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(tsubaX, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (skin.isHolo) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(${skin.glowRGB}, 0.55)`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(tsubaX + 0.8, 0, rx + 0.8, ry + 0.8, 0, -0.9, 0.9);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Empuñadura + Hoja completa (Holográfica translúcida o Acero PBR)
  function drawKatanaBody(ctx, x, y, angle, handleLen, tsubaX, bladeLen, alpha, now, soriSign, tilt, clipAtX = null) {
    if (alpha <= 0.01) return;
    const skin = KATANA_SKINS[katana.skinIndex];
    const t = now * 0.001;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);

    const handleBack = tsubaX - handleLen;
    const hHalf = Math.max(7.5, katana.fistW * 0.135);
    const habakiLen = Math.max(12, hHalf * 1.45);
    const bladeStart = tsubaX + 2;
    const sori = soriSign * bladeLen * 0.068;

    if (clipAtX !== null) {
      ctx.beginPath();
      ctx.rect(handleBack - 30, -140, clipAtX - (handleBack - 30), 280);
      ctx.clip();
    }

    // ---------------------------------------------------------------------
    // 1. EMPUÑADURA (TSUKA)
    // ---------------------------------------------------------------------
    const tsukaStart = handleBack + 7;
    const tsukaEnd = tsubaX - 4;
    const tsukaLen = Math.max(30, tsukaEnd - tsukaStart);
    const wraps = Math.max(7, Math.round(tsukaLen / (hHalf * 1.45)));
    const stepW = tsukaLen / wraps;

    if (skin.isHolo) {
      // Base translúcida holográfica
      const hGrad = ctx.createLinearGradient(0, -hHalf, 0, hHalf);
      hGrad.addColorStop(0, `rgba(${skin.glowRGB}, 0.28)`);
      hGrad.addColorStop(0.5, skin.itoFill);
      hGrad.addColorStop(1, `rgba(${skin.glowRGB}, 0.28)`);

      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.roundRect(handleBack, -hHalf, handleLen - 2, hHalf * 2, [5, 2, 2, 5]);
      ctx.fill();

      // Rombos luminosos del tsukamaki (mismo patrón cálido/dorado de imágenes 2 y 3)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < wraps; i++) {
        const cxD = tsukaStart + (i + 0.5) * stepW;
        const dw = stepW * 0.36;
        const dh = hHalf * 0.62;

        ctx.fillStyle = skin.diamondGlow;
        ctx.beginPath();
        ctx.moveTo(cxD - dw, 0);
        ctx.lineTo(cxD, -dh);
        ctx.lineTo(cxD + dw, 0);
        ctx.lineTo(cxD, dh);
        ctx.closePath();
        ctx.fill();

        // Cruces del trenzado holográfico
        ctx.strokeStyle = `rgba(${skin.glowRGB}, 0.55)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cxD - stepW * 0.5, -hHalf);
        ctx.lineTo(cxD + stepW * 0.5, hHalf);
        ctx.moveTo(cxD + stepW * 0.5, -hHalf);
        ctx.lineTo(cxD - stepW * 0.5, hHalf);
        ctx.stroke();
      }

      // Contorno neón de la empuñadura y kashira
      ctx.strokeStyle = `rgba(${skin.glowRGB}, 0.38)`;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.roundRect(handleBack, -hHalf, handleLen - 2, hHalf * 2, [5, 2, 2, 5]);
      ctx.stroke();

      ctx.strokeStyle = skin.itoEdge;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Remate dorado/neón en la base (kashira)
      ctx.strokeStyle = skin.tsubaRim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(handleBack, -hHalf, 8, hHalf * 2, [5, 1, 1, 5]);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = skin.samegawa;
      ctx.beginPath();
      ctx.roundRect(tsukaStart, -hHalf, tsukaLen, hHalf * 2, 2);
      ctx.fill();

      ctx.fillStyle = skin.ito;
      for (let i = 0; i < wraps; i++) {
        const wx = tsukaStart + i * stepW;
        ctx.beginPath(); ctx.moveTo(wx, -hHalf - 0.4); ctx.lineTo(wx + stepW, -hHalf - 0.4); ctx.lineTo(wx + stepW * 0.5, -hHalf * 0.14); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(wx, hHalf + 0.4); ctx.lineTo(wx + stepW, hHalf + 0.4); ctx.lineTo(wx + stepW * 0.5, hHalf * 0.14); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = skin.ito; ctx.lineWidth = Math.max(2.6, stepW * 0.34);
        ctx.beginPath(); ctx.moveTo(wx + stepW * 0.15, -hHalf); ctx.lineTo(wx + stepW * 0.85, hHalf); ctx.stroke();
        ctx.strokeStyle = skin.itoHi; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(wx + stepW * 0.85, -hHalf); ctx.lineTo(wx + stepW * 0.15, hHalf); ctx.stroke();
      }
      ctx.fillStyle = skin.fittings;
      ctx.beginPath(); ctx.roundRect(handleBack, -hHalf - 0.5, 8, hHalf * 2 + 1, [4,1,1,4]); ctx.fill();
      ctx.fillRect(tsukaEnd - 1, -hHalf - 0.5, 5, hHalf * 2 + 1);
      ctx.fillStyle = skin.fittingsTrim;
      ctx.fillRect(handleBack + 5.5, -hHalf - 0.4, 1.6, hHalf * 2 + 0.8);
      ctx.fillRect(tsukaEnd - 1, -hHalf - 0.4, 1.4, hHalf * 2 + 0.8);
    }

    // ---------------------------------------------------------------------
    // 2. GUARDA (TSUBA 2.5D EN PERSPECTIVA)
    // ---------------------------------------------------------------------
    drawTsuba25D(ctx, tsubaX, hHalf, tilt, skin);

    // ---------------------------------------------------------------------
    // 3. HOJA (GEOMETRÍA CURVADA CON KISSAKI)
    // ---------------------------------------------------------------------
    if (bladeLen > 8) {
      const segs = 18;
      const yokoteT = 0.88;
      const baseHalfW = Math.max(5.8, hHalf * 0.84);
      const spinePts = [], ridgePts = [], edgePts = [];

      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const px = bladeStart + u * bladeLen;
        const curveY = sori * u * u;
        let spineY, ridgeY, edgeY;
        const dir = -soriSign; // filo en el lado convexo exterior

        if (u <= yokoteT) {
          const hw = baseHalfW * (1 - (u / yokoteT) * 0.22);
          spineY = curveY - dir * hw;
          ridgeY = curveY - dir * hw * 0.25;
          edgeY = curveY + dir * hw;
        } else {
          const kt = (u - yokoteT) / (1 - yokoteT);
          const yhw = baseHalfW * 0.78;
          spineY = curveY - dir * yhw * (1 - kt * 0.1);
          ridgeY = curveY - dir * yhw * (0.25 + kt * 0.6);
          edgeY = curveY + dir * yhw * (1 - Math.pow(kt, 1.5) * 1.9);
        }
        spinePts.push({ x: px, y: spineY });
        ridgePts.push({ x: px, y: ridgeY });
        edgePts.push({ x: px, y: edgeY });
      }

      const traceFullBlade = () => {
        ctx.beginPath();
        ctx.moveTo(spinePts[0].x, spinePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(spinePts[i].x, spinePts[i].y);
        for (let i = segs; i >= 0; i--) ctx.lineTo(edgePts[i].x, edgePts[i].y);
        ctx.closePath();
      };

      if (skin.isHolo) {
        // Capa 1: Aura volumétrica suave exterior
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        traceFullBlade();
        ctx.strokeStyle = `rgba(${skin.glowRGB}, 0.24)`;
        ctx.lineWidth = 14;
        ctx.lineJoin = "round";
        ctx.stroke();

        ctx.strokeStyle = `rgba(${skin.glowRGB}, 0.34)`;
        ctx.lineWidth = 6.5;
        ctx.stroke();

        // Capa 2: Cuerpo translúcido de energía (deja ver el fondo real detrás)
        const sheen1 = 0.22 + ((t * 0.38 + Math.sin(angle) * 0.25) % 0.7);
        const sheen2 = (sheen1 + 0.42) % 0.92;
        const bodyGrad = ctx.createLinearGradient(bladeStart, 0, bladeStart + bladeLen, sori);
        bodyGrad.addColorStop(0, `rgba(${skin.glowRGB}, 0.52)`);
        bodyGrad.addColorStop(Math.max(0.05, Math.min(0.9, sheen1)), `rgba(${skin.coreRGB}, 0.62)`);
        bodyGrad.addColorStop(Math.max(0.08, Math.min(0.95, sheen1 + 0.14)), `rgba(${skin.glowRGB}, 0.22)`);
        bodyGrad.addColorStop(Math.max(0.08, Math.min(0.95, sheen2)), `rgba(${skin.coreRGB}, 0.56)`);
        bodyGrad.addColorStop(1, `rgba(${skin.coreRGB}, 0.85)`);

        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Capa 3: Plano biselado del filo más luminoso
        ctx.beginPath();
        ctx.moveTo(ridgePts[0].x, ridgePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(ridgePts[i].x, ridgePts[i].y);
        for (let i = segs; i >= 0; i--) ctx.lineTo(edgePts[i].x, edgePts[i].y);
        ctx.closePath();
        ctx.fillStyle = `rgba(${skin.coreRGB}, 0.28)`;
        ctx.fill();

        // Capa 4: Arista Shinogi + línea Hamon ondulada
        ctx.beginPath();
        ctx.moveTo(ridgePts[0].x, ridgePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(ridgePts[i].x, ridgePts[i].y);
        ctx.strokeStyle = `rgba(${skin.coreRGB}, 0.55)`;
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.beginPath();
        for (let i = 1; i <= segs; i++) {
          const u = i / segs;
          const wave = Math.sin(u * 30 - t * 4) * 1.1;
          const hx = edgePts[i].x;
          const hy = edgePts[i].y * 0.68 + ridgePts[i].y * 0.32 + wave;
          if (i === 1) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.strokeStyle = `rgba(${skin.coreRGB}, 0.65)`;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        // Capa 5: Filo vivo blanco-incandescente + lomo iluminado
        ctx.beginPath();
        ctx.moveTo(edgePts[0].x, edgePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(edgePts[i].x, edgePts[i].y);
        ctx.strokeStyle = `rgba(${skin.glowRGB}, 0.85)`;
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.7;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(spinePts[0].x, spinePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(spinePts[i].x, spinePts[i].y);
        ctx.strokeStyle = `rgba(${skin.coreRGB}, 0.72)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Capa 6: Chispas holográficas flotando alrededor de la hoja
        for (const sp of HOLO_SPARKS) {
          const u = (sp.t + t * sp.speed * 0.25) % 1;
          const px = bladeStart + u * bladeLen;
          const baseY = sori * u * u;
          const py = baseY + sp.offset + Math.sin(t * 2.6 + sp.phase) * 7;
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 4.5 + sp.phase));
          ctx.fillStyle = `rgba(${skin.coreRGB}, ${tw * 0.85})`;
          ctx.beginPath();
          ctx.arc(px, py, sp.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else {
        // Modo metálico realista (Acero / Blanca)
        const upperGrad = ctx.createLinearGradient(bladeStart, -baseHalfW, bladeStart + bladeLen, sori);
        upperGrad.addColorStop(0, skin.spineDark); upperGrad.addColorStop(0.45, skin.spineMid); upperGrad.addColorStop(1, skin.spineTop);
        ctx.beginPath();
        ctx.moveTo(spinePts[0].x, spinePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(spinePts[i].x, spinePts[i].y);
        for (let i = segs; i >= 0; i--) ctx.lineTo(ridgePts[i].x, ridgePts[i].y);
        ctx.closePath(); ctx.fillStyle = upperGrad; ctx.fill();

        const glintPos = 0.5 + Math.sin(angle * 2.2) * 0.36;
        const lowerGrad = ctx.createLinearGradient(bladeStart, 0, bladeStart + bladeLen, sori);
        lowerGrad.addColorStop(0, skin.edgeDark);
        lowerGrad.addColorStop(Math.max(0.05, glintPos - 0.16), skin.edgeMid);
        lowerGrad.addColorStop(glintPos, skin.edgeLight);
        lowerGrad.addColorStop(Math.min(0.95, glintPos + 0.16), skin.edgeMid);
        lowerGrad.addColorStop(1, skin.edgeLight);
        ctx.beginPath();
        ctx.moveTo(ridgePts[0].x, ridgePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(ridgePts[i].x, ridgePts[i].y);
        for (let i = segs; i >= 0; i--) ctx.lineTo(edgePts[i].x, edgePts[i].y);
        ctx.closePath(); ctx.fillStyle = lowerGrad; ctx.fill();

        ctx.beginPath();
        for (let i = 1; i <= segs - 3; i++) {
          const bx = spinePts[i].x, by = spinePts[i].y * 0.58 + ridgePts[i].y * 0.42;
          if (i === 1) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
        }
        ctx.strokeStyle = skin.bohi; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(edgePts[0].x, edgePts[0].y);
        for (let i = 1; i <= segs; i++) ctx.lineTo(edgePts[i].x, edgePts[i].y);
        ctx.strokeStyle = skin.edgeLight; ctx.lineWidth = 1.3; ctx.stroke();
      }

      // Habaki dorado emergiendo del centro de la tsuba
      const habGrad = ctx.createLinearGradient(0, -baseHalfW - 1, 0, baseHalfW + 1);
      habGrad.addColorStop(0, skin.habakiTop);
      habGrad.addColorStop(0.5, skin.habakiMid);
      habGrad.addColorStop(1, skin.habakiBot);
      ctx.beginPath();
      ctx.moveTo(bladeStart - 2, -baseHalfW - 1.2);
      ctx.lineTo(bladeStart + habakiLen, -baseHalfW - 0.2);
      ctx.lineTo(bladeStart + habakiLen - 2, baseHalfW + 0.2);
      ctx.lineTo(bladeStart - 2, baseHalfW + 1.2);
      ctx.closePath();
      ctx.fillStyle = habGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  // Oclusión real: recorta tus dedos cerrados y pulgar desde bgCanvas encima de la empuñadura
  // + rebote de luz cian sobre la piel del pulgar y palma
  function drawHandOcclusionAndLight(ctx, slot, cw, ch) {
    if (!slot || !slot.rawHand) return;
    const skin = KATANA_SKINS[katana.skinIndex];
    const h = slot.rawHand;

    // 1. Oclusión real de dedos cuando el puño está cerrado y la cámara está activa
    if (katana.occlusion && slot.isFist && camCanvas && camCanvas.style.display !== "none" && camCanvas.width > 0) {
      const halfBox = Math.max(90, slot.fistW * 1.9);
      const rx = slot.x - halfBox;
      const ry = slot.y - halfBox;
      const rw = halfBox * 2;
      const rh = halfBox * 2;

      const x0 = Math.max(0, rx);
      const y0 = Math.max(0, ry);
      const x1 = Math.min(cw, rx + rw);
      const y1 = Math.min(ch, ry + rh);

      if (x1 > x0 + 4 && y1 > y0 + 4) {
        const ow = occCanvas.width;
        const oh = occCanvas.height;
        const toX = (px) => ((px - rx) / rw) * ow;
        const toY = (py) => ((py - ry) / rh) * oh;
        const sc = ow / rw;

        occCtx.save();
        occCtx.globalCompositeOperation = "source-over";
        occCtx.clearRect(0, 0, ow, oh);
        occCtx.lineCap = "round";
        occCtx.lineJoin = "round";
        occCtx.fillStyle = "#ffffff";
        occCtx.strokeStyle = "#ffffff";

        const drawFingerMask = (widthMult) => {
          const wF = Math.max(8, slot.fistW * 0.27) * sc * widthMult;
          const wP = Math.max(7, slot.fistW * 0.23) * sc * widthMult;
          const wT = Math.max(9, slot.fistW * 0.30) * sc * widthMult;

          // 4 dedos cerrados envolviendo el mango
          const chains = [
            { ids: [5, 6, 7, 8], w: wF },
            { ids: [9, 10, 11, 12], w: wF * 1.04 },
            { ids: [13, 14, 15, 16], w: wF * 0.98 },
            { ids: [17, 18, 19, 20], w: wP }
          ];
          for (const c of chains) {
            occCtx.lineWidth = c.w;
            occCtx.beginPath();
            occCtx.moveTo(toX(h[c.ids[0]].x), toY(h[c.ids[0]].y));
            for (let k = 1; k < c.ids.length; k++) {
              occCtx.lineTo(toX(h[c.ids[k]].x), toY(h[c.ids[k]].y));
            }
            occCtx.stroke();
          }

          // Pulgar cerrando por delante
          occCtx.lineWidth = wT;
          occCtx.beginPath();
          occCtx.moveTo(toX(h[2].x), toY(h[2].y));
          occCtx.lineTo(toX(h[3].x), toY(h[3].y));
          occCtx.lineTo(toX(h[4].x), toY(h[4].y));
          occCtx.stroke();

          // Relleno sólido entre dedos adyacentes para que no se cuele la hoja por las rendijas
          const fillPoly = (ids) => {
            occCtx.beginPath();
            occCtx.moveTo(toX(h[ids[0]].x), toY(h[ids[0]].y));
            for (let k = 1; k < ids.length; k++) occCtx.lineTo(toX(h[ids[k]].x), toY(h[ids[k]].y));
            occCtx.closePath();
            occCtx.fill();
          };
          fillPoly([5, 9, 13, 17, 18, 14, 10, 6]);
          fillPoly([6, 10, 14, 18, 19, 15, 11, 7]);
          fillPoly([7, 11, 15, 19, 20, 16, 12, 8]);
        };

        // Doble pasada: borde exterior suave (feather) + núcleo sólido sin usar shadowBlur lento
        occCtx.globalAlpha = 0.42;
        drawFingerMask(1.16);
        occCtx.globalAlpha = 1.0;
        drawFingerMask(1.0);

        // Recortar los píxeles reales de tus dedos desde bgCanvas
        occCtx.globalCompositeOperation = "source-in";
        const scaleX = camCanvas.width / cw;
        const scaleY = camCanvas.height / ch;
        const dx = ((x0 - rx) / rw) * ow;
        const dy = ((y0 - ry) / rh) * oh;
        const dw = ((x1 - x0) / rw) * ow;
        const dh = ((y1 - y0) / rh) * oh;

        occCtx.drawImage(
          camCanvas,
          x0 * scaleX, y0 * scaleY, (x1 - x0) * scaleX, (y1 - y0) * scaleY,
          dx, dy, dw, dh
        );
        occCtx.restore();

        // Componer tus dedos reales encima de la katana
        ctx.drawImage(occCanvas, rx, ry, rw, rh);
      }
    }

    // 2. Rebote de luz holográfica sobre la piel del pulgar, palma y nudillos
    if (skin.isHolo) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";

      // Zona de la eminencia tenar (base del pulgar / palma) donde más rebota la luz
      const palmLightX = (h[1].x + h[2].x + h[5].x + h[9].x) * 0.25;
      const palmLightY = (h[1].y + h[2].y + h[5].y + h[9].y) * 0.25;
      const lightR = Math.max(48, slot.fistW * 1.15);

      const skinGlow = ctx.createRadialGradient(palmLightX, palmLightY, 4, palmLightX, palmLightY, lightR);
      skinGlow.addColorStop(0, `rgba(${skin.coreRGB}, 0.46)`);
      skinGlow.addColorStop(0.45, `rgba(${skin.glowRGB}, 0.24)`);
      skinGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = skinGlow;
      ctx.beginPath();
      ctx.arc(palmLightX, palmLightY, lightR, 0, Math.PI * 2);
      ctx.fill();

      // Brillo sutil envolviendo la entrada/salida del puño (rim light en dedos)
      ctx.globalCompositeOperation = "lighter";
      const rimR = Math.max(26, slot.fistW * 0.55);
      for (const idx of [5, 17]) {
        const rg = ctx.createRadialGradient(h[idx].x, h[idx].y, 1, h[idx].x, h[idx].y, rimR);
        rg.addColorStop(0, `rgba(${skin.glowRGB}, 0.26)`);
        rg.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(h[idx].x, h[idx].y, rimR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function stepKatana(ctx, mappedHands, now, dt, cw, ch) {
    updateKatanaHands(mappedHands, now);
    const [h0, h1] = katana.hands;

    if (katana.state === "IDLE") {
      katana.trail = [];
      katana.materialize = 0;

      // Prioridad 1: si juntas 2 puños cerca -> desenvaine clásico en ambos modos
      if (now > katana.drawCooldownUntil && h0.active && h1.active && h0.isFist && h1.isFist) {
        const dist = Math.hypot(h0.x - h1.x, h0.y - h1.y);
        const avgScale = (h0.scale + h1.scale) * 0.5;
        if (dist < Math.max(96, avgScale * 1.7)) {
          const rightIdx = h0.x >= h1.x ? 0 : 1;
          katana.state = "DRAWING";
          katana.handleSlot = rightIdx;
          katana.sheathSlot = 1 - rightIdx;
          updateKatanaDimensions((h0.fistW + h1.fistW) * 0.5, cw, ch, true);
          katana.drawDeadzone = Math.max(dist + 8, avgScale * 0.78);
          katana.drawProgress = 0;
          return;
        }
      }

      // Prioridad 2: modo 1 PUÑO -> cierra una sola mano para materializarla en tu agarre
      if (katana.summonMode === "fist" && now > katana.drawCooldownUntil) {
        setStatus("Cierra un puño para empuñar · Abre palma para guardar");
        for (let s = 0; s < 2; s++) {
          const slot = katana.hands[s];
          if (slot.active && slot.isFist && slot.fistSince > 0 && now - slot.fistSince > 110) {
            katana.state = "HELD";
            katana.heldSlot = s;
            katana.heldSince = now;
            katana.x = slot.x;
            katana.y = slot.y;
            katana.angle = slot.angle;
            katana.angVel = 0;
            katana.materialize = 0.08;
            katana.tilt = slot.tilt;
            katana.soriSign = computeSoriSign(slot.rawHand, slot.angle);
            updateKatanaDimensions(slot.fistW, cw, ch, true);
            slot.peakUpVy = 0;
            katana.ripples.push({ x: slot.x, y: slot.y, r: 8, maxR: 62, alpha: 0.9, color: KATANA_SKINS[katana.skinIndex].glowRGB });
            break;
          }
        }
      } else {
        setStatus("Junta 2 puños y sepáralos para desenvainar");
      }
    } else if (katana.state === "DRAWING") {
      const hHand = katana.hands[katana.handleSlot];
      const sHand = katana.hands[katana.sheathSlot];
      if (!hHand.active) {
        resetKatana();
      } else if (!sHand.active) {
        if (katana.drawProgress >= 0.7) {
          katana.state = "HELD"; katana.heldSlot = katana.handleSlot;
          katana.heldSince = now; katana.angVel = 0; katana.materialize = 1;
          hHand.peakUpVy = 0;
        } else resetKatana();
      } else {
        const dx = sHand.x - hHand.x, dy = sHand.y - hHand.y;
        const dist = Math.hypot(dx, dy);
        const drawAngle = dist > 5 ? Math.atan2(dy, dx) : katana.angle;
        katana.x = hHand.x; katana.y = hHand.y; katana.angle = drawAngle;
        katana.tilt = hHand.tilt;
        katana.soriSign = computeSoriSign(hHand.rawHand, drawAngle);

        const sep = Math.max(0, dist - katana.drawDeadzone);
        const neededDist = katana.tsubaOffset + katana.fullBladeLen;
        katana.drawProgress = Math.max(0, Math.min(1, sep / Math.max(60, neededDist - katana.drawDeadzone)));

        if (sep > 2) {
          setStatus(`Desenvainando ${Math.round(katana.drawProgress * 100)}%`);
          const alpha = Math.min(1, sep / 30);
          drawKatanaBody(ctx, katana.x, katana.y, katana.angle, katana.handleLen, katana.tsubaOffset, katana.fullBladeLen, alpha, now, katana.soriSign, katana.tilt, dist + 2);
          drawRealisticSaya(ctx, sHand.x, sHand.y, drawAngle, katana.fullBladeLen, alpha, katana.soriSign);
          drawHandOcclusionAndLight(ctx, hHand, cw, ch);
          if (katana.drawProgress >= 0.94) {
            katana.state = "HELD"; katana.heldSlot = katana.handleSlot;
            katana.heldSince = now; katana.angVel = 0; katana.materialize = 1;
            katana.transferCooldownUntil = now + 500; hHand.peakUpVy = 0;
            katana.ripples.push({ x: sHand.x, y: sHand.y, r: 8, maxR: 64, alpha: 0.9, color: KATANA_SKINS[katana.skinIndex].glowRGB });
          }
        } else {
          setStatus("Separa los puños →");
        }
      }
    } else if (katana.state === "HELD") {
      const curSlot = katana.hands[katana.heldSlot];
      const otherIdx = 1 - katana.heldSlot;
      const other = katana.hands[otherIdx];

      katana.materialize = Math.min(1, katana.materialize + dt * 4.2);

      if (!curSlot.active) {
        if (katana.summonMode === "fist") {
          resetKatana();
        } else {
          katana.state = "AIRBORNE"; katana.releaseTime = now;
          katana.releasedBySlot = katana.heldSlot; katana.heldSlot = -1;
          katana.vx = 0; katana.vy = -80; katana.vAngle = 1.6;
        }
      } else {
        let transferred = false;
        if (other.active && now > katana.transferCooldownUntil && (now - katana.heldSince > 350)) {
          if (Math.hypot(other.x - katana.x, other.y - katana.y) < Math.max(76, other.scale * 1.15) &&
              (other.justFisted || (other.isFist && curSlot.isOpen))) {
            katana.heldSlot = otherIdx; katana.heldSince = now;
            katana.transferCooldownUntil = now + 550; other.peakUpVy = 0;
            katana.ripples.push({ x: other.x, y: other.y, r: 8, maxR: 54, alpha: 0.9, color: "56,189,248" });
            transferred = true;
          }
        }

        if (!transferred) {
          const vel = getSlotVel(curSlot);
          const holdAge = now - katana.heldSince;
          const strongUp = vel.vy < -Math.max(540, ch * 0.68);
          const openUp = curSlot.isOpen && vel.vy < -Math.max(380, ch * 0.46);
          const snapUp = curSlot.peakUpVy < -Math.max(480, ch * 0.58) && (now - curSlot.peakUpTime < 140) && vel.vy > curSlot.peakUpVy * 0.35;

          if (holdAge > 380 && (strongUp || openUp || snapUp)) {
            katana.state = "AIRBORNE"; katana.releaseTime = now;
            katana.releasedBySlot = katana.heldSlot; katana.heldSlot = -1;
            const bestUp = Math.min(vel.vy, curSlot.peakUpVy || vel.vy);
            katana.vy = Math.min(-340, Math.max(-680, bestUp * 0.72));
            katana.vx = Math.max(-340, Math.min(340, vel.vx * 0.5));
            const spin = Math.abs(katana.angVel) > 1.2 ? katana.angVel * 0.45 : (katana.vx >= 0 ? 2.4 : -2.4);
            katana.vAngle = Math.max(-3.8, Math.min(3.8, spin));
            curSlot.peakUpVy = 0;
          } else if (katana.summonMode === "fist" && curSlot.isOpen && curSlot.openSince > 0 && now - curSlot.openSince > 620) {
            // En modo 1 puño, abrir la palma relajada guarda la katana para liberar clics UI
            resetKatana();
          } else {
            katana.x = curSlot.x; katana.y = curSlot.y;
            katana.tilt = curSlot.tilt;
            if (curSlot.hasAngle) {
              // Muelle rápido y firme para que el mango no resbale fuera del puño ocluido
              const diff = shortestAngleDiff(katana.angle, curSlot.angle);
              katana.angVel += (diff * 290 - katana.angVel * 32) * dt;
              katana.angVel = Math.max(-13, Math.min(13, katana.angVel));
              katana.angle += katana.angVel * dt;
            }
            katana.soriSign = computeSoriSign(curSlot.rawHand, katana.angle);
            updateKatanaDimensions(curSlot.fistW, cw, ch, false);

            setStatus(curSlot.isFist
              ? "Empuñada · Tira arriba para lanzar"
              : "Cierra el puño para oclusión · Mantén palma abierta para guardar");

            drawSlashTrail(ctx, now);
            drawKatanaBody(
              ctx,
              katana.x, katana.y, katana.angle,
              katana.handleLen, katana.tsubaOffset,
              katana.fullBladeLen * katana.materialize,
              Math.min(1, katana.materialize * 1.4),
              now, katana.soriSign, katana.tilt
            );
            drawHandOcclusionAndLight(ctx, curSlot, cw, ch);
          }
        }
      }
    } else if (katana.state === "AIRBORNE") {
      const grav = katana.slowMo ? 340 : 1050;
      const maxFall = katana.slowMo ? 310 : 850;
      katana.vy = Math.min(maxFall, katana.vy + grav * dt);
      katana.vx *= 0.992; katana.vAngle *= 0.996;
      katana.x += katana.vx * dt; katana.y += katana.vy * dt; katana.angle += katana.vAngle * dt;

      if (katana.x < 28) { katana.x = 28; katana.vx = Math.abs(katana.vx) * 0.55; katana.vAngle *= -0.7; }
      else if (katana.x > cw - 28) { katana.x = cw - 28; katana.vx = -Math.abs(katana.vx) * 0.55; katana.vAngle *= -0.7; }
      if (katana.y < 28) { katana.y = 28; katana.vy = Math.abs(katana.vy) * 0.35; }

      const elapsed = now - katana.releaseTime;
      const midX = katana.x + Math.cos(katana.angle) * (katana.fullBladeLen * 0.45);
      const midY = katana.y + Math.sin(katana.angle) * (katana.fullBladeLen * 0.45);
      let caught = false;

      for (let s = 0; s < 2; s++) {
        const slot = katana.hands[s];
        if (!slot.active || elapsed < (s === katana.releasedBySlot ? 420 : 110)) continue;
        if (distPointToSegment(slot.x, slot.y, katana.x, katana.y, midX, midY) < Math.max(92, slot.scale * 1.45)) {
          katana.state = "HELD"; katana.heldSlot = s; katana.heldSince = now;
          katana.x = slot.x; katana.y = slot.y; katana.angVel = katana.vAngle * 0.35;
          katana.transferCooldownUntil = now + 450; slot.peakUpVy = 0;
          katana.ripples.push({ x: slot.x, y: slot.y, r: 10, maxR: 70, alpha: 0.95, color: KATANA_SKINS[katana.skinIndex].glowRGB });
          caught = true; break;
        }
      }

      if (!caught) {
        setStatus("En el aire · Acerca una mano para atraparla");
        drawSlashTrail(ctx, now);
        drawKatanaBody(
          ctx,
          katana.x, katana.y, katana.angle,
          katana.handleLen, katana.tsubaOffset,
          katana.fullBladeLen, 1, now, katana.soriSign, 0.3
        );
        if (katana.y > ch + 180) resetKatana();
      }
    }

    for (let i = katana.ripples.length - 1; i >= 0; i--) {
      const rp = katana.ripples[i];
      rp.r += (rp.maxR - rp.r) * 0.22; rp.alpha *= 0.84;
      ctx.save(); ctx.strokeStyle = `rgba(${rp.color}, ${rp.alpha})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (rp.alpha < 0.03) katana.ripples.splice(i, 1);
    }
  }

  // =========================================================================
  // 2. MÓDULO GOJO (AZUL + ROJO -> VACÍO PÚRPURA)
  // =========================================================================
  function drawGojoOrb(ctx, x, y, r, type, t, alpha = 1) {
    if (r <= 1 || alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    const rad = r * (1 + Math.sin(t * 16) * 0.06);

    if (type === "blue") {
      const g = ctx.createRadialGradient(x, y, rad * 0.1, x, y, rad * 3.0);
      g.addColorStop(0, "rgba(255,255,255,0.96)"); g.addColorStop(0.2, "rgba(120,235,255,0.9)");
      g.addColorStop(0.45, "rgba(0,115,255,0.52)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 3.0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(160,240,255,0.75)"; ctx.lineWidth = 1.4;
      for (let i = 0; i < 24; i++) {
        const p = GOJO_PARTICLES[i], prog = 1 - ((t * 1.9 + p.r) % 1);
        const r1 = prog * rad * 2.3, r2 = r1 + 13 * prog, a = p.angle + t * 5.0;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.lineTo(x + Math.cos(a - 0.12) * r2, y + Math.sin(a - 0.12) * r2); ctx.stroke();
      }
    } else if (type === "red") {
      const g = ctx.createRadialGradient(x, y, rad * 0.1, x, y, rad * 3.0);
      g.addColorStop(0, "rgba(255,255,255,0.98)"); g.addColorStop(0.2, "rgba(255,110,90,0.92)");
      g.addColorStop(0.48, "rgba(220,0,30,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 3.0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,160,140,0.8)"; ctx.lineWidth = 1.5;
      for (let i = 24; i < 48; i++) {
        const p = GOJO_PARTICLES[i], prog = (t * 2.3 + p.r) % 1;
        const r1 = prog * rad * 2.2, r2 = r1 + 15 * (1 - prog * 0.5), a = p.angle - t * 2.0;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.stroke();
      }
    } else {
      const g = ctx.createRadialGradient(x, y, rad * 0.08, x, y, rad * 3.4);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.2, "rgba(238,160,255,0.98)");
      g.addColorStop(0.45, "rgba(145,0,255,0.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 3.4, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, d = rad * (1.2 + Math.random() * 1.2);
        drawLightning(ctx, x, y, x + Math.cos(a) * d, y + Math.sin(a) * d, "#f5d0fe", 2.0, 6, 22);
      }
    }
    ctx.restore();
  }

  function stepGojo(ctx, mappedHands, now, cw, ch) {
    const t = now * 0.001;
    const fingers = mappedHands.map((h) => ({ ...getIndexTipOrigin(h), pointing: isIndexPointing(h) }));
    gojo.flash *= 0.88;

    if (gojo.state === "NORMAL") {
      let blueF = null, redF = null;
      if (fingers.length === 2) {
        if (fingers[0].pointing) blueF = fingers[0];
        if (fingers[1].pointing) redF = fingers[1];
      } else if (fingers.length === 1 && fingers[0].pointing) {
        if (fingers[0].x < cw * 0.5) blueF = fingers[0]; else redF = fingers[0];
      }
      gojo.blueAnim += ((blueF ? 1 : 0) - gojo.blueAnim) * 0.24;
      gojo.redAnim += ((redF ? 1 : 0) - gojo.redAnim) * 0.24;
      if (blueF && gojo.blueAnim > 0.02) drawGojoOrb(ctx, blueF.x, blueF.y, Math.max(20, blueF.scale * 0.34) * gojo.blueAnim, "blue", t, gojo.blueAnim);
      if (redF && gojo.redAnim > 0.02) drawGojoOrb(ctx, redF.x, redF.y, Math.max(20, redF.scale * 0.34) * gojo.redAnim, "red", t, gojo.redAnim);

      if (blueF && redF && gojo.blueAnim > 0.6 && gojo.redAnim > 0.6) {
        setStatus("Junta ambos índices → Vacío Púrpura");
        if (Math.hypot(blueF.x - redF.x, blueF.y - redF.y) < Math.max(85, (blueF.scale + redF.scale) * 0.65)) {
          gojo.state = "MERGING"; gojo.stateStart = now;
          gojo.mergeX = (blueF.x + redF.x) * 0.5; gojo.mergeY = (blueF.y + redF.y) * 0.5;
          gojo.mergeScale = (blueF.scale + redF.scale) * 0.5;
        }
      } else {
        setStatus("Índice izq: Azul · Índice der: Rojo");
      }
    } else if (gojo.state === "MERGING") {
      const p = Math.min(1, (now - gojo.stateStart) / 650);
      if (fingers.length >= 2) { gojo.mergeX = (fingers[0].x + fingers[1].x) * 0.5; gojo.mergeY = (fingers[0].y + fingers[1].y) * 0.5; }
      const orbitR = (1 - p) * Math.max(55, gojo.mergeScale * 0.8), angle = p * p * Math.PI * 8;
      const bx = gojo.mergeX + Math.cos(angle) * orbitR, by = gojo.mergeY + Math.sin(angle) * orbitR;
      const rx = gojo.mergeX - Math.cos(angle) * orbitR, ry = gojo.mergeY - Math.sin(angle) * orbitR;
      drawGojoOrb(ctx, bx, by, 26 * (1 - p * 0.3), "blue", t, 1);
      drawGojoOrb(ctx, rx, ry, 26 * (1 - p * 0.3), "red", t, 1);
      drawLightning(ctx, bx, by, rx, ry, "#f0abfc", 2.8, 7, 24);
      setStatus("Fusionando...");
      if (p >= 1) {
        gojo.state = "PURPLE_READY"; gojo.stateStart = now;
        gojo.purpleX = gojo.mergeX; gojo.purpleY = gojo.mergeY;
        gojo.prevPurpleX = gojo.mergeX; gojo.prevPurpleY = gojo.mergeY;
        gojo.flash = 0.75;
      }
    } else if (gojo.state === "PURPLE_READY") {
      const elapsed = now - gojo.stateStart;
      setStatus("Morado listo · Empuja o separa para lanzar");
      gojo.prevPurpleX = gojo.purpleX; gojo.prevPurpleY = gojo.purpleY;
      if (fingers.length >= 2) {
        gojo.purpleX += (((fingers[0].x + fingers[1].x) * 0.5) - gojo.purpleX) * 0.45;
        gojo.purpleY += (((fingers[0].y + fingers[1].y) * 0.5) - gojo.purpleY) * 0.45;
      } else if (fingers.length === 1) {
        gojo.purpleX += (fingers[0].x - gojo.purpleX) * 0.45;
        gojo.purpleY += (fingers[0].y - gojo.purpleY) * 0.45;
      }
      const vx = gojo.purpleX - gojo.prevPurpleX, vy = gojo.purpleY - gojo.prevPurpleY, spd = Math.hypot(vx, vy);
      drawGojoOrb(ctx, gojo.purpleX, gojo.purpleY, Math.max(40, gojo.mergeScale * 0.55), "purple", t, 1);
      const separated = fingers.length === 2 && Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y) > cw * 0.5;
      if (elapsed > 300 && (spd > 24 || separated || (fingers.length === 0 && elapsed > 360))) {
        gojo.state = "LAUNCHED"; gojo.stateStart = now;
        gojo.launchVx = spd > 10 ? vx * 0.6 : 0; gojo.launchVy = spd > 10 ? vy * 0.6 : -6;
        gojo.flash = 0.9;
      }
    } else if (gojo.state === "LAUNCHED") {
      const p = Math.min(1, (now - gojo.stateStart) / 1050);
      gojo.purpleX += gojo.launchVx; gojo.purpleY += gojo.launchVy;
      const hugeR = 50 + (1 - Math.pow(1 - p, 3)) * Math.max(cw, ch) * 0.85;
      drawGojoOrb(ctx, gojo.purpleX, gojo.purpleY, hugeR * 0.5, "purple", t, p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.3));
      setStatus("¡Vacío Púrpura!");
      if (p >= 1) resetGojo();
    }

    if (gojo.flash > 0.02) {
      ctx.save();
      ctx.fillStyle = `rgba(216, 180, 254, ${gojo.flash * 0.45})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
  }

  // =========================================================================
  // 3. HOLOGRAMAS EN LA PALMA (Cubo 3D + Plasma + HUD)
  // =========================================================================
  function drawHoloCube3D(ctx, cx, cy, r, t, anim) {
    const project = (v, rx, ry, rz, size) => {
      let [x, y, z] = v;
      let y1 = y * Math.cos(rx) - z * Math.sin(rx);
      let z1 = y * Math.sin(rx) + z * Math.cos(rx);
      let x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
      let z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
      let x3 = x2 * Math.cos(rz) - y1 * Math.sin(rz);
      let y3 = x2 * Math.sin(rz) + y1 * Math.cos(rz);
      const persp = 3.2 / (3.2 - z2 * 0.65);
      return { x: cx + x3 * size * persp, y: cy + y3 * size * persp };
    };

    ctx.save();
    ctx.globalAlpha = anim;
    ctx.globalCompositeOperation = "lighter";

    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, r * 1.45);
    glow.addColorStop(0, "rgba(56, 189, 248, 0.45)");
    glow.addColorStop(0.55, "rgba(14, 165, 233, 0.14)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = "rgba(125, 211, 252, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, t * 1.4, t * 1.4 + Math.PI * 1.3); ctx.stroke();

    const outer = CUBE_VERTS.map((v) => project(v, t * 1.1, t * 1.5, t * 0.4, r * 0.48));
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const [a, b] of CUBE_EDGES) { ctx.moveTo(outer[a].x, outer[a].y); ctx.lineTo(outer[b].x, outer[b].y); }
    ctx.stroke();

    ctx.strokeStyle = "#e0f2fe";
    ctx.lineWidth = 1.7;
    ctx.stroke();

    const inner = CUBE_VERTS.map((v) => project(v, -t * 1.8, -t * 1.2, t * 0.9, r * 0.22));
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const [a, b] of CUBE_EDGES) { ctx.moveTo(inner[a].x, inner[a].y); ctx.lineTo(inner[b].x, inner[b].y); }
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    for (const p of outer) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function stepPalmHolograms(ctx, mappedHands, now) {
    const t = now * 0.001;
    for (let i = 0; i < 2; i++) {
      const open = i < mappedHands.length && isPalmOpen(mappedHands[i]);
      palmOpenAnim[i] += ((open ? 1 : 0) - palmOpenAnim[i]) * 0.22;
    }

    for (let hIdx = 0; hIdx < mappedHands.length; hIdx++) {
      const anim = palmOpenAnim[hIdx];
      if (anim <= 0.02) continue;
      const hand = mappedHands[hIdx];
      const { cx, cy, scale, angle } = getPalmMetrics(hand);
      const r = Math.max(42, scale * 0.92) * anim;

      if (mode === "holo") {
        drawHoloCube3D(ctx, cx, cy, r, t, anim);
      } else if (mode === "plasma") {
        ctx.save();
        ctx.globalAlpha = anim;
        ctx.globalCompositeOperation = "lighter";
        const orbR = r * 0.42 * (1 + Math.sin(t * 10) * 0.1);
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, orbR * 2.1);
        grad.addColorStop(0, "rgba(255,255,255,0.98)");
        grad.addColorStop(0.32, "rgba(80,220,255,0.85)");
        grad.addColorStop(0.68, "rgba(110,40,255,0.35)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, orbR * 2.1, 0, Math.PI * 2); ctx.fill();
        for (const tipIdx of [4,8,12,16,20]) {
          if (Math.random() > 0.3) drawLightning(ctx, cx, cy, hand[tipIdx].x, hand[tipIdx].y, "rgba(160,240,255,0.9)", 1.7, 6, 14);
        }
        ctx.restore();
      } else if (mode === "hud") {
        ctx.save();
        ctx.globalAlpha = anim;
        ctx.translate(cx, cy);
        ctx.strokeStyle = "#00f0ff"; ctx.fillStyle = "#00f0ff";
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.92, t * 1.6, t * 1.6 + Math.PI * 1.25); ctx.stroke();
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.7, -t * 2.1, -t * 2.1 + Math.PI * 1.4); ctx.stroke();
        ctx.font = "bold 10px ui-monospace, Menlo, monospace";
        ctx.fillText(`ANG:${Math.round((angle * 180) / Math.PI)}°`, r * 0.65, -r * 0.65);
        ctx.fillText(`SCL:${Math.round(scale)}`, r * 0.65, -r * 0.45);
        ctx.restore();
      }
    }
  }

  // =========================================================================
  // 4. APP "AR LAB" DENTRO DEL SPATIAL OS
  // =========================================================================
  APPS.ar = () => {
    createWindow({
      title: "AR Lab · 3D",
      appId: "ar",
      w: 295,
      h: 285,
      buildContent(body) {
        body.innerHTML = `
          <div class="cfgGroup">
            <div class="presetBar arModes">
              <button class="miniBtn ${mode === "off" ? "active" : ""}" data-arm="off">OFF</button>
              <button class="miniBtn ${mode === "katana" ? "active" : ""}" data-arm="katana">KATANA</button>
              <button class="miniBtn ${mode === "gojo" ? "active" : ""}" data-arm="gojo">GOJO</button>
              <button class="miniBtn ${mode === "holo" ? "active" : ""}" data-arm="holo">CUBO 3D</button>
              <button class="miniBtn ${mode === "plasma" ? "active" : ""}" data-arm="plasma">PLASMA</button>
              <button class="miniBtn ${mode === "hud" ? "active" : ""}" data-arm="hud">HUD</button>
            </div>
          </div>
          <div class="cfgGroup arKatanaOpts" style="display:${mode === "katana" ? "flex" : "none"};">
            <div class="presetBar">
              <button class="miniBtn active arSkinBtn">SKIN: ${KATANA_SKINS[katana.skinIndex].name}</button>
              <button class="miniBtn ${katana.reverseGrip ? "active" : ""} arGripBtn">AGARRE: ${katana.reverseGrip ? "INVERTIDO" : "NORMAL"}</button>
              <button class="miniBtn ${katana.summonMode === "fist" ? "active" : ""} arSummonBtn">${katana.summonMode === "fist" ? "1 PUÑO" : "2 PUÑOS"}</button>
              <button class="miniBtn ${katana.occlusion ? "active" : ""} arOccBtn">OCLUSIÓN: ${katana.occlusion ? "ON" : "OFF"}</button>
              <button class="miniBtn ${katana.slowMo ? "active" : ""} arSlowBtn">SLOW: ${katana.slowMo ? "ON" : "OFF"}</button>
              <button class="miniBtn arResetBtn">GUARDAR</button>
            </div>
          </div>
          <div class="arStatusBox">${statusText}</div>
        `;

        const kOpts = body.querySelector(".arKatanaOpts");
        const statusBox = body.querySelector(".arStatusBox");
        const skinBtn = body.querySelector(".arSkinBtn");
        const gripBtn = body.querySelector(".arGripBtn");
        const summonBtn = body.querySelector(".arSummonBtn");
        const occBtn = body.querySelector(".arOccBtn");
        const slowBtn = body.querySelector(".arSlowBtn");

        statusListener = (txt) => { statusBox.textContent = txt; };

        body.querySelectorAll("[data-arm]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const next = btn.dataset.arm;
            setMode(next);
            body.querySelectorAll("[data-arm]").forEach((b) => b.classList.toggle("active", b.dataset.arm === next));
            kOpts.style.display = next === "katana" ? "flex" : "none";
          });
        });

        skinBtn.addEventListener("click", () => {
          katana.skinIndex = (katana.skinIndex + 1) % KATANA_SKINS.length;
          skinBtn.textContent = `SKIN: ${KATANA_SKINS[katana.skinIndex].name}`;
        });

        gripBtn.addEventListener("click", () => {
          katana.reverseGrip = !katana.reverseGrip;
          gripBtn.classList.toggle("active", katana.reverseGrip);
          gripBtn.textContent = `AGARRE: ${katana.reverseGrip ? "INVERTIDO" : "NORMAL"}`;
          // Voltea instantáneamente el ángulo actual si ya está empuñada
          katana.angle += Math.PI;
          for (const slot of katana.hands) {
            if (slot.hasAngle) {
              slot.unwrappedAngle += Math.PI;
              slot.angle += Math.PI;
              slot.fAngle.reset();
            }
          }
        });

        summonBtn.addEventListener("click", () => {
          katana.summonMode = katana.summonMode === "fist" ? "two" : "fist";
          summonBtn.classList.toggle("active", katana.summonMode === "fist");
          summonBtn.textContent = katana.summonMode === "fist" ? "1 PUÑO" : "2 PUÑOS";
          resetKatana();
        });

        occBtn.addEventListener("click", () => {
          katana.occlusion = !katana.occlusion;
          occBtn.classList.toggle("active", katana.occlusion);
          occBtn.textContent = `OCLUSIÓN: ${katana.occlusion ? "ON" : "OFF"}`;
        });

        slowBtn.addEventListener("click", () => {
          katana.slowMo = !katana.slowMo;
          slowBtn.classList.toggle("active", katana.slowMo);
          slowBtn.textContent = `SLOW: ${katana.slowMo ? "ON" : "OFF"}`;
        });

        body.querySelector(".arResetBtn").addEventListener("click", () => {
          resetKatana();
          setStatus("Katana guardada");
        });

        return () => { statusListener = null; };
      }
    });
  };

  return {
    isActive: () => mode !== "off",
    shouldBlockUI: () =>
      (mode === "katana" && katana.state !== "IDLE") ||
      (mode === "gojo" && gojo.state !== "NORMAL"),
    updateAndDraw(ctx, mappedHands, now, cw, ch) {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      if (mode === "off") return;
      if (mode === "katana") stepKatana(ctx, mappedHands, now, dt, cw, ch);
      else if (mode === "gojo") stepGojo(ctx, mappedHands, now, cw, ch);
      else stepPalmHolograms(ctx, mappedHands, now);
    }
  };
}

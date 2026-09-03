// ============================================================================
// Dos realidades — Ejercicio 02 (DPPI 2026)
//
// Una misma cámara alimenta a dos sistemas de visión artificial independientes:
//
//   SISTEMA A (visión corporal): MediaPipe Pose Landmarker.
//     Pregunta: ¿dónde está y cómo está configurado el cuerpo?
//     Representación: una "constelación" orgánica dibujada sobre los
//     landmarks y conexiones del cuerpo detectado.
//
//   SISTEMA B (visión de la imagen): diferencia de luminancia entre frames.
//     Pregunta: ¿dónde está ocurriendo movimiento en la escena?
//     Representación: un campo de partículas que nace en las zonas donde
//     cambia el brillo de un frame a otro.
//
// Ninguno de los dos sistemas dibuja el video RGB original: ambos traducen
// la señal de la cámara en un tipo de dato distinto (landmarks vs. variación
// de píxeles) y ese dato es lo único que se representa visualmente.
// ============================================================================

// Nota: el import de MediaPipe se hace de forma dinámica (más abajo, dentro de
// initPose) en lugar de un `import` estático arriba. Así, si el CDN falla o la
// conexión es lenta, el resto del script (cámara, botón, Sistema B) se carga
// igual y el error queda contenido a esa función en vez de romper todo el módulo.

// ---------------------------------------------------------------------------
// Configuración general
// ---------------------------------------------------------------------------

const VISION_BUNDLE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const MOTION_COLS = 48;
const MOTION_ROWS = 36;
const MOTION_THRESHOLD = 9; // diferencia mínima de luminancia (0-255) para considerar "movimiento"
const MAX_PARTICLES = 900;

// Conexiones curadas del esqueleto (se omiten dedos y malla facial fina
// para que la representación se lea como estructura, no como ruido).
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
  [27, 31], [28, 32],
  [0, 11], [0, 12],
];

// Región del cuerpo -> color, para leer la configuración corporal por zonas.
const REGION_COLORS = {
  head: "#ffd166",
  armL: "#ff8a5c",
  armR: "#ff5c8a",
  torso: "#ffe38a",
  legL: "#5ce1ff",
  legR: "#a78bfa",
};

const LANDMARK_REGION = {
  0: "head",
  11: "torso", 12: "torso", 23: "torso", 24: "torso",
  13: "armL", 15: "armL",
  14: "armR", 16: "armR",
  25: "legL", 27: "legL", 29: "legL", 31: "legL",
  26: "legR", 28: "legR", 30: "legR", 32: "legR",
};

// ---------------------------------------------------------------------------
// Referencias DOM
// ---------------------------------------------------------------------------

const video = document.getElementById("video");
const canvasA = document.getElementById("canvasA");
const ctxA = canvasA.getContext("2d");
const canvasB = document.getElementById("canvasB");
const ctxB = canvasB.getContext("2d");
const hiddenSample = document.getElementById("hiddenSample");
const ctxHidden = hiddenSample.getContext("2d", { willReadFrequently: true });

const startBtn = document.getElementById("startBtn");
const statusMsg = document.getElementById("statusMsg");
const idleHintA = document.getElementById("idleHintA");
const statA = document.getElementById("statA");
const statB = document.getElementById("statB");
const repoLink = document.getElementById("repoLink");

// Si el repo se renombra, basta con editar este valor.
repoLink.href = "https://github.com/";

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

let poseLandmarker = null;
let running = false;
let prevLuma = null;
let particles = [];
let lastVideoTime = -1;
let smoothMotion = 0; // nivel de movimiento suavizado, solo para el indicador de texto

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

startBtn.addEventListener("click", start);

async function start() {
  startBtn.disabled = true;

  setStatus("Solicitando acceso a la cámara…");
  try {
    await initCamera();
  } catch (err) {
    console.error(err);
    setStatus(
      "No se pudo acceder a la cámara: " +
        (err && err.message ? err.message : "revisa los permisos de cámara y vuelve a intentarlo."),
    );
    startBtn.disabled = false;
    return;
  }

  // El Sistema B (diferencia de frames) no depende de ningún recurso externo,
  // así que arrancamos el loop apenas hay cámara: si el Sistema A demora o
  // falla al cargar, B sigue funcionando igual.
  running = true;
  startBtn.textContent = "Cámara activa";
  requestAnimationFrame(renderLoop);

  setStatus("Cámara activa. Cargando el modelo de pose para el Sistema A…");
  try {
    await initPose();
    setStatus("Listo. Ambos sistemas están activos.");
  } catch (err) {
    console.error(err);
    setStatus(
      "El Sistema B está activo. El Sistema A no pudo cargar el modelo de pose " +
        "(revisa tu conexión a internet y recarga la página).",
    );
    idleHintA.textContent = "modelo no disponible";
  }
}

function setStatus(text) {
  statusMsg.textContent = text;
}

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  await new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    video.onloadedmetadata = () => resolve();
  });

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvasA.width = w;
  canvasA.height = h;
  canvasB.width = w;
  canvasB.height = h;
}

async function initPose() {
  const { PoseLandmarker, FilesetResolver } = await import(VISION_BUNDLE_URL);
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch (err) {
    // Algunos navegadores no soportan el delegate GPU vía WebGL: reintentamos con CPU.
    console.warn("Fallo con delegate GPU, reintentando con CPU…", err);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

function renderLoop(timestampMs) {
  if (!running) return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    const result = poseLandmarker ? poseLandmarker.detectForVideo(video, timestampMs) : null;
    drawSystemA(result);

    drawSystemB();
  }

  requestAnimationFrame(renderLoop);
}

// ---------------------------------------------------------------------------
// SISTEMA A — Configuración corporal (MediaPipe Pose)
// ---------------------------------------------------------------------------

function drawSystemA(result) {
  const w = canvasA.width;
  const h = canvasA.height;
  const t = performance.now() / 1000;

  ctxA.fillStyle = "#07060c";
  ctxA.fillRect(0, 0, w, h);

  const landmarks = result && result.landmarks && result.landmarks[0];

  if (!landmarks) {
    idleHintA.style.opacity = "1";
    statA.textContent = "sin cuerpo detectado";
    drawIdlePulse(ctxA, w, h, t);
    return;
  }

  idleHintA.style.opacity = "0";

  const visibleCount = landmarks.filter((p) => (p.visibility ?? 1) > 0.5).length;
  statA.textContent = `${visibleCount} puntos activos`;

  // Halo suave centrado en el torso, respira lentamente con el tiempo.
  const torso = averagePoint(landmarks, [11, 12, 23, 24]);
  if (torso) {
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.4);
    const grad = ctxA.createRadialGradient(
      torso.x * w, torso.y * h, 0,
      torso.x * w, torso.y * h, Math.max(w, h) * 0.35 * pulse,
    );
    grad.addColorStop(0, "rgba(255, 209, 102, 0.10)");
    grad.addColorStop(1, "rgba(255, 209, 102, 0)");
    ctxA.fillStyle = grad;
    ctxA.fillRect(0, 0, w, h);
  }

  // Conexiones: curvas suaves con leve oscilación orgánica, no líneas rígidas.
  CONNECTIONS.forEach(([ia, ib], idx) => {
    const a = landmarks[ia];
    const b = landmarks[ib];
    if (!a || !b) return;
    const vis = ((a.visibility ?? 1) + (b.visibility ?? 1)) / 2;
    if (vis < 0.2) return;

    const ax = a.x * w, ay = a.y * h;
    const bx = b.x * w, by = b.y * h;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;

    // desplazamiento perpendicular oscilante para dar sensación de tejido vivo
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const wobble = Math.sin(t * 1.6 + idx) * Math.min(10, len * 0.12);
    const cx = mx + nx * wobble;
    const cy = my + ny * wobble;

    const colorA = REGION_COLORS[LANDMARK_REGION[ia]] || "#f1ecf7";
    const colorB = REGION_COLORS[LANDMARK_REGION[ib]] || "#f1ecf7";
    const grad = ctxA.createLinearGradient(ax, ay, bx, by);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);

    ctxA.strokeStyle = grad;
    ctxA.globalAlpha = 0.35 + vis * 0.5;
    ctxA.lineWidth = 1.5 + vis * 3;
    ctxA.lineCap = "round";
    ctxA.shadowColor = colorA;
    ctxA.shadowBlur = 12;
    ctxA.beginPath();
    ctxA.moveTo(ax, ay);
    ctxA.quadraticCurveTo(cx, cy, bx, by);
    ctxA.stroke();
  });

  ctxA.globalAlpha = 1;
  ctxA.shadowBlur = 0;

  // Landmarks: nodos brillantes, tamaño según visibilidad y profundidad (z).
  Object.keys(LANDMARK_REGION).forEach((key) => {
    const i = Number(key);
    const p = landmarks[i];
    if (!p) return;
    const vis = p.visibility ?? 1;
    if (vis < 0.15) return;

    const depthScale = clamp(1 - (p.z ?? 0) * 1.6, 0.55, 1.9);
    const r = (3 + vis * 5) * depthScale;
    const color = REGION_COLORS[LANDMARK_REGION[i]] || "#f1ecf7";

    ctxA.beginPath();
    ctxA.fillStyle = color;
    ctxA.globalAlpha = 0.55 + vis * 0.45;
    ctxA.shadowColor = color;
    ctxA.shadowBlur = 18;
    ctxA.arc(p.x * w, p.y * h, Math.max(1.5, r), 0, Math.PI * 2);
    ctxA.fill();
  });

  ctxA.globalAlpha = 1;
  ctxA.shadowBlur = 0;
}

function drawIdlePulse(ctx, w, h, t) {
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < 3; i++) {
    const phase = t * 0.9 + i * 0.7;
    const r = 20 + ((phase * 40) % 140);
    const alpha = clamp(1 - r / 160, 0, 0.5);
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 209, 102, ${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function averagePoint(landmarks, indices) {
  const pts = indices.map((i) => landmarks[i]).filter(Boolean);
  if (!pts.length) return null;
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// SISTEMA B — Campo de movimiento (diferencia de frames)
// ---------------------------------------------------------------------------

function drawSystemB() {
  const w = canvasB.width;
  const h = canvasB.height;

  // Muestreamos el video en baja resolución solo para obtener datos de brillo.
  ctxHidden.drawImage(video, 0, 0, MOTION_COLS, MOTION_ROWS);
  const frame = ctxHidden.getImageData(0, 0, MOTION_COLS, MOTION_ROWS).data;

  const cellCount = MOTION_COLS * MOTION_ROWS;
  if (!prevLuma) prevLuma = new Float32Array(cellCount);

  const cellW = w / MOTION_COLS;
  const cellH = h / MOTION_ROWS;
  let totalDiff = 0;
  let activeCells = 0;

  for (let i = 0; i < cellCount; i++) {
    const px = i * 4;
    const luma = 0.299 * frame[px] + 0.587 * frame[px + 1] + 0.114 * frame[px + 2];
    const diff = Math.abs(luma - prevLuma[i]);
    prevLuma[i] = luma;

    if (diff > MOTION_THRESHOLD) {
      totalDiff += diff;
      activeCells++;

      const col = i % MOTION_COLS;
      const row = Math.floor(i / MOTION_COLS);
      const spawnCount = Math.min(3, Math.round(diff / 22));

      for (let s = 0; s < spawnCount; s++) {
        spawnParticle(
          (col + 0.5) * cellW + (Math.random() - 0.5) * cellW,
          (row + 0.5) * cellH + (Math.random() - 0.5) * cellH,
          diff,
        );
      }
    }
  }

  smoothMotion = smoothMotion * 0.85 + (activeCells / cellCount) * 0.15;
  statB.textContent = `${Math.round(smoothMotion * 100)}% de la escena en movimiento`;

  // Fondo con desvanecimiento: deja estela, refuerza la idea de campo temporal.
  ctxB.fillStyle = "rgba(5, 4, 10, 0.16)";
  ctxB.fillRect(0, 0, w, h);

  if (particles.length > MAX_PARTICLES) {
    particles.splice(0, particles.length - MAX_PARTICLES);
  }

  particles = particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life--;

    if (p.life <= 0 || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
      return false;
    }

    const alpha = p.life / p.maxLife;
    ctxB.beginPath();
    ctxB.fillStyle = `hsla(${p.hue}, 85%, 62%, ${alpha * 0.85})`;
    ctxB.shadowColor = `hsla(${p.hue}, 85%, 62%, ${alpha})`;
    ctxB.shadowBlur = 9;
    ctxB.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctxB.fill();
    return true;
  });

  ctxB.shadowBlur = 0;
}

function spawnParticle(x, y, magnitude) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.3 + Math.min(2.2, magnitude / 40);
  const hue = clamp(250 - magnitude * 2.2, 20, 250); // más movimiento -> tonos cálidos

  const life = 40 + Math.random() * 50;

  particles.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue,
    size: 1.4 + Math.min(3.5, magnitude / 20),
    life,
    maxLife: life,
  });
}

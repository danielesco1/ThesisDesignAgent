// ---------------------------------------------------------
// script.js  (ES module) — House Graph Inspector
// ---------------------------------------------------------

// =============== Tiny DOM utils ===============
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uuid = () =>
  crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const debounce = (fn, ms = 150) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
// text escaper for safe innerHTML injections
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// --- Minimal inline SVG icon set (24x24, currentColor) ---
const ICON = {
  rooms:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 5h8v3h-8v-3Z"/></svg>',
  floors:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/></svg>',
  edges:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7a3 3 0 1 1 4.9 2.3L11 12l2.7 2.7A3 3 0 1 1 12 17l-2.3-2.3L7 13a3 3 0 1 1 0-6Z"/></svg>',
  location:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/></svg>',
  users:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></svg>',
  climate:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4V1m0 22v-3M4 12H1m22 0h-3M5.6 5.6 3.8 3.8m16.4 16.4-1.8-1.8M18.4 5.6l1.8-1.8M3.8 20.2l1.8-1.8M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"/></svg>',
  roof:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12 12 4l10 8v8h-6v-6H8v6H2v-8Z"/></svg>',
  facade:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4V4Zm0 6h16v4H4v-4Zm0 6h16v4H4v-4Z"/></svg>',
  overlaps:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h8v8H7V7Z"/><path d="M9 9h8v8H9V9" opacity=".65"/></svg>',
};

// ---- Style / Theme ---------------------------------------------------------
const THEMES = {
  dark: {
    bg: 0x1a1a1a,
    thumbBg: 0x111111,
    edgeColor: 0xff00ff,
    edgeOpacity: 0.6,
    edgeOpacityVol: 0.25,
    planOutline: 0xffffff,
    planFillOpacity: 0.22,
    volumeOpacity: 0.95,
    isLight: false,
  },
  light: {
    bg: 0xffffff,
    thumbBg: 0xffffff,
    edgeColor: 0xff00ff,
    edgeOpacity: 0.85,
    edgeOpacityVol: 0.35,
    planOutline: 0x000000, // black outlines on white
    planFillOpacity: 0.3,
    volumeOpacity: 0.98,
    isLight: true,
    volumeEdgeColor: 0x000000,
    volumeEdgeOpacity: 0.45,
  },
};

// pick your default theme here
let CURRENT = THEMES.light;

// constants that don't change with theme
const STYLE = {
  xyScale: 0.3, // plan scale (Rhino X/Z -> three X/Z)
  levelRise: 3,
  nodeRadius: 0.2,
  nodeSegs: 12,
  floorIsIndex: false, // explicitly declare to avoid confusion
};

// simple helpers
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const colorOf = (n) =>
  new THREE.Color(
    n.color ||
      (n.privacy_level === "private"
        ? "#ff6b6b"
        : n.privacy_level === "semi_private"
        ? "#f5a623"
        : "#667eea")
  );

// set initial theme attribute for CSS hooks
document.body.dataset.theme = "light";

/** Swap theme and re-render everything that depends on it */
function applyTheme(name) {
  CURRENT = THEMES[name] || CURRENT;
  document.body.dataset.theme = name; // 'dark' | 'light'

  // thumbnails
  if (window.app?.thumbnailCache) window.app.thumbnailCache.setTheme(CURRENT);

  // gallery
  window.app?.renderGallery?.();

  // detail modal re-render
  if (window.app?._detailHouse) {
    const h = window.app._detailHouse;
    const mode = window.app._currentDetailMode || "volumes";
    window.app.renderDetail(h, mode);
  }

  // live SceneView
  if (window.app?._sceneView) {
    const sv = window.app._sceneView;
    sv.scene.background.set(CURRENT.bg);
    sv.renderer.setClearColor(CURRENT.bg, 1);
  }

  // open comparison panels
  if (window.app?._panelRenderers?.length) {
    for (const { renderer, scene } of window.app._panelRenderers) {
      scene.background.set(CURRENT.bg);
      renderer.setClearColor(CURRENT.bg, 1);
    }
  }

  const t = document.getElementById("themeToggle");
  if (t) t.checked = CURRENT.isLight;
}
window.applyTheme = applyTheme;

// =============== Label sprites ===============
function makeLabelSprite(
  text,
  { fontPx = 18, maxWidthPx = 240, padX = 10, padY = 7, lineGap = 4 } = {}
) {
  const words = String(text || "").replace(/_/g, " ").trim().split(/\s+/);
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");

  // Measure once at 1x
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width + padX * 2 > maxWidthPx && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);

  const textW = Math.min(
    maxWidthPx,
    Math.max(...lines.map((l) => ctx.measureText(l).width))
  );
  const textH = lines.length * fontPx + (lines.length - 1) * lineGap;

  // HiDPI canvas for crisp text
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.ceil((textW + padX * 2) * ratio);
  c.height = Math.ceil((textH + padY * 2) * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const w = c.width / ratio,
    h = c.height / ratio;

  // pill bg
  const r = 10;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = CURRENT.isLight ? "rgba(0,0,0,0.78)" : "rgba(0,0,0,0.70)";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fill();

  // text + subtle glow
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.font = `700 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let y = padY;
  const x = w / 2;
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += fontPx + lineGap;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  tex.needsUpdate = true;

  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    })
  );
  spr.scale.set(0.001, 0.001, 1); // initial; scaled per-frame
  spr.userData.aspect = w / h; // keep aspect when scaling
  return spr;
}

/**
 * Scale/visibility for labels in both perspective and orthographic cameras.
 */
function updateLabelScales(labels, camera) {
  if (!labels || !labels.length || !camera) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const isOrtho = !!camera.isOrthographicCamera;

  if (isOrtho) {
    const span = camera.top - camera.bottom; // vertical span in world units
    const h = clamp(span * 0.02, 0.14, 0.6);
    const alpha = smoothstep(180, 25, span);
    const visible = alpha > 0.08;
    const maxVisible = clamp(Math.round(28 - span * 0.12), 6, 28);

    const L = labels.length;
    const keepEvery = L > maxVisible ? Math.ceil(L / maxVisible) : 1;

    for (let i = 0; i < L; i++) {
      const spr = labels[i];
      const show = visible && i % keepEvery === 0;
      spr.visible = !!show;
      if (!show) continue;

      const aspect = spr.userData.aspect || 2.5;
      spr.scale.set(h * aspect, h, 1);
      spr.lookAt(camera.position);
      if (spr.material) spr.material.opacity = alpha;
    }
    return;
  }

  // Perspective path
  const maxVisible = 10;
  const sorted = labels
    .map((spr) => ({
      spr,
      dist: spr.position.distanceTo(camera.position),
    }))
    .sort((a, b) => a.dist - b.dist);

  sorted.forEach((item, i) => {
    const { spr, dist } = item;
    const h = Math.max(0.12, Math.min(0.35, dist * 0.02));
    const aspect = spr.userData.aspect || 2.5;
    spr.scale.set(h * aspect, h, 1);
    spr.lookAt(camera.position);

    if (i < maxVisible) {
      spr.visible = true;
      if (spr.material) spr.material.opacity = 1 - (i / maxVisible) * 0.35;
    } else {
      spr.visible = false;
    }
  });
}

// =============== Builders (pure) ===============
const Builders = {
  // === graph ===
  graph(scene, data, pickables, labels) {
    const out = [];
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];
    const id2 = new Map(nodes.map((n) => [n.id, n]));
    const sphereGeom = new THREE.SphereGeometry(
      STYLE.nodeRadius,
      STYLE.nodeSegs,
      STYLE.nodeSegs
    );

    // nodes
    for (const n of nodes) {
      const m = new THREE.Mesh(
        sphereGeom,
        new THREE.MeshBasicMaterial({ color: colorOf(n) })
      );
      m.position.set(
        num(n.center?.[0]) * STYLE.xyScale,
        num(n.floor) * STYLE.levelRise,
        num(n.center?.[1]) * STYLE.xyScale
      );
      m.userData.node = n;
      m.renderOrder = 1; // after lines
      scene.add(m);
      out.push(m);
      if (pickables) pickables.push(m);

      if (labels) {
        const spr = makeLabelSprite(String(n.id || n.type || ""));
        spr.position.copy(m.position).add(new THREE.Vector3(0, 1.2, 0));
        spr.renderOrder = 999;
        if (spr.material) spr.material.depthTest = false;
        scene.add(spr);
        out.push(spr);
        labels.push(spr);
      }
    }

    // edges
    if (edges.length) {
      const pos = [];
      for (const [a, b] of edges) {
        const A = id2.get(a),
          B = id2.get(b);
        if (!A || !B) continue;
        pos.push(
          num(A.center?.[0]) * STYLE.xyScale,
          num(A.floor) * STYLE.levelRise,
          num(A.center?.[1]) * STYLE.xyScale,
          num(B.center?.[0]) * STYLE.xyScale,
          num(B.floor) * STYLE.levelRise,
          num(B.center?.[1]) * STYLE.xyScale
        );
      }
      if (pos.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        const lines = new THREE.LineSegments(
          g,
          new THREE.LineBasicMaterial({
            color: CURRENT.edgeColor,
            transparent: true,
            opacity: CURRENT.edgeOpacity,
          })
        );
        lines.renderOrder = 0;
        scene.add(lines);
        out.push(lines);
      }
    }
    return out;
  },

  // === volumes ===
  volumes(scene, data, pickables, labels) {
    const out = [];
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];

    for (const n of nodes) {
      const w =
        num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4) * STYLE.xyScale;
      const d =
        num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4) * STYLE.xyScale;
      const h = num(n.height ?? n.room_height ?? 3);
      const x = num(n.center?.[0], 0) * STYLE.xyScale;
      const z = num(n.center?.[1], 0) * STYLE.xyScale;
      const y = num(n.floor, 0) * STYLE.levelRise + 0.5 * h;

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(w, 0.05), Math.max(h, 0.05), Math.max(d, 0.05)),
        new THREE.MeshStandardMaterial({
          color: colorOf(n),
          transparent: true,
          opacity: CURRENT.volumeOpacity,
          roughness: 0.95,
          metalness: 0.0,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
      );
      box.castShadow = true;
      box.receiveShadow = false;
      box.position.set(x, y, z);
      box.userData.node = n;
      box.renderOrder = 1;
      scene.add(box);
      out.push(box);
      if (pickables) pickables.push(box);

      if (CURRENT.isLight) {
        const eg = new THREE.EdgesGeometry(box.geometry);
        const el = new THREE.LineSegments(
          eg,
          new THREE.LineBasicMaterial({
            color: CURRENT.volumeEdgeColor ?? 0x000000,
            transparent: true,
            opacity: CURRENT.volumeEdgeOpacity ?? 0.45,
          })
        );
        el.position.copy(box.position);
        el.quaternion.copy(box.quaternion);
        el.scale.copy(box.scale);
        el.renderOrder = 1;
        scene.add(el);
        out.push(el);
      }

      if (labels) {
        const spr = makeLabelSprite(String(n.id || n.type || ""));
        spr.position.set(x, y + h * 0.65, z);
        spr.renderOrder = 999;
        if (spr.material) spr.material.depthTest = false;
        scene.add(spr);
        out.push(spr);
        labels.push(spr);
      }
    }

    // mid-height links
    if (edges.length) {
      const id2 = new Map(nodes.map((n) => [n.id, n]));
      const pos = [];
      for (const [a, b] of edges) {
        const A = id2.get(a),
          B = id2.get(b);
        if (!A || !B) continue;

        const hA = num(A.height ?? A.room_height ?? 3);
        const hB = num(B.height ?? B.room_height ?? 3);

        const xA = num(A.center?.[0], 0) * STYLE.xyScale;
        const zA = num(A.center?.[1], 0) * STYLE.xyScale;
        const xB = num(B.center?.[0], 0) * STYLE.xyScale;
        const zB = num(B.center?.[1], 0) * STYLE.xyScale;

        const yA = num(A.floor, 0) * STYLE.levelRise + 0.5 * hA;
        const yB = num(B.floor, 0) * STYLE.levelRise + 0.5 * hB;

        pos.push(xA, yA, zA, xB, yB, zB);
      }
      if (pos.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        const lines = new THREE.LineSegments(
          g,
          new THREE.LineBasicMaterial({
            color: CURRENT.edgeColor,
            transparent: true,
            opacity: CURRENT.edgeOpacityVol,
          })
        );
        lines.renderOrder = 0;
        scene.add(lines);
        out.push(lines);
      }
    }
    return out;
  },

  // === wireframe ===
  wireframe(scene, data, pickables, labels) {
    const out = [];
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];

    const wireColor = CURRENT.wireColor ?? (CURRENT.isLight ? 0x000000 : 0xffffff);
    const wireOpacity = CURRENT.wireOpacity ?? (CURRENT.isLight ? 0.55 : 0.45);

    for (const n of nodes) {
      const w =
        num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4) * STYLE.xyScale;
      const d =
        num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4) * STYLE.xyScale;
      const h = num(n.height ?? n.room_height ?? 3);
      const x = num(n.center?.[0], 0) * STYLE.xyScale;
      const z = num(n.center?.[1], 0) * STYLE.xyScale;
      const y = num(n.floor, 0) * STYLE.levelRise + 0.5 * h;
      const yBottom = STYLE.floorIsIndex
        ? num(n.floor, 0) * STYLE.levelRise
        : num(n.floor, 0);
      const roomColor = colorOf(n);

      // wireframe edges
      const boxGeo = new THREE.BoxGeometry(Math.max(w, 0.05), Math.max(h, 0.05), Math.max(d, 0.05));
      const edgeGeo = new THREE.EdgesGeometry(boxGeo);
      const wire = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: wireOpacity })
      );
      wire.position.set(x, y, z);
      wire.userData.node = n;
      wire.renderOrder = 0;
      scene.add(wire);
      out.push(wire);

      // invisible proxy for picking
      const proxy = new THREE.Mesh(boxGeo.clone(), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.copy(wire.position);
      proxy.userData.node = n;
      if (pickables) pickables.push(proxy);
      scene.add(proxy);
      out.push(proxy);

      // bottom face plate
      const plateGeo = new THREE.PlaneGeometry(Math.max(w, 0.05), Math.max(d, 0.05));
      plateGeo.rotateX(-Math.PI / 2);
      const plate = new THREE.Mesh(
        plateGeo,
        new THREE.MeshBasicMaterial({
          color: roomColor,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        })
      );
      plate.position.set(x, yBottom + 0.0006, z);
      plate.renderOrder = -1;
      scene.add(plate);
      out.push(plate);

      // crisp outline of the bottom face
      const hw = w / 2,
        hd = d / 2;
      const outlinePos = new Float32Array([
        -hw, 0, -hd, hw, 0, -hd, hw, 0, -hd, hw, 0, hd, hw, 0, hd, -hw, 0, hd, -hw, 0, hd, -hw, 0, -hd,
      ]);
      const outlineGeo = new THREE.BufferGeometry();
      outlineGeo.setAttribute("position", new THREE.Float32BufferAttribute(outlinePos, 3));
      const outline = new THREE.LineSegments(
        outlineGeo,
        new THREE.LineBasicMaterial({
          color: CURRENT.planOutline,
          transparent: true,
          opacity: CURRENT.floorLineOpacity ?? 0.45,
        })
      );
      outline.position.set(x, yBottom + 0.0006, z);
      outline.renderOrder = 0;
      scene.add(outline);
      out.push(outline);
    }

    // overlay the graph (nodes + edges)
    out.push(...this.graph(scene, data, pickables, labels));

    return out;
  },

  // === plan ===
  plan(scene, data, pickables, labels) {
    const out = [];
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];

    // room planes + outlines
    for (const n of nodes) {
      const w =
        num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4) * STYLE.xyScale;
      const d =
        num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4) * STYLE.xyScale;
      const x = num(n.center?.[0], 0) * STYLE.xyScale;
      const z = num(n.center?.[1], 0) * STYLE.xyScale;
      const y = 0.001; // tiny lift

      // filled plane
      const pg = new THREE.PlaneGeometry(Math.max(w, 0.02), Math.max(d, 0.02));
      pg.rotateX(-Math.PI / 2);
      const plane = new THREE.Mesh(
        pg,
        new THREE.MeshBasicMaterial({
          color: colorOf(n),
          transparent: true,
          opacity: CURRENT.planFillOpacity,
        })
      );
      plane.position.set(x, y, z);
      plane.userData.node = n;
      scene.add(plane);
      out.push(plane);
      if (pickables) pickables.push(plane);

      // outline
      const hw = w / 2,
        hd = d / 2;
      const pos = new Float32Array([
        -hw, y, -hd, hw, y, -hd, hw, y, -hd, hw, y, hd, hw, y, hd, -hw, y, hd, -hw, y, hd, -hw, y, -hd,
      ]);
      const og = new THREE.BufferGeometry();
      og.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const ol = new THREE.LineSegments(
        og,
        new THREE.LineBasicMaterial({
          color: CURRENT.planOutline,
          transparent: true,
          opacity: CURRENT.edgeOpacity,
        })
      );
      ol.position.set(x, 0, z);
      scene.add(ol);
      out.push(ol);

      // label (always on top)
      if (labels) {
        const spr = makeLabelSprite(String(n.id || n.type || ""));
        spr.position.set(x, y + 0.02, z);
        spr.renderOrder = 999;
        if (spr.material) {
          spr.material.depthTest = false;
          spr.material.depthWrite = false;
        }
        scene.add(spr);
        out.push(spr);
        labels.push(spr);
      }
    }

    // edges on plan
    if (edges.length) {
      const id2 = new Map(nodes.map((n) => [n.id, n]));
      const pos = [];
      for (const [a, b] of edges) {
        const A = id2.get(a),
          B = id2.get(b);
        if (!A || !B) continue;
        const xA = num(A.center?.[0], 0) * STYLE.xyScale;
        const zA = num(A.center?.[1], 0) * STYLE.xyScale;
        const xB = num(B.center?.[0], 0) * STYLE.xyScale;
        const zB = num(B.center?.[1], 0) * STYLE.xyScale;
        pos.push(xA, 0.01, zA, xB, 0.01, zB);
      }
      if (pos.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        const lines = new THREE.LineSegments(
          g,
          new THREE.LineBasicMaterial({
            color: CURRENT.edgeColor,
            transparent: true,
            opacity: CURRENT.edgeOpacity,
          })
        );
        scene.add(lines);
        out.push(lines);
      }
    }

    return out;
  },
};

// =============== SceneView ===============
class SceneView {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CURRENT.bg);
    this.renderer.setClearColor(CURRENT.bg, 1);
    this.camera = new THREE.PerspectiveCamera(60, this._aspect(), 0.1, 1000);
    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);

    // Light
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));

    // Controls (ensure OrbitControls is loaded)
    if (!THREE.OrbitControls) {
      console.warn("THREE.OrbitControls not found. Include it before script.js.");
    }
    this.controls = new THREE.OrbitControls(this.camera, canvas);

    this.disposables = [];
    this.pickables = [];
    this.labels = [];
    this.onPick = null;

    this._click = (e) => this._handlePick(e);
    canvas.addEventListener("click", this._click);

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas.parentElement || canvas); // observe host for true layout size

    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.controls.update();

      // resize renderer to client
      const w = this.canvas.clientWidth || 1;
      const h = this.canvas.clientHeight || 1;
      this.renderer.setSize(w, h, false);

      // deferred fit once size is valid
      if (this._pendingFitMode) {
        if (w > 0 && h > 0) {
          const mode = this._pendingFitMode;
          this._pendingFitMode = null;
          this.fitToContent(mode);
        }
      }

      if (this.labels.length) updateLabelScales(this.labels, this.camera);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  // Compute tight world-space bounds (center + radius) for 3D fit
  computeWorldBounds(data) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    if (!nodes.length)
      return { center: [0, 0, 0], radius: 10, aabb: { min: [0, 0, 0], max: [0, 0, 0] } };

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (const n of nodes) {
      const w = Math.max(num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4), 0.001);
      const d = Math.max(num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4), 0.001);
      const h = Math.max(num(n.height ?? n.room_height ?? 3, 3), 0.001);
      const cx = num(n.center?.[0], 0);
      const cz = num(n.center?.[1], 0);

      const y0 = STYLE.floorIsIndex ? num(n.floor, 0) * STYLE.levelRise : num(n.floor, 0);
      const y1 = y0 + h;

      minX = Math.min(minX, cx - w / 2);
      maxX = Math.max(maxX, cx + w / 2);
      minZ = Math.min(minZ, cz - d / 2);
      maxZ = Math.max(maxZ, cz + d / 2);
      minY = Math.min(minY, y0);
      maxY = Math.max(maxY, y1);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = Math.max(0.01, maxX - minX);
    const spanY = Math.max(0.01, maxY - minY);
    const spanZ = Math.max(0.01, maxZ - minZ);
    const radius = Math.max(spanX, spanY, spanZ) * 0.6;

    return {
      center: [cx, cy, cz],
      radius,
      aabb: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    };
  }

  // Plan bounds (XZ)
  computePlanBounds(data) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    if (!nodes.length) return { min: { x: -1, z: -1 }, max: { x: 1, z: 1 } };

    const eps = 0.001;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    for (const n of nodes) {
      const w = Math.max(num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4), eps);
      const d = Math.max(num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4), eps);
      const x = num(n.center?.[0], 0);
      const z = num(n.center?.[1], 0);
      minX = Math.min(minX, x - w / 2);
      maxX = Math.max(maxX, x + w / 2);
      minZ = Math.min(minZ, z - d / 2);
      maxZ = Math.max(maxZ, z + d / 2);
    }
    return { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } };
  }

  // Fit camera to content (plan or 3D) while keeping controls
  fitToContent(mode = this._currentDetailMode || "volumes") {
    const data = this._lastData;
    if (!data) return;

    if (mode === "plan") {
      const bounds = this.computePlanBounds(data);
      this.setOrthoByBounds(bounds, 0.8);
      return;
    }

    // 3D
    const wb = this.computeWorldBounds(data);
    const [cx, cy, cz] = wb.center;
    const r = Math.max(0.001, wb.radius);

    const fov = (this.camera.isPerspectiveCamera ? this.camera.fov : 60) * (Math.PI / 180);
    const aspect = this._aspect();

    // determine camera distance to fit radius across FOV (use horizontal FOV as heuristic)
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const dist = Math.max(r / Math.tan(hFov / 2), (r * 1.2) / Math.tan(fov / 2)) * 1.6;

    const eye = [cx + dist, cy + dist * 0.8, cz + dist];

    this.setPerspective(eye, [cx, cy, cz]);

    if (this.camera.isPerspectiveCamera) {
      this.camera.near = Math.max(0.01, dist * 0.01);
      this.camera.far = dist * 100;
      this.camera.updateProjectionMatrix();
    }
    this.controls.target.set(cx, cy, cz);
    this.controls.update();
  }

  queueFit(mode) {
    this._pendingFitMode = mode || this._currentDetailMode || "volumes";
  }

  _aspect() {
    return (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1);
  }

  _resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);

    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.camera.isOrthographicCamera && this._savedOrtho) {
      const { cx, cz, contentHalfW, contentHalfH } = this._savedOrtho;
      const aspect = w / h;
      let halfW = contentHalfW,
        halfH = contentHalfH;
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      else halfW = halfH * aspect;

      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
      this.camera.updateProjectionMatrix();

      this.camera.position.set(cx, this.camera.position.y, cz);
      this.controls.target.set(cx, 0, cz);
      this.controls.update();
    }
  }

  _handlePick(e) {
    if (!this.onPick || !this.pickables.length) return;
    const r = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    const hit = ray.intersectObjects(this.pickables, false)[0];
    if (hit) this.onPick(hit.object.userData.node || {});
  }

  clearScene() {
    for (const o of this.disposables) {
      o.parent && o.parent.remove(o);
      o.geometry?.dispose?.();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
    }
    this.disposables.length = 0;
    this.pickables.length = 0;
    this.labels.length = 0;
  }

  requestRender() {
    // no-op; RAF loop continuously renders
  }

  resetCamera() {
    if (this.camera?.isOrthographicCamera) {
      this._savedOrtho = null;
      this.setPerspective([20, 20, 20], [0, 0, 0]);
    } else {
      this.setPerspective([20, 20, 20], [0, 0, 0]);
    }
  }

  setPerspective(pos = [20, 20, 20], look = [0, 0, 0]) {
    const aspect = this._aspect();

    if (!this.camera || !this.camera.isPerspectiveCamera) {
      this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
      this.controls.object = this.camera;
    } else {
      this.camera.aspect = aspect;
    }

    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(look[0], look[1], look[2]);
    this.camera.updateProjectionMatrix();

    // orbit / target
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.target.set(look[0], look[1], look[2]);
    this.controls.update();
  }

  setOrthoByBounds(bounds, pad = 1) {
    const { min, max } = bounds;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;

    // content size (world units) + padding
    let w = max.x - min.x + pad * 2;
    let h = max.z - min.z + pad * 2;
    if (w <= 0) w = 0.02;
    if (h <= 0) h = 0.02;

    const contentHalfW = w / 2;
    const contentHalfH = h / 2;

    const aspect = this._aspect();
    let halfW = contentHalfW,
      halfH = contentHalfH;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;

    let cam = this.camera;
    if (!cam || !cam.isOrthographicCamera) {
      cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -100, 1000);
    } else {
      cam.left = -halfW;
      cam.right = halfW;
      cam.top = halfH;
      cam.bottom = -halfH;
    }

    cam.position.set(cx, 100, cz);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, 0, cz);
    cam.updateProjectionMatrix();

    this.camera = cam;
    this.controls.object = cam;
    this.controls.enableRotate = false;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.target.set(cx, 0, cz);
    this.controls.update();

    this._savedOrtho = { cx, cz, contentHalfW, contentHalfH };
  }

  build(mode, data) {
    this._lastData = data;
    this.clearScene();

    this.pickables = [];
    this.labels = [];

    let made = [];
    if (mode === "graph") made = Builders.graph(this.scene, data, this.pickables, this.labels);
    else if (mode === "volumes") made = Builders.volumes(this.scene, data, this.pickables, this.labels);
    else if (mode === "wireframe") made = Builders.wireframe(this.scene, data, this.pickables, this.labels);
    else if (mode === "plan") made = Builders.plan(this.scene, data, this.pickables, this.labels);

    this.disposables.push(...made);
  }

  // --- Selection highlight (created on demand, removed on next click)
  clearHighlight() {
    if (this._hl) {
      this._hl.traverse((o) => {
        o.geometry?.dispose?.();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
      });
      this.scene.remove(this._hl);
    }
    this._hl = null;
    this.requestRender?.();
  }

  // node: picked node; mode: 'plan' | 'volumes' | 'wireframe' | 'graph'
  highlightRoom(node, mode = "volumes") {
    this.clearHighlight();
    if (!node) return;

    const group = new THREE.Group();
    group.renderOrder = 998;
    this._hl = group;
    this.scene.add(group);

    const XY = STYLE.xyScale,
      LVH = STYLE.levelRise;
    const _n = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

    const w = _n(node.width?.[0] ?? node.width ?? node.w ?? node.size?.[0], 4) * XY;
    const d = _n(node.width?.[1] ?? node.depth ?? node.size?.[1], 4) * XY;
    const h = _n(node.height ?? node.room_height ?? 3);
    const x = _n(node.center?.[0], 0) * XY;
    const z = _n(node.center?.[1], 0) * XY;
    const yBottom = _n(node.floor, 0) * LVH;
    const yCenter = yBottom + 0.5 * h;

    const ACCENT = 0x00ffd5;

    if (mode === "plan") {
      const pg = new THREE.PlaneGeometry(Math.max(w, 0.02), Math.max(d, 0.02));
      pg.rotateX(-Math.PI / 2);
      const fill = new THREE.Mesh(
        pg,
        new THREE.MeshBasicMaterial({
          color: ACCENT,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        })
      );
      fill.position.set(x, 0.015, z);
      group.add(fill);

      const hw = w / 2,
        hd = d / 2;
      const pos = new Float32Array([
        -hw, 0, -hd, hw, 0, -hd, hw, 0, -hd, hw, 0, hd, hw, 0, hd, -hw, 0, hd, -hw, 0, hd, -hw, 0, -hd,
      ]);
      const og = new THREE.BufferGeometry();
      og.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const outline = new THREE.LineSegments(
        og,
        new THREE.LineBasicMaterial({
          color: ACCENT,
          transparent: true,
          opacity: 0.9,
        })
      );
      outline.position.set(x, 0.02, z);
      group.add(outline);
    } else if (mode === "graph") {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(STYLE.nodeRadius * 1.6, 18, 18),
        new THREE.MeshBasicMaterial({
          color: ACCENT,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        })
      );
      halo.position.set(_n(node.center?.[0]) * XY, _n(node.floor) * LVH, _n(node.center?.[1]) * XY);
      group.add(halo);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(STYLE.nodeRadius * 1.45, STYLE.nodeRadius * 1.7, 32),
        new THREE.MeshBasicMaterial({
          color: ACCENT,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(halo.position).add(new THREE.Vector3(0, 0.01, 0));
      group.add(ring);
    } else {
      const boxGeo = new THREE.BoxGeometry(Math.max(w, 0.05), Math.max(h, 0.05), Math.max(d, 0.05));
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 })
      );
      edge.position.set(x, yCenter, z);
      group.add(edge);

      const plateG = new THREE.PlaneGeometry(Math.max(w, 0.05), Math.max(d, 0.05));
      plateG.rotateX(-Math.PI / 2);
      const plate = new THREE.Mesh(
        plateG,
        new THREE.MeshBasicMaterial({
          color: ACCENT,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        })
      );
      plate.position.set(x, yBottom + 0.002, z);
      group.add(plate);
    }

    group.traverse((o) => {
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.depthTest = true;
        });
      }
      o.renderOrder = 998;
    });

    this.requestRender?.();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.canvas.removeEventListener("click", this._click);
    this.clearScene();
    this.controls.dispose();
    this.renderer.dispose();
  }
}

// =============== ThumbnailCache ===============
class ThumbnailCache {
  constructor(maxSize = 50) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "low-power",
    });
    this.w = 200;
    this.h = 150;
    this.renderer.setSize(this.w, this.h, false);
    this.setTheme(CURRENT); // initialize
  }

  setTheme(theme) {
    this.cache.clear();
    this.renderer.setClearColor(theme.thumbBg, 1);
    this.theme = theme;
  }

  _num(v, d = 0) {
    return Number.isFinite(+v) ? +v : d;
  }

  // Bounds over XZ (plan) from node widths/centers
  _planBounds(data) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    if (!nodes.length) return { min: { x: -1, z: -1 }, max: { x: 1, z: 1 } };
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const n of nodes) {
      const w = this._num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4);
      const d = this._num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4);
      const x = this._num(n.center?.[0], 0);
      const z = this._num(n.center?.[1], 0);
      minX = Math.min(minX, x - w / 2);
      maxX = Math.max(maxX, x + w / 2);
      minZ = Math.min(minZ, z - d / 2);
      maxZ = Math.max(maxZ, z + d / 2);
    }
    return { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } };
  }

  // 3D world bounds (mirror SceneView)
  _worldBounds(data) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    if (!nodes.length)
      return { center: [0, 0, 0], radius: 10, aabb: { min: [0, 0, 0], max: [0, 0, 0] } };

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const n of nodes) {
      const w = Math.max(this._num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4), 0.001);
      const d = Math.max(this._num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4), 0.001);
      const h = Math.max(this._num(n.height ?? n.room_height ?? 3, 3), 0.001);
      const cx = this._num(n.center?.[0], 0);
      const cz = this._num(n.center?.[1], 0);

      const y0 = STYLE.floorIsIndex ? this._num(n.floor, 0) * STYLE.levelRise : this._num(n.floor, 0);
      const y1 = y0 + h;

      minX = Math.min(minX, cx - w / 2);
      maxX = Math.max(maxX, cx + w / 2);
      minZ = Math.min(minZ, cz - d / 2);
      maxZ = Math.max(maxZ, cz + d / 2);
      minY = Math.min(minY, y0);
      maxY = Math.max(maxY, y1);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = Math.max(0.01, maxX - minX);
    const spanY = Math.max(0.01, maxY - minY);
    const spanZ = Math.max(0.01, maxZ - minZ);
    const radius = Math.max(spanX, spanY, spanZ) * 0.6;

    return {
      center: [cx, cy, cz],
      radius,
      aabb: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    };
  }

  _render(data, mode) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(this.theme.thumbBg);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    let camera;

    if (mode === "plan") {
      const { min, max } = this._planBounds(data);
      const cx = (min.x + max.x) / 2,
        cz = (min.z + max.z) / 2;

      // pad and aspect-fit
      let w = max.x - min.x || 2,
        h = max.z - min.z || 2;
      const pad = Math.max(0.06 * Math.max(w, h), 0.12);
      w += pad * 2;
      h += pad * 2;
      const aspect = this.w / this.h;
      let halfW = w / 2,
        halfH = h / 2;
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      else halfW = halfH * aspect;

      camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -100, 1000);
      camera.position.set(cx, 100, cz);
      camera.up.set(0, 0, -1);
      camera.lookAt(cx, 0, cz);
    } else {
      // 3D fit: compute bounds and frame the model
      const wb = this._worldBounds(data);
      const [cx, cy, cz] = wb.center;
      const r = Math.max(0.001, wb.radius);

      camera = new THREE.PerspectiveCamera(50, this.w / this.h, 0.1, 1000);

      const fov = (camera.fov * Math.PI) / 180;
      const aspect = this.w / this.h;
      const hFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
      const dist = Math.max(r / Math.tan(hFov / 2), (r * 1.2) / Math.tan(fov / 2)) * 1.6;

      camera.position.set(cx + dist, cy + dist * 0.8, cz + dist);
      camera.lookAt(cx, cy, cz);
      camera.near = Math.max(0.01, dist * 0.01);
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
    }

    // content
    const disposables =
      mode === "volumes"
        ? Builders.volumes(scene, data)
        : mode === "plan"
        ? Builders.plan(scene, data)
        : Builders.graph(scene, data);

    // render
    this.renderer.render(scene, camera);
    const url = this.renderer.domElement.toDataURL();

    // dispose
    disposables.forEach((o) => {
      o.geometry?.dispose?.();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
      scene.remove(o);
    });
    return url;
  }

  get(id, data, mode = "plan") {
    const themeKey = this.theme?.thumbBg ?? "t";
    const key = `${id}:${mode}:${themeKey}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.cache.size >= this.maxSize) this.cache.delete(this.cache.keys().next().value);
    const url = this._render(data, mode);
    this.cache.set(key, url);
    return url;
  }
}

// --- Modern dropdown helper (button + menu) ---
function buildDropdown(rootEl, values, onChange) {
  const trigger = rootEl.querySelector(".dropdown-trigger");
  const valueEl = rootEl.querySelector(".dropdown-value");
  const menu = rootEl.querySelector(".dropdown-menu");

  // ARIA roles
  if (menu) {
    menu.setAttribute("role", "listbox");
  }

  // populate
  menu.innerHTML = "";
  values.forEach((v, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.textContent = v;
    if (i === 0) li.setAttribute("aria-selected", "true");
    li.tabIndex = 0;
    li.addEventListener("click", () => {
      [...menu.children].forEach((x) => x.removeAttribute("aria-selected"));
      li.setAttribute("aria-selected", "true");
      valueEl.textContent = v;
      rootEl.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-expanded", "false");
      onChange(v);
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        li.click();
      }
    });
    menu.appendChild(li);
  });

  // open/close
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = rootEl.getAttribute("aria-expanded") === "true";
    rootEl.setAttribute("aria-expanded", String(!open));
    trigger.setAttribute("aria-expanded", String(!open));
  });

  // close on outside / Esc
  document.addEventListener("click", () => {
    rootEl.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      rootEl.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

// =============== ComparisonEngine (unchanged, lean) ===============
class ComparisonEngine {
  constructor() {
    this.compareFields = [
      "rooms",
      "floors",
      "edges",
      "area",
      "privacy_distribution",
      "connectivity",
      "centrality",
      "clustering",
    ];
  }
  compareHouses(hs) {
    const differences = [],
      similarities = [];
    for (const f of this.compareFields) {
      const vals = hs.map((h) => this.getFieldValue(h, f)),
        same = this._allEqual(vals),
        variance = this._variance(vals),
        item = { field: f, values: vals, same, variance };
      (same ? similarities : differences).push(item);
    }
    return { differences, similarities };
  }
  getFieldValue(h, f) {
    const d = h.data;
    switch (f) {
      case "rooms":
        return (d.nodes || []).length;
      case "floors":
        return Number.isFinite(d.floors) ? d.floors : 1;
      case "edges":
        return (d.edges || []).length;
      case "area":
        return (d.site_area?.width || 0) * (d.site_area?.height || 0);
      case "privacy_distribution":
        return this._privacyVector(d);
      case "connectivity": {
        const n = Math.max(1, (d.nodes || []).length);
        return (d.edges || []).length / n;
      }
      case "centrality":
        return this._avgCentrality(d);
      case "clustering":
        return d.networkx_analysis?.global?.average_clustering || 0;
      default:
        return null;
    }
  }
  _privacyVector(d) {
    const dist = { public: 0, semi_private: 0, private: 0 };
    (d.nodes || []).forEach((n) => {
      const k = (n.privacy_level || "").toLowerCase();
      if (k in dist) dist[k]++;
    });
    const tot = Math.max(1, (d.nodes || []).length);
    return [dist.public / tot, dist.semi_private / tot, dist.private / tot];
  }
  _avgCentrality(d) {
    const per = d.networkx_analysis?.per_node || {};
    const vals = Object.values(per).map((o) => o.betweenness_choice || 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  _allEqual(a) {
    if (!a.length) return true;
    const f = JSON.stringify(a[0]);
    return a.every((v) => JSON.stringify(v) === f);
  }
  _variance(v) {
    const flat = v.flat ? v.flat() : v;
    if (!flat.length || flat.some((x) => typeof x !== "number")) return 0;
    const m = flat.reduce((a, b) => a + b, 0) / flat.length;
    return Math.sqrt(flat.reduce((s, x) => s + Math.pow(x - m, 2), 0) / flat.length);
  }
}

// =============== Gallery Manager ===============
class GalleryManager {
  constructor() {
    this.houses = [];
    this.filteredHouses = [];
    this.selectedHouses = new Set();
    this.compareHouses = [];
    this.searchTerm = "";
    this.thumbnailCache = new ThumbnailCache();
    this.comparisonEngine = new ComparisonEngine();
    this.currentView = "grid";
    this._rafIds = [];
    this._panelRenderers = [];
    this.previewMode = "plan"; // 'graph' | 'volumes' | 'plan'
    this._sceneView = null; // detail SceneView
    this.themeName = "light";
    this.favorites = new Set(); // holds house.id
    this.favKeys = new Set(JSON.parse(localStorage.getItem("houseFavoriteKeys") || "[]"));
    this.onlyFavorites = false;
    this.filterUser = "all";
    this.filterLocation = "all";

    this.init();
  }

  init() {
    $("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
    $("#fileInput").addEventListener("change", (e) => {
      const files = Array.from(e.target.files).filter((f) =>
        f.name.toLowerCase().endsWith(".json")
      );
      this.handleFileUpload({ target: { files } });
    });
    ["dragover", "drop"].forEach((evt) =>
      document.body.addEventListener(evt, (e) => e.preventDefault())
    );
    document.body.addEventListener("drop", (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) =>
        f.name.toLowerCase().endsWith(".json")
      );
      if (files.length) this.handleFileUpload({ target: { files } });
    });

    $("#searchBar").addEventListener(
      "input",
      debounce((e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.applyFilters();
      }, 120)
    );
    $$(".filter-chip[data-floors]").forEach((c) =>
      c.addEventListener("click", () => this._activateChip(c, "[data-floors]"))
    );
    $("#roomRange").addEventListener("input", (e) => {
      $("#roomMax").textContent = e.target.value;
      this.applyFilters();
    });
    $$("[data-view]").forEach((b) =>
      b.addEventListener("click", () => this.switchView(b.dataset.view))
    );

    $("#selectAllBtn").addEventListener("click", () => this.selectAll());
    $("#clearBtn").addEventListener("click", () => this.clearSelection());
    $("#deselectBatch").addEventListener("click", () => this.clearSelection());
    $("#compareBtn").addEventListener("click", () => this.enterComparisonMode());
    $("#compareBatch").addEventListener("click", () => this.compareSelected());
    $("#exitComparison").addEventListener("click", () => this.exitComparisonMode());
    $("#exportBtn").addEventListener("click", () => this.exportData());
    $("#analyzeBtn").addEventListener("click", () =>
      $("#sidebar").scrollTo({ top: $("#sidebar").scrollHeight, behavior: "smooth" })
    );

    // Header preview toggles
    $("#previewGraphBtn")?.addEventListener("click", () => {
      this.previewMode = "graph";
      this._setHeaderPreviewButtons("previewGraphBtn");
      this.renderGallery();
    });
    $("#previewVolumesBtn")?.addEventListener("click", () => {
      this.previewMode = "volumes";
      this._setHeaderPreviewButtons("previewVolumesBtn");
      this.renderGallery();
    });
    $("#previewPlanBtn")?.addEventListener("click", () => {
      this.previewMode = "plan";
      this._setHeaderPreviewButtons("previewPlanBtn");
      this.renderGallery();
    });

    // Favorites
    $("#favoritesFilterBtn")?.addEventListener("click", (e) => {
      this.onlyFavorites = !this.onlyFavorites;
      e.currentTarget.setAttribute("aria-pressed", String(this.onlyFavorites));
      this.applyFilters();
    });
    $("#compareFavoritesBtn")?.addEventListener("click", () => this.compareFavorites());

    this.updateStats();
    this._setHeaderPreviewButtons("previewPlanBtn");
    this._initFacetDropdowns();
    $("#userFilter")?.addEventListener("change", (e) => {
      this.filterUser = e.target.value;
      this.applyFilters();
    });
    $("#locationFilter")?.addEventListener("change", (e) => {
      this.filterLocation = e.target.value;
      this.applyFilters();
    });
    this._initFacetDropdowns();
    this.applyTheme(this.themeName);
  }

  _initFacetDropdowns() {
    this._filters = this._filters || { user: "All", location: "All" };
    this._rebuildFacetDropdowns();
  }

  _rebuildFacetDropdowns() {
    const uniq = (arr) =>
      Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b))
      );
    const userValues = ["All", ...uniq(this.houses.map((h) => h.data?.users && String(h.data.users).trim()))];
    const locValues = [
      "All",
      ...uniq(this.houses.map((h) => (h.location || h.data?.location) && String(h.location || h.data.location).trim())),
    ];

    const userEl = document.getElementById("userDropdown");
    const locEl = document.getElementById("locationDropdown");
    const state = (this._filters ||= { user: "All", location: "All" });

    if (userEl) {
      buildDropdown(userEl, userValues, (v) => {
        this._filters.user = v;
        this.applyFilters();
      });
      const want = userValues.includes(state.user) ? state.user : "All";
      userEl.querySelector(".dropdown-value").textContent = want;
      state.user = want;
    }
    if (locEl) {
      buildDropdown(locEl, locValues, (v) => {
        this._filters.location = v;
        this.applyFilters();
      });
      const want = locValues.includes(state.location) ? state.location : "All";
      locEl.querySelector(".dropdown-value").textContent = want;
      state.location = want;
    }
  }

  applyTheme(name) {
    CURRENT = { ...(THEMES[name] || THEMES.dark) };
    this.thumbnailCache.setTheme(CURRENT);
    this.renderGallery();
    if (this._detailHouse) this.renderDetail(this._detailHouse, this.previewMode);
  }

  toggleFavorite(id) {
    const wasFav = this.favorites.has(id);
    if (wasFav) this.favorites.delete(id);
    else this.favorites.add(id);

    const h = this.houses.find((x) => x.id === id);
    if (h) {
      if (this.favorites.has(id)) this.favKeys.add(h.filename);
      else this.favKeys.delete(h.filename);
      localStorage.setItem("houseFavoriteKeys", JSON.stringify(Array.from(this.favKeys)));
    }

    if (this.onlyFavorites) {
      this.applyFilters();
    } else {
      this.updateStats();
    }
  }

  compareFavorites() {
    const favs = this.houses.filter((h) => this.favorites.has(h.id)).slice(0, 4);
    if (favs.length < 2) {
      alert("Favorite at least 2 items to compare.");
      return;
    }
    this.compareHouses = favs.map((h) => h.id);
    this.enterComparisonMode();
  }

  _setHeaderPreviewButtons(activeId) {
    ["previewGraphBtn", "previewVolumesBtn", "previewPlanBtn"].forEach((id) => {
      const b = document.getElementById(id);
      if (!b) return;
      const on = id === activeId;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  _activateChip(active, sel) {
    const g = active.parentElement;
    $$(sel, g).forEach((c) => {
      c.classList.remove("active");
      c.setAttribute("aria-pressed", "false");
    });
    active.classList.add("active");
    active.setAttribute("aria-pressed", "true");
    this.applyFilters();
  }

  _buildFacetOptions() {
    const users = new Set();
    const locs = new Set();

    for (const h of this.houses) {
      let u = h.data?.users ?? "";
      const userList = Array.isArray(u) ? u : String(u).split(",");
      userList
        .map((s) => String(s).trim())
        .filter(Boolean)
        .forEach((v) => users.add(v));

      const l = (h.location ?? h.data?.location ?? "").toString().trim();
      if (l) locs.add(l);
    }

    const userSel = $("#userFilter");
    const locSel = $("#locationFilter");

    if (userSel) {
      const prev = this.filterUser;
      userSel.innerHTML =
        `<option value="all">All</option>` +
        [...users].sort().map((v) => `<option value="${v}">${esc(v)}</option>`).join("");
      userSel.value = users.has(prev) ? prev : "all";
    }

    if (locSel) {
      const prev = this.filterLocation;
      locSel.innerHTML =
        `<option value="all">All</option>` +
        [...locs].sort().map((v) => `<option value="${v}">${esc(v)}</option>`).join("");
      locSel.value = locs.has(prev) ? prev : "all";
    }
  }

  async handleFileUpload(e) {
    const files = Array.from(e.target.files),
      grid = $("#galleryGrid");
    const loading = document.createElement("div");
    loading.className = "loading-spinner";
    grid.appendChild(loading);

    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map((f) => this.processFile(f)));
    }

    loading.remove();
    this.applyFilters();
    this.updateAnalytics();

    this._rebuildFacetDropdowns();
  }

  processFile(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = (e) => {
        try {
          this.addHouse(JSON.parse(e.target.result), file.name);
        } catch {
          console.warn("JSON parse error:", file.name);
          this._toast(`Could not parse ${file.name}`);
        }
        res();
      };
      r.readAsText(file);
    });
  }

  addHouse(data, filename) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];
    const id = uuid();
    const house = {
      id,
      name: data?.name || filename.replace(/\.json$/i, ""),
      data: { ...data, nodes, edges },
      filename,
      rooms: nodes.length,
      floors: Number.isFinite(data?.floors) ? data.floors : 1,
      edges: edges.length,
      location: data?.location || "Unknown",
    };
    this.houses.push(house);

    if (this.favKeys.has(filename)) this.favorites.add(id);
  }

  applyFilters() {
    let f = [...this.houses];
    if (this.onlyFavorites) {
      f = f.filter((h) => this.favorites.has(h.id));
    }
    if (this.searchTerm) {
      const q = this.searchTerm;
      f = f.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          (h.location || "").toLowerCase().includes(q) ||
          (h.filename || "").toLowerCase().includes(q)
      );
    }

    const maxRooms = parseInt($("#roomRange").value, 10);
    f = f.filter((h) => h.rooms <= maxRooms);
    const fc = $(".filter-chip[data-floors].active");
    if (fc && fc.dataset.floors !== "all") {
      const v = fc.dataset.floors;
      f = f.filter((h) => (v === "3+" ? h.floors >= 3 : h.floors === parseInt(v, 10)));
    }

    // User facet
    {
      const sel = (this._filters?.user ?? this.filterUser ?? "all").toString().toLowerCase();
      if (sel !== "all") {
        f = f.filter((h) => {
          const u = h.data?.users;
          const arr = Array.isArray(u) ? u : String(u ?? "").split(",");
          return arr.map((s) => s.trim().toLowerCase()).includes(sel);
        });
      }
    }

    // Location facet
    {
      const sel = (this._filters?.location ?? this.filterLocation ?? "all").toString().toLowerCase();
      if (sel !== "all") {
        f = f.filter((h) => {
          const loc = (h.location ?? h.data?.location ?? "").toString().trim().toLowerCase();
          return loc === sel;
        });
      }
    }

    this.filteredHouses = f;
    this.renderGallery();
    this.updateStats();
  }

  updateAnalytics() {
    const H = (arr, b) => {
      const h = {};
      arr.forEach((x) => {
        const k = b(x);
        h[k] = (h[k] || 0) + 1;
      });
      return h;
    };
    const roomsH = H(this.houses.map((h) => h.rooms), (r) => Math.floor(r / 2) * 2);
    const floorsH = H(this.houses.map((h) => h.floors), (f) => f);
    const compH = H(
      this.houses.map((h) => (h.edges || 0) / Math.max(1, h.rooms)),
      (c) => (Math.floor(c * 2) / 2).toFixed(1)
    );
    const draw = (id, h) => {
      const bars = document.getElementById(id);
      bars.innerHTML = "";
      const m = Math.max(1, ...Object.values(h));
      Object.entries(h)
        .sort((a, b) => +a[0] - +b[0])
        .forEach(([bk, ct]) => {
          const b = document.createElement("div");
          b.className = "chart-bar";
          b.style.height = `${(ct / m) * 100}%`;
          b.title = `${bk}: ${ct}`;
          bars.appendChild(b);
        });
    };
    draw("roomBars", roomsH);
    draw("floorBars", floorsH);
    draw("complexityBars", compH);
  }

  updateStats() {
    $("#totalCount").textContent = this.houses.length;
    $("#filteredCount").textContent = this.filteredHouses.length;
    $("#selectedCount").textContent = this.selectedHouses.size;
  }

  renderGallery() {
    if (this.currentView === "cluster") this.switchView("grid");
    $("#comparisonView").classList.remove("active");
    $("#clusterView").classList.remove("active");
    $("#galleryContainer").style.display = "block";
    const container = $("#galleryGrid");
    container.innerHTML = "";
    const items = this.filteredHouses,
      batch = 24;
    const render = (i) => {
      const end = Math.min(i + batch, items.length);
      for (let k = i; k < end; k++) container.appendChild(this.createCard(items[k]));
      if (end < items.length) requestAnimationFrame(() => render(end));
    };
    render(0);
  }

  createCard(h) {
    const isList = this.currentView === "list";
    const card = document.createElement("div");
    card.className = "asset-card";
    card.style.height = isList ? "120px" : "auto";

    if (this.selectedHouses.has(h.id)) card.classList.add("selected");
    if (this.compareHouses.includes(h.id)) card.classList.add("compare");

    const thumb = this.thumbnailCache.get(h.id, h.data, this.previewMode);

    const safeAttr = (s = "") => String(s).replace(/"/g, "&quot;");
    const d = h.data || {};

    const loc = d.location || h.location || "—";
    const users = d.users || "—";
    const clim = d.climate || "—";
    const roof = d.roof_type || "—";
    const facade = d.facade_materials || "—";
    const overlaps = d?.validation?.volume_overlaps?.count ?? 0;
    const desc = (d.description || "").trim();

    const isFav = this.favorites.has(h.id);
    const heart = `
    <button class="heart-btn"
            aria-pressed="${isFav}"
            aria-label="${isFav ? "Unfavorite" : "Favorite"}"
            title="${isFav ? "Unfavorite" : "Favorite"}"
            data-id="${h.id}">${isFav ? "❤" : "♡"}</button>`;

    card.innerHTML = isList
      ? `
  <div class="asset-preview">
    <img src="${thumb}" alt="${safeAttr(h.name)}">
    ${heart}
  </div>

  <div class="asset-info" style="display:flex;flex-direction:column;gap:6px;justify-content:center;">
    <div class="asset-name" title="${safeAttr(h.name)}">${esc(h.name)}</div>

    <div class="asset-meta">
      <span title="Rooms">${ICON.rooms} Rooms ${h.rooms}</span>
      <span title="Floors">${ICON.floors} ${h.floors}F</span>
      <span title="Edges">${ICON.edges} ${h.edges}</span>
    </div>

    <div class="asset-location" title="${safeAttr(loc)}">${ICON.location} ${esc(loc)}</div>

    <div class="asset-extra">
      <div class="meta-row">
        <span title="Primary user(s)">${ICON.users} ${esc(users)}</span>
        <span title="Climate">${ICON.climate} ${esc(clim)}</span>
        <span title="Volume overlaps">${ICON.overlaps} ${esc(overlaps)}</span>
      </div>
      <div class="meta-row">
        <span title="Roof type">${ICON.roof} ${esc(roof)}</span>
        <span title="Facade materials">${ICON.facade} ${esc(facade)}</span>
      </div>
      ${desc ? `<p class="asset-desc" title="${safeAttr(desc)}">${esc(desc)}</p>` : ""}
    </div>
  </div>
`
      : `
  <div class="asset-preview">
    <img src="${thumb}" alt="${safeAttr(h.name)}">
    ${this.compareHouses.includes(h.id) ? '<div class="compare-badge">COMPARE</div>' : ""}
    ${heart}
  </div>

  <div class="asset-info">
    <div class="asset-name" title="${safeAttr(h.name)}">${esc(h.name)}</div>

    <div class="asset-meta">
      <span title="Rooms">${ICON.rooms} Rooms ${h.rooms}</span>
      <span title="Floors">${ICON.floors} ${h.floors}F</span>
      <span title="Edges">${ICON.edges} ${h.edges}</span>
    </div>

    <div class="asset-location" title="${safeAttr(loc)}">${ICON.location} ${esc(loc)}</div>

    <div class="asset-extra">
      <div class="meta-row">
        <span title="Primary user(s)">${ICON.users} ${esc(users)}</span>
        <span title="Climate">${ICON.climate} ${esc(clim)}</span>
        <span title="Volume overlaps">${ICON.overlaps} ${esc(overlaps)}</span>
      </div>
      <div class="meta-row">
        <span title="Roof type">${ICON.roof} ${esc(roof)}</span>
        <span title="Facade materials">${ICON.facade} ${esc(facade)}</span>
      </div>
      ${desc ? `<p class="asset-desc" title="${safeAttr(desc)}">${esc(desc)}</p>` : ""}
    </div>
  </div>
`;

    card.addEventListener("click", (e) => {
      if (e.target.closest(".heart-btn")) return;

      if (e.ctrlKey || e.metaKey) this.toggleSelection(h.id);
      else if (e.shiftKey) this.addToComparison(h.id);
      else this.openDetail(h);
    });

    const heartBtn = card.querySelector(".heart-btn");
    if (heartBtn) {
      heartBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleFavorite(h.id, h.filename);
        const favNow = this.favorites.has(h.id);
        heartBtn.setAttribute("aria-pressed", String(favNow));
        heartBtn.setAttribute("aria-label", favNow ? "Unfavorite" : "Favorite");
        heartBtn.title = favNow ? "Unfavorite" : "Favorite";
        heartBtn.textContent = favNow ? "❤" : "♡";
      });
    }

    return card;
  }

  toggleSelection(id) {
    this.selectedHouses.has(id)
      ? this.selectedHouses.delete(id)
      : this.selectedHouses.add(id);
    this.updateBatchActions();
    this.renderGallery();
  }
  selectAll() {
    this.filteredHouses.forEach((h) => this.selectedHouses.add(h.id));
    this.updateBatchActions();
    this.renderGallery();
  }
  clearSelection() {
    this.selectedHouses.clear();
    this.compareHouses = [];
    this.updateBatchActions();
    this.renderGallery();
  }
  updateBatchActions() {
    const c = this.selectedHouses.size,
      el = $("#batchActions");
    if (c > 0) {
      el.classList.add("active");
      $("#batchCount").textContent = c;
    } else el.classList.remove("active");
    this.updateStats();
  }
  addToComparison(id) {
    this.compareHouses = this.compareHouses.includes(id)
      ? this.compareHouses.filter((x) => x !== id)
      : this.compareHouses.length < 4
      ? [...this.compareHouses, id]
      : this.compareHouses;
    this.renderGallery();
  }
  compareSelected() {
    this.compareHouses = Array.from(this.selectedHouses).slice(0, 4);
    this.enterComparisonMode();
  }

  enterComparisonMode() {
    if (this.compareHouses.length < 2) {
      alert("Select at least 2 houses to compare (Shift+Click or use batch).");
      return;
    }
    $("#galleryContainer").style.display = "none";
    $("#clusterView").classList.remove("active");
    $("#comparisonView").classList.add("active");
    this.renderComparison();
  }

  renderComparison() {
    const panels = $("#comparisonPanels");
    panels.innerHTML = "";
    const hs = this.compareHouses
      .map((id) => this.houses.find((h) => h.id === id))
      .filter(Boolean);
    hs.forEach((h) => {
      const p = document.createElement("div");
      p.className = "comparison-panel";
      p.innerHTML = `
        <div class="panel-header" title="${esc(h.name)}">${esc(h.name)}</div>
        <div class="panel-viewer"><canvas class="panel-canvas"></canvas></div>
        <div class="panel-stats">
          <div class="diff-item"><span class="diff-label">Rooms</span><span class="diff-value">${h.rooms}</span></div>
          <div class="diff-item"><span class="diff-label">Floors</span><span class="diff-value">${h.floors}</span></div>
          <div class="diff-item"><span class="diff-label">Edges</span><span class="diff-value">${h.edges}</span></div>
          <div class="diff-item"><span class="diff-label">Connectivity</span><span class="diff-value">${(h.edges/Math.max(1,h.rooms)).toFixed(2)}</span></div>
        </div>`;
      panels.appendChild(p);
      this.render3DView(h, $(".panel-canvas", p));
    });
    this.showDifferences(hs);
  }

  render3DView(h, canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const resize = () => {
      const w = canvas.clientWidth || 400,
        h = canvas.clientHeight || 300;
      renderer.setSize(w, h, false);
    };
    resize();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CURRENT.bg);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));

    // build content
    (this.previewMode === "volumes"
      ? Builders.volumes(scene, h.data)
      : this.previewMode === "plan"
      ? Builders.plan(scene, h.data)
      : Builders.graph(scene, h.data));

    // fit camera to bounds (3D)
    const fit3D = () => {
      const nodes = Array.isArray(h.data?.nodes) ? h.data.nodes : [];
      if (!nodes.length) {
        camera.position.set(15, 15, 15);
        camera.lookAt(0, 0, 0);
        return;
      }
      // compute bounds
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;
      for (const n of nodes) {
        const w = Math.max(num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4), 0.001);
        const d = Math.max(num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4), 0.001);
        const hgt = Math.max(num(n.height ?? n.room_height ?? 3, 3), 0.001);
        const cx = num(n.center?.[0], 0);
        const cz = num(n.center?.[1], 0);
        const y0 = STYLE.floorIsIndex ? num(n.floor, 0) * STYLE.levelRise : num(n.floor, 0);
        const y1 = y0 + hgt;
        minX = Math.min(minX, cx - w / 2);
        maxX = Math.max(maxX, cx + w / 2);
        minZ = Math.min(minZ, cz - d / 2);
        maxZ = Math.max(maxZ, cz + d / 2);
        minY = Math.min(minY, y0);
        maxY = Math.max(maxY, y1);
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const cz = (minZ + maxZ) / 2;
      const spanX = Math.max(0.01, maxX - minX);
      const spanY = Math.max(0.01, maxY - minY);
      const spanZ = Math.max(0.01, maxZ - minZ);
      const r = Math.max(spanX, spanY, spanZ) * 0.6;

      const w = canvas.clientWidth || 400,
        hh = canvas.clientHeight || 300;
      camera.aspect = w / hh;
      const fov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
      const dist = Math.max(r / Math.tan(hFov / 2), (r * 1.2) / Math.tan(fov / 2)) * 1.6;

      camera.position.set(cx + dist, cy + dist * 0.8, cz + dist);
      camera.lookAt(cx, cy, cz);
      camera.near = Math.max(0.01, dist * 0.01);
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
    };
    fit3D();

    const ro = new ResizeObserver(() => {
      resize();
      fit3D();
    });
    ro.observe(canvas);

    const animate = () => {
      const id = requestAnimationFrame(animate);
      this._rafIds.push(id);
      renderer.render(scene, camera);
    };
    animate();
    this._panelRenderers.push({ renderer, scene, ro });
  }

  showDifferences(hs) {
    const panel = $("#differencesPanel"),
      cmp = this.comparisonEngine.compareHouses(hs),
      fmt = (v) => (Array.isArray(v) ? v.map((n) => (typeof n === "number" ? n.toFixed(2) : n)).join(" / ") : v);
    let html = "<h3>Analysis</h3>";
    if (cmp.differences.length) {
      html += "<h4>Differences</h4>";
      cmp.differences.forEach((d) => {
        html += `<div class="diff-item"><span class="diff-label">${esc(d.field)}</span><div class="diff-values">${d.values
          .map((v) => `<span class="diff-value different">${esc(fmt(v))}</span>`)
          .join("")}</div></div>`;
      });
    }
    if (cmp.similarities.length) {
      html += "<h4>Similarities</h4>";
      cmp.similarities.forEach((s) => {
        html += `<div class="diff-item"><span class="diff-label">${esc(s.field)}</span><span class="diff-value same">${esc(
          fmt(s.values[0])
        )}</span></div>`;
      });
    }
    panel.innerHTML = html;
  }

  exitComparisonMode() {
    $("#galleryContainer").style.display = "block";
    $("#comparisonView").classList.remove("active");
    this._rafIds.forEach((id) => cancelAnimationFrame(id));
    this._rafIds = [];
    this._panelRenderers.forEach(({ renderer, scene, ro }) => {
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        o.geometry && o.geometry.dispose?.();
        if (o.material) {
          Array.isArray(o.material) ? o.material.forEach((m) => m.dispose?.()) : o.material.dispose?.();
        }
      });
    });
    this._panelRenderers = [];
  }

  switchView(v) {
    $$("[data-view]").forEach((b) => {
      const on = b.dataset.view === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    this.currentView = v;
    const g = $("#galleryContainer"),
      c = $("#comparisonView"),
      cl = $("#clusterView");
    g.style.display = "none";
    c.classList.remove("active");
    cl.classList.remove("active");
    if (v === "cluster") this.renderClusterView();
    else {
      g.style.display = "block";
      this.renderGallery();
    }
  }

  renderClusterView() {
    $("#galleryContainer").style.display = "none";
    $("#comparisonView").classList.remove("active");
    $("#clusterView").classList.add("active");
    const container = $("#clusterContainer");
    container.innerHTML = '<canvas id="clusterCanvas" width="1200" height="600"></canvas>';
    const canvas = $("#clusterCanvas"),
      ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.filteredHouses.forEach((h) => {
      const x = (h.rooms / 20) * (canvas.width - 20) + 10,
        y = (h.floors / 5) * (canvas.height - 20) + 10;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#667eea";
      ctx.fill();
    });
  }

  // Helper: position the nav/heart to hug the viewer canvas edges.
  _positionViewerNav(modal) {
    const overlay = modal.querySelector(".viewer-nav");
    const canvas = modal.querySelector("#viewerCanvas");
    const host = modal.querySelector(".modal-content");
    if (!overlay || !canvas || !host) return;

    const rHost = host.getBoundingClientRect();
    const rCanvas = canvas.getBoundingClientRect();

    const topMid = Math.round(rCanvas.top - rHost.top + rCanvas.height / 2);
    const padEdge = 12;
    const leftEdge = Math.max(padEdge, Math.round(rCanvas.left - rHost.left + padEdge));
    const rightEdge = Math.max(padEdge, Math.round(rHost.right - rCanvas.right + padEdge));
    const heartR = Math.max(16, Math.round(rHost.right - rCanvas.right + 16));
    const heartB = Math.max(16, Math.round(rHost.bottom - rCanvas.bottom + 16));

    overlay.style.setProperty("--nav-top", `${topMid}px`);
    overlay.style.setProperty("--nav-left", `${leftEdge}px`);
    overlay.style.setProperty("--nav-right", `${rightEdge}px`);
    overlay.style.setProperty("--heart-right", `${heartR}px`);
    overlay.style.setProperty("--heart-bottom", `${heartB}px`);
  }

  openDetail(h) {
    this._detailHouse = h;
    this._currentDetailMode = this.previewMode;

    const modal = $("#viewerModal");
    modal.classList.remove("hidden");

    // ---- Sidebar with tabs
    const props = $("#houseProps");
    if (props) {
      props.innerHTML = `
      <div class="detail-tabs">
        <button class="tab active" data-tab="overview">Overview</button>
        <button class="tab" data-tab="specs">Specs</button>
        <button class="tab" data-tab="analysis">Analysis</button>
        <button class="tab" data-tab="verification">Verification</button>
        <button class="tab" data-tab="site">Site</button>
      </div>

      <div class="tab-content active" id="overview">
        <div class="stat-grid">
          <div class="stat-card"><span class="stat-value">${h.rooms}</span><span class="stat-label">Rooms</span></div>
          <div class="stat-card"><span class="stat-value">${h.floors}</span><span class="stat-label">Floors</span></div>
          <div class="stat-card"><span class="stat-value">${h.edges}</span><span class="stat-label">Connections</span></div>
        </div>
        ${this.renderPrivacyBar?.(h.data) ?? ""}

        <div class="detail-section">
          <h4>Description</h4>
          <p>${esc(h.data.description) || "No description available"}</p>
        </div>

        <div class="spec-item"><label>Location</label><span>${esc(h.location) || "—"}</span></div>
        <div class="spec-item"><label>Climate</label><span>${esc(h.data.climate) || "—"}</span></div>
        <div class="spec-item"><label>Users</label><span>${esc(h.data.users) || "—"}</span></div>
        <div class="spec-item"><label>Reason</label><span>${esc(h.data.reason) || "—"}</span></div>
      </div>

      <div class="tab-content" id="specs">
        <div class="spec-list">
          <div class="spec-item"><label>Location</label><span>${esc(h.location) || "—"}</span></div>
          <div class="spec-item"><label>Climate</label><span>${esc(h.data.climate) || "—"}</span></div>
          <div class="spec-item"><label>Users</label><span>${esc(h.data.users) || "—"}</span></div>
          <div class="spec-item"><label>Profession</label><span>${esc(h.data.profession) || "—"}</span></div>
          <div class="spec-item"><label>Roof Type</label><span>${esc(h.data.roof_type) || "—"}</span></div>
          <div class="spec-item"><label>Facade</label><span>${esc(h.data.facade_materials) || "—"}</span></div>
          <div class="spec-item"><label>Reason</label><span>${esc(h.data.reason) || "—"}</span></div>
        </div>
      </div>

      <div class="tab-content" id="analysis">
        ${this.renderNetworkMetrics?.(h.data) ?? ""}
      </div>

      <div class="tab-content" id="verification">
        ${this.renderVerification?.(h.data) ?? ""}
      </div>

      <div class="tab-content" id="site">
        ${this.renderSiteAnalysis?.(h.data) ?? ""}
      </div>
    `;

      // Tabs
      $$(".detail-tabs .tab", props).forEach((tab) => {
        tab.onclick = () => {
          $$(".detail-tabs .tab", props).forEach((t) => t.classList.remove("active"));
          $$(".tab-content", props).forEach((c) => c.classList.remove("active"));
          tab.classList.add("active");
          const panel = document.getElementById(tab.dataset.tab);
          panel && panel.classList.add("active");
        };
      });
    }

    // ---- Room info panel
    const info = $("#roomInfo");
    info.innerHTML = '<div class="room-tooltip-container"></div>';

    // SceneView
    if (!this._sceneView) this._sceneView = new SceneView($("#viewerCanvas"));
    this._sceneView.onPick = (n) => {
      this._sceneView.highlightRoom(n, this._currentDetailMode);
      if (this.showEnhancedRoomInfo) this.showEnhancedRoomInfo(n, info);
      else info.textContent = n?.id || "";
    };

    // Render with current mode
    this.renderDetail(h, this._currentDetailMode);

    // Recenter after the modal/canvas has a real size
    this._sceneView.queueFit(this._currentDetailMode);
    requestAnimationFrame(() => this._sceneView.queueFit(this._currentDetailMode));
    requestAnimationFrame(() => requestAnimationFrame(() => this._positionViewerNav(modal)));

    // Toolbar inside modal
    const toolbarBtns = $$(".viewer-toolbar .view-btn", modal);
    toolbarBtns.forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === this._currentDetailMode);
      b.onclick = () => {
        toolbarBtns.forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        this._currentDetailMode = b.dataset.mode;
        this.renderDetail(h, this._currentDetailMode);

        this._sceneView.queueFit(this._currentDetailMode);
        requestAnimationFrame(() => this._sceneView.queueFit(this._currentDetailMode));
        requestAnimationFrame(() => requestAnimationFrame(() => this._positionViewerNav(modal)));
      };
    });

    // --- Close handlers ---
    let doClose = () => {
      this._sceneView?.clearHighlight?.();
      if (this._sceneView) this._sceneView._savedOrtho = null;
      this._sceneView?.resetCamera?.();
      modal.classList.add("hidden");

      if (this._viewerKeyHandler) {
        window.removeEventListener("keydown", this._viewerKeyHandler);
        this._viewerKeyHandler = null;
      }
      if (this._viewerNavRO) {
        this._viewerNavRO.disconnect();
        this._viewerNavRO = null;
      }
      if (this._viewerNavWinResize) {
        window.removeEventListener("resize", this._viewerNavWinResize);
        this._viewerNavWinResize = null;
      }
    };

    $("#closeModal").onclick = () => doClose();
    document.addEventListener(
      "keydown",
      function escKey(e) {
        if (e.key === "Escape") {
          doClose();
          document.removeEventListener("keydown", escKey);
        }
      },
      { once: true }
    );

    // --- Overlay: prev/next + heart ---
    {
      $(".viewer-nav", modal)?.remove();

      const overlay = document.createElement("div");
      overlay.className = "viewer-nav";
      overlay.innerHTML = `
      <button class="edge-nav edge-left"  aria-label="Previous (←)" title="Previous (←)">‹</button>
      <button class="edge-nav edge-right" aria-label="Next (→)"     title="Next (→)">›</button>
      <button class="heart-viewer"
              aria-pressed="${this.favorites.has(h.id)}"
              aria-label="${this.favorites.has(h.id) ? "Unfavorite" : "Favorite"}"
              title="${this.favorites.has(h.id) ? "Unfavorite" : "Favorite"}">
        ${this.favorites.has(h.id) ? "❤" : "♡"}
      </button>
    `;
      modal.querySelector(".modal-content").appendChild(overlay);

      const leftBtn = overlay.querySelector(".edge-left");
      const rightBtn = overlay.querySelector(".edge-right");
      const heartBtn = overlay.querySelector(".heart-viewer");

      const getList = () => (this.filteredHouses.length ? this.filteredHouses : this.houses);

      const goNeighbor = (delta) => {
        const list = getList();
        const i = list.findIndex((x) => x.id === this._detailHouse.id);
        if (i === -1 || !list.length) return;
        const j = (i + delta + list.length) % list.length;
        const nextHouse = list[j];
        const mode = this._currentDetailMode;

        this.openDetail(nextHouse);
        this._currentDetailMode = mode;
        this.renderDetail(nextHouse, mode);

        $$(".viewer-toolbar .view-btn", modal).forEach((b) => {
          b.classList.toggle("active", b.dataset.mode === mode);
        });

        queueMicrotask(() => {
          this._sceneView?.fitToContent?.(mode);
          this._positionViewerNav(modal);
        });
      };

      leftBtn.onclick = (e) => {
        e.stopPropagation();
        goNeighbor(-1);
      };
      rightBtn.onclick = (e) => {
        e.stopPropagation();
        goNeighbor(+1);
      };

      heartBtn.onclick = (e) => {
        e.stopPropagation();
        const id = this._detailHouse.id;
        this.toggleFavorite(id);
        const favNow = this.favorites.has(id);
        heartBtn.setAttribute("aria-pressed", String(favNow));
        heartBtn.setAttribute("aria-label", favNow ? "Unfavorite" : "Favorite");
        heartBtn.title = favNow ? "Unfavorite" : "Favorite";
        heartBtn.textContent = favNow ? "❤" : "♡";
        this.updateStats();
      };

      if (this._viewerKeyHandler) window.removeEventListener("keydown", this._viewerKeyHandler);
      this._viewerKeyHandler = (e) => {
        if (modal.classList.contains("hidden")) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goNeighbor(-1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          goNeighbor(+1);
        }
        if (e.key.toLowerCase?.() === "f") {
          e.preventDefault();
          heartBtn.click();
        }
      };
      window.addEventListener("keydown", this._viewerKeyHandler);

      const host = modal.querySelector(".modal-content");
      const canvas = modal.querySelector("#viewerCanvas");

      const place = () => this._positionViewerNav(modal);
      place();

      if (this._viewerNavRO) this._viewerNavRO.disconnect();
      this._viewerNavRO = new ResizeObserver(place);
      this._viewerNavRO.observe(host);
      if (canvas) this._viewerNavRO.observe(canvas);

      if (this._viewerNavWinResize) window.removeEventListener("resize", this._viewerNavWinResize);
      this._viewerNavWinResize = place;
      window.addEventListener("resize", this._viewerNavWinResize, { passive: true });
    }
  }

  // ===== Helper methods (outside openDetail) =====
  renderPrivacyBar(data) {
    const privacy = { public: 0, semi_private: 0, private: 0 };
    (data.nodes || []).forEach((n) => {
      const lvl = (n.privacy_level || "").toLowerCase();
      if (lvl in privacy) privacy[lvl]++;
    });
    const total = Math.max(1, (data.nodes || []).length);

    const pct = (k) => {
      const val = Math.round((privacy[k] / total) * 100);
      return val || 0;
    };

    return `
    <div class="privacy-section">
      <h4>Privacy Distribution</h4>
      <div class="privacy-bar">
        ${pct("public") > 0 ? `<div class="public" style="width:${pct("public")}%">${pct("public")}%</div>` : ""}
        ${
          pct("semi_private") > 0
            ? `<div class="semi" style="width:${pct("semi_private")}%">${pct("semi_private")}%</div>`
            : ""
        }
        ${pct("private") > 0 ? `<div class="private" style="width:${pct("private")}%">${pct("private")}%</div>` : ""}
      </div>
    </div>`;
  }

  renderComplexityScore(data) {
    const nodes = (data.nodes || []).length,
      edges = (data.edges || []).length;
    const score = nodes ? Math.min(10, +(edges / nodes * 3).toFixed(1)) : 0;
    return `
    <div class="complexity-section">
      <h4>Complexity Score</h4>
      <div class="progress-bar"><div class="progress-fill" style="width:${score * 10}%"></div></div>
      <span class="score-value">${score}/10</span>
    </div>`;
  }

  renderNetworkMetrics(data) {
    const g = data.networkx_analysis?.global || {};
    const perNode = data.networkx_analysis?.per_node || {};

    return `
    <div class="metric-grid">
      <div class="metric-item"><span class="metric-value">${(g.average_clustering || 0).toFixed(
        2
      )}</span><span class="metric-label">Clustering</span></div>
      <div class="metric-item"><span class="metric-value">${g.diameter_lcc || 0}</span><span class="metric-label">Diameter</span></div>
      <div class="metric-item"><span class="metric-value">${(g.density || 0).toFixed(
        2
      )}</span><span class="metric-label">Density</span></div>
      <div class="metric-item"><span class="metric-value">${g.average_shortest_path_length_lcc?.toFixed(2) || 0}</span><span class="metric-label">Avg Path</span></div>
    </div>

    ${
      Object.keys(perNode).length
        ? `
    <div class="detail-section">
      <h4>Room Metrics</h4>
      <div class="node-metrics">
        ${Object.entries(perNode)
          .map(
            ([id, metrics]) => `
          <details class="node-detail">
            <summary>${esc(id)}</summary>
            <div class="node-stats">
              <div>Degree: ${esc(metrics.degree)}</div>
              <div>Betweenness: ${esc(metrics.betweenness_choice?.toFixed(2) || 0)}</div>
              <div>Integration: ${esc(metrics.integration_closeness?.toFixed(2) || 0)}</div>
              <div>Depth from entry: ${esc(metrics.depth_from_entry)}</div>
            </div>
          </details>
        `
          )
          .join("")}
      </div>
    </div>`
        : ""
    }
  `;
  }

  renderSiteAnalysis(data) {
    const siteAnalysis = data.site_analysisVLM || "";
    return siteAnalysis
      ? `
    <div class="detail-section">
      <h4>Site Context</h4>
      <p>${esc(siteAnalysis)}</p>
    </div>`
      : "<p>No site analysis available</p>";
  }

  renderVerification(data) {
    const verifier = data.graph_verifier || {};
    return verifier.verdict
      ? `
    <div class="detail-section">
      <h4>Graph Analysis <span class="verdict-badge ${esc(verifier.verdict)}">${esc(verifier.verdict)}</span></h4>
      <p>${esc(verifier.parti_summary || "")}</p>
      ${
        verifier.key_findings?.length
          ? `
        <div class="findings">
          ${verifier.key_findings
            .map(
              (f) => `
            <div class="finding-item ${esc(f.severity)}">
              <strong>${esc(f.id)}:</strong> ${esc(f.issue)}
              <div class="finding-detail">${esc(f.use_implication || "")}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }
    </div>`
      : "<p>No verification data available</p>";
  }

  showEnhancedRoomInfo(node, container) {
    const typeColors = {
      living: "#4CAF50",
      bedroom: "#2196F3",
      kitchen: "#FF9800",
      bathroom: "#00BCD4",
      entry: "#9C27B0",
      balcony: "#8BC34A",
    };
    const type = (node.type || node.id || "").toLowerCase();
    const matchKey = Object.keys(typeColors).find((k) => type.includes(k));
    const color = matchKey ? typeColors[matchKey] : "#667eea";
    const privClass = (node.privacy_level || "unknown").toLowerCase().replace(/\s+/g, "-");

    const w0 = node.width?.[0] ?? node.w ?? node.size?.[0] ?? "?";
    const w1 = node.width?.[1] ?? node.depth ?? node.size?.[1] ?? "?";
    const h = node.room_height ?? node.height ?? "?";

    container.innerHTML = `
    <div class="room-card" style="border-left:4px solid ${color}">
      <h4>${esc(node.type || node.id || "Room")}</h4>
      <div class="room-stats">
        <div><label>Dimensions:</label> <span>${esc(w0)}×${esc(w1)} m</span></div>
        <div><label>Height:</label> <span>${esc(h)} m</span></div>
        <div><label>Floor:</label> <span>${esc(node.floor ?? 0)}</span></div>
        <div><label>Privacy:</label> <span class="privacy-badge ${esc(privClass)}">${esc(
      node.privacy_level || "unknown"
    )}</span></div>
      </div>
      ${node.unique_features ? `<div class="features">${esc(node.unique_features)}</div>` : ""}
    </div>`;
  }

  renderDetail(h, mode = "volumes") {
    const sv = this._sceneView;
    if (!sv) return;

    this._currentDetailMode = mode;
    sv.build(mode, h.data);

    if (mode === "plan") {
      const b = sv.computePlanBounds(h.data);
      const pad = 0.8;
      const bounds = {
        min: { x: b.min.x - pad, z: b.min.z - pad },
        max: { x: b.max.x + pad, z: b.max.z + pad },
      };
      sv.setOrthoByBounds(bounds, 1);
      sv.setLabelsOnTop?.(true);

      this._detailResize?.();
      this._detailResize = () => sv.setOrthoByBounds(bounds, 1);
      window.addEventListener("resize", this._detailResize, { passive: true });
    } else {
      window.removeEventListener("resize", this._detailResize || (() => {}));
      this._detailResize = null;

      const wb = sv.computeWorldBounds(h.data);
      if (wb && wb.center) {
        const c = wb.center;
        const d = wb.radius * 2.2;
        sv.setPerspective([c[0] + d, c[1] + d, c[2] + d], c);
      } else {
        sv.setPerspective([20, 20, 20], [0, 0, 0]);
      }
      sv.setLabelsOnTop?.(false);
    }

    sv.queueFit(mode);
    requestAnimationFrame(() => sv.queueFit(mode));
  }

  // -------- Export / Toast --------
  exportData() {
    const selected = Array.from(this.selectedHouses)
      .map((id) => this.houses.find((h) => h.id === id))
      .filter(Boolean);
    const data = selected.length ? selected : this.filteredHouses;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "house-data-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  _toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;left:50%;top:20px;transform:translateX(-50%);background:#222;border:1px solid #444;color:#fff;padding:8px 12px;border-radius:8px;z-index:9999;opacity:.95";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  window.app = new GalleryManager();
  applyTheme("light");
  const t = document.getElementById("themeToggle");
  if (t) {
    t.checked = THEMES.light.isLight;
    t.addEventListener("change", () => {
      window.applyTheme(t.checked ? "light" : "dark");
    });
  }
});

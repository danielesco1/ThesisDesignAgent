import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
/* --------------------------- Helpers --------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (v, d=0)=> Number.isFinite(+v) ? +v : d;

/* -------- Meta panel helpers (ADD THESE) -------- */
const kv = (label, value, cls='') =>
  (value ?? value === 0)
    ? `<div class="kv ${cls}"><label>${esc(label)}</label><span title="${esc(value)}">${esc(value)}</span></div>`
    : '';

const pills = (arr = []) =>
  `<div class="pill-row">${arr.filter(Boolean).map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>`;

function parseReason(s = '') {
  const obj = {};
  s.split(';').forEach(part => {
    const i = part.indexOf(':');
    if (i < 0) return;
    const key = part.slice(0, i).trim().toLowerCase().replace(/\W+/g, '_');
    const val = part.slice(i + 1).trim().replace(/^"|"$/g, '');
    obj[key] = val;
  });
  const splitEnum = t => (t || '')
    .split(/\s*\d+\)\s*/g).map(x => x.trim()).filter(Boolean);
  obj.moments_list         = splitEnum(obj.moments);
  obj.climate_tactics_list = splitEnum(obj.climate_tactics);
  obj.assumptions_list     = splitEnum(obj.assumptions);
  return obj;
}

function renderSiteAnalysis(text='') {
  if (!text.trim()) return '';
  return `
    <div class="tab-pane" data-pane="site">
      <h4>Site analysis</h4>
      <p class="small">${esc(text)}</p>
    </div>
  `;
}

function renderGraphVerifier(gv) {
  if (!gv) return '';
  const badge = (v) => {
    const cls = v === 'ok' ? 'badge-ok' : v === 'fail' ? 'badge-fail' : 'badge-warn';
    const label = v === 'ok' ? 'OK' : v === 'fail' ? 'Fail' : 'Warn';
    return `<span class="badge ${cls}">${label}</span>`;
  };

  const findings = Array.isArray(gv.key_findings) ? gv.key_findings.map(f => {
    const m = f?.evidence?.metrics || {};
    const idHtml = f.id && f.id !== 'global'
      ? `<button class="link-like" data-node-link="${esc(f.id)}" title="Highlight in view">${esc(f.id)}</button>`
      : `<span class="mono">${esc(f.id)}</span>`;
    return `
      <li class="finding">
        <div class="finding-head">
          <strong>${idHtml}</strong>
          <span class="badge ${f.severity === 'high' ? 'badge-fail' : f.severity === 'med' ? 'badge-warn' : 'badge-ok'}">${esc(f.severity || '')}</span>
        </div>
        <div class="finding-issue">${esc(f.issue || '')}</div>
        ${f.why_it_matters ? `<div class="finding-why small muted">${esc(f.why_it_matters)}</div>` : ''}

        ${Object.keys(m).length ? `
          <div class="kv-grid mono">
            ${Object.entries(m).map(([k,v]) => `<div class="kv"><label>${esc(k)}</label><span>${esc(v)}</span></div>`).join('')}
          </div>` : ''}

        ${f.evidence?.topology ? `<div class="small">Topology: ${esc(f.evidence.topology)}</div>` : ''}
        ${f.evidence?.use_implication ? `<div class="small">Use: ${esc(f.evidence.use_implication)}</div>` : ''}
      </li>
    `;
  }).join('') : '';

  const suggestions = Array.isArray(gv.suggestions) ? gv.suggestions.map(s => {
    const d = s.details || {};
    const fx = s.expected_effect || {};
    const md = fx.metrics_direction || {};
    return `
      <li class="suggestion">
        <div class="suggestion-head">
          <span class="badge badge-info mono">${esc(s.action || 'change')}</span>
          ${d.from_node ? `<span class="mono">${esc(d.from_node)}</span>` : ''} 
          ${d.to_node ? `→ <span class="mono">${esc(d.to_node)}</span>` : ''}
          ${Number.isFinite(s.priority) ? `<span class="badge badge-pri">P${s.priority}</span>` : ''}
        </div>
        ${fx.spatial ? `<div class="small muted">${esc(fx.spatial)}</div>` : ''}

        ${Object.keys(md).length ? `
          <div class="kv-grid mono">
            ${Object.entries(md).map(([k,v]) => `<div class="kv"><label>${esc(k)}</label><span>${esc(v)}</span></div>`).join('')}
          </div>` : ''}
      </li>
    `;
  }).join('') : '';

  const kpis = gv.kpi_summary || {};
  const met = Array.isArray(kpis.targets_met) && kpis.targets_met.length
    ? `<div class="pill-row">${kpis.targets_met.map(t=>`<span class="pill pill-ok">${esc(t)}</span>`).join('')}</div>` : '';
  const missed = Array.isArray(kpis.targets_missed) && kpis.targets_missed.length
    ? `<div class="pill-row">${kpis.targets_missed.map(t=>`<span class="pill pill-warn">${esc(t)}</span>`).join('')}</div>` : '';

  return `
    <div class="tab-pane" data-pane="verifier">
      <div class="verdict">${badge(gv.verdict || 'warn')}<span class="mono">Graph Verifier</span></div>
      ${gv.parti_summary ? `<p class="small">${esc(gv.parti_summary)}</p>` : ''}

      ${findings ? `
        <div class="subsec">
          <h5>Key findings</h5>
          <ul class="list">${findings}</ul>
        </div>` : ''}

      ${suggestions ? `
        <div class="subsec">
          <h5>Suggestions</h5>
          <ul class="list">${suggestions}</ul>
        </div>` : ''}

      ${(met || missed) ? `
        <div class="subsec">
          <h5>KPIs</h5>
          ${met}
          ${missed}
        </div>` : ''}

      ${gv.notes ? `<p class="small muted">${esc(gv.notes)}</p>` : ''}
    </div>
  `;
}
/* ----------------------------------------------- */

/* --------------------------- Config --------------------------- */
const XY = 1;
const LEVEL_RISE = 3;
const BG = 0xffffff;
const EDGECOLOR = 0x000000;
const FIT3D_PAD = 0.85;   // tweak to taste; 0.85..1.20
const FIT3D_ELEV = 0.80;  // vertical raise factor (was 0.8)
const FIT_TIGHT = 0.60; 
const HIGHLIGHT = 0xff00ff;

const PRIVACY_COLORS = {
  private:      0xff6b6b,     // red-ish
  semi_private: 0xf5a623,     // orange
  public:       0x667eea,     // indigo/blue
  default:      0x667eea
};
const privacyColor = (n) =>
  new THREE.Color(PRIVACY_COLORS[n?.privacy_level] ?? PRIVACY_COLORS.default);

const nodeColor = (n) => new THREE.Color(
  n.color ||
  (n.privacy_level === 'private' ? '#ff6b6b' :
   n.privacy_level === 'semi_private' ? '#f5a623' : '#667eea')
);

// Put near top of file if you want an easy flip switch:
const NORTH_IS_NEG_Z = true;   // most of your data uses -Z as North in plan
  
/* ------------------------ Thumbnail cache ------------------------ */
function parseModelsFromFilename(fname='') {
  // drop extension
  const base = String(fname).replace(/\.[^.]+$/,'');
  const parts = base.split('_');

  // remove trailing all-numeric tokens (date/time like 20250915, 023722, etc.)
  while (parts.length && /^[0-9]+$/.test(parts[parts.length - 1])) parts.pop();

  // last two tokens now should be: ... <VLM> <LLM>
  const llm = parts.pop() || null;     // e.g. "gpt-5"
  const vlm = parts.pop() || null;     // e.g. "gpt-4o"

  const looksModel = s => !!s && /[a-zA-Z]/.test(s);
  return {
    vlm: looksModel(vlm) ? vlm : null,
    llm: looksModel(llm) ? llm : null
  };
}
/* ------------------------ Node labels ------------------------ */
function makeLabel(text) {
  const el = document.createElement('div');
  el.className = 'node-label';
  el.textContent = String(text ?? '');
  return new CSS2DObject(el);
}
/* -------------------- Graph overlay (all views) -------------------- */
// --- Graph helpers (single source of truth) ---
function buildGraphOverlay(scene, data, yPlane = null, register) {
  const disposables = [];

  // nodes + labels
  for (const n of (data.nodes || [])) {
    const x = num(n.center?.[0], 0) * XY;
    const z = num(n.center?.[1], 0) * XY;
    const h = num(n.height ?? n.room_height ?? 3, 3);
    const y0 = num(n.floor, 0) * LEVEL_RISE;
    const cy = (yPlane !== null) ? (yPlane + 0.01) : (y0 + h * 0.5);
    const center = new THREE.Vector3(x, cy, z);

    const labelText = n.name ?? n.label ?? n.room ?? n.id ?? '';
    if (labelText) {
      const label = makeLabel(labelText);
      label.position.set(x, cy + 0.35, z);
      scene.add(label); disposables.push(label);
      if (register) register(n.id, 'label', label, center);
    }

    const geom = (yPlane !== null)
      ? new THREE.CircleGeometry(0.18, 24)
      : new THREE.SphereGeometry(0.18, 18, 18);
    if (yPlane !== null) geom.rotateX(-Math.PI / 2);

    const marker = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: nodeColor(n) }));
    marker.position.set(x, cy, z);
    scene.add(marker); disposables.push(marker);
    if (register) register(n.id, 'marker', marker, center);
  }

  // edges
  if (Array.isArray(data.edges) && Array.isArray(data.nodes)) {
    const id2 = new Map(data.nodes.map(n => [n.id, n]));
    const pos = [];
    for (const [a, b] of data.edges) {
      const A = id2.get(a), B = id2.get(b);
      if (!A || !B) continue;

      const xA = num(A.center?.[0], 0) * XY, zA = num(A.center?.[1], 0) * XY;
      const xB = num(B.center?.[0], 0) * XY, zB = num(B.center?.[1], 0) * XY;

      let yA, yB;
      if (yPlane !== null) {
        yA = yB = yPlane + 0.01;
      } else {
        const hA = num(A.height ?? A.room_height ?? 3, 3);
        const hB = num(B.height ?? B.room_height ?? 3, 3);
        yA = num(A.floor, 0) * LEVEL_RISE + hA * 0.5;
        yB = num(B.floor, 0) * LEVEL_RISE + hB * 0.5;
      }
      pos.push(xA, yA, zA, xB, yB, zB);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        color: 0xff00ff, transparent: true, opacity: 0.8
      }));
      scene.add(lines); disposables.push(lines);
    }
  }

  return disposables;
}

// Convenience wrapper
function buildGraphOnly(scene, data, register) {
  return buildGraphOverlay(scene, data, null, register);
}

/* ------------------------ View builders ------------------------ */
function buildPlan(scene, data, register) {
  const disposables = [];

  for (const n of (data.nodes || [])) {
    const w = num(n.width?.[0] ?? n.width ?? n.size?.[0], 4) * XY;
    const d = num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4) * XY;
    const x = num(n.center?.[0], 0) * XY;
    const z = num(n.center?.[1], 0) * XY;

    // filled rectangle (plan)
    const g = new THREE.PlaneGeometry(Math.max(w, 0.02), Math.max(d, 0.02));
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({
      color: nodeColor(n),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,            // helps avoid z-fighting
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, 0.001, z);
    scene.add(mesh); disposables.push(mesh);

    // outline
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(
      Math.max(w, 0.02), 0.01, Math.max(d, 0.02)
    ));
    const ol = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({
      color: EDGECOLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,            // outline stays crisp
    }));
    ol.position.set(x, 0.001, z);
    scene.add(ol); disposables.push(ol);

    // register once per node (so select/highlight works in Plan mode too)
    if (register) {
      const center = new THREE.Vector3(x, 0.001, z);
      register(n.id, 'mesh', mesh, center, n);
      register(n.id, 'edge', ol, center);
    }
  }

  // add graph overlay ONCE (outside the loop)
  disposables.push(...buildGraphOverlay(scene, data, 0, register));
  return disposables;
}

function buildVolumes(scene, data, pickables, register) {
  const disposables = [];
  for (const n of data.nodes || []) {
    const w = num(n.width?.[0] ?? n.width ?? n.size?.[0], 4) * XY;
    const d = num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4) * XY;
    const h = num(n.height ?? n.room_height ?? 3);
    const x = num(n.center?.[0],0)*XY;
    const z = num(n.center?.[1],0)*XY;
    const y = num(n.floor,0)*LEVEL_RISE + h*0.5;

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(w,.05), Math.max(h,.05), Math.max(d,.05)),
      new THREE.MeshStandardMaterial({ color: nodeColor(n), roughness: .95, metalness: 0, transparent: true, opacity: .95 })
    );
    box.position.set(x,y,z);
    box.userData.node = n;
    scene.add(box); disposables.push(box);
    pickables && pickables.push(box);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: EDGECOLOR, transparent: true, opacity: .9 })
    );
    edges.position.copy(box.position);
    scene.add(edges); disposables.push(edges);
    const center = new THREE.Vector3(x,y,z);
    if (register) {
      register(n.id, 'mesh', box, center, n);   // <-- pass node 'n' so colors.base/priv get stored
      register(n.id, 'edge', edges, center);
}
  }
  disposables.push(...buildGraphOverlay(scene, data, null));
  return disposables;
}

function buildWireframe(scene, data, pickables, register) {
  const disposables = [];
  for (const n of data.nodes || []) {
    const w = num(n.width?.[0] ?? n.width ?? n.size?.[0], 4) * XY;
    const d = num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4) * XY;
    const h = num(n.height ?? n.room_height ?? 3);
    const x = num(n.center?.[0],0)*XY;
    const z = num(n.center?.[1],0)*XY;
    const yBottom = num(n.floor,0)*LEVEL_RISE;
    const y = yBottom + h*0.5;

    const geometry = new THREE.BoxGeometry(Math.max(w,.05), Math.max(h,.05), Math.max(d,.05));
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: EDGECOLOR, transparent: true, opacity: 1.0 })
    );
    edge.position.set(x,y,z);
    scene.add(edge); disposables.push(edge);

    // base plate with room color
    const plateG = new THREE.PlaneGeometry(Math.max(w,.05), Math.max(d,.05));
    plateG.rotateX(-Math.PI/2);
    const plate = new THREE.Mesh(
      plateG,
      new THREE.MeshBasicMaterial({ color: nodeColor(n), transparent: true, opacity: .7, depthWrite: false })
    );
    plate.position.set(x, yBottom + 0.002, z);
    scene.add(plate); disposables.push(plate);
    const center = new THREE.Vector3(x,y,z);
    if (register) {
      // wireframe has no solid mesh; use edge as highlight target
      register(n.id, 'edge', edge, center);
      register(n.id, 'mesh', plate, center, n);
    }

    if (pickables) {
      const proxy = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ visible:false }));
      proxy.position.copy(edge.position);
      proxy.userData.node = n;
      pickables.push(proxy);
      scene.add(proxy); disposables.push(proxy);
    }
  }
  disposables.push(...buildGraphOverlay(scene, data, null));
  return disposables;
}
/* ------------------ Bounds + fit calculations ------------------ */
function worldBounds(data) {
  const nodes = data?.nodes || [];
  if (!nodes.length) return { center:[0,0,0], radius: 1 };

  let minX=+Infinity,minY=+Infinity,minZ=+Infinity, maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (const n of nodes) {
    const w = Math.max(num(n.width?.[0] ?? n.width ?? n.size?.[0], 4), 0.001);
    const d = Math.max(num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4), 0.001);
    const h = Math.max(num(n.height ?? n.room_height ?? 3), 0.001);
    const cx = num(n.center?.[0],0);
    const cz = num(n.center?.[1],0);
    const y0 = num(n.floor,0)*LEVEL_RISE;
    const y1 = y0 + h;

    minX = Math.min(minX, cx - w/2); maxX = Math.max(maxX, cx + w/2);
    minZ = Math.min(minZ, cz - d/2); maxZ = Math.max(maxZ, cz + d/2);
    minY = Math.min(minY, y0);       maxY = Math.max(maxY, y1);
  }
  const cx = ((minX+maxX)/2)*XY, cy=(minY+maxY)/2, cz=((minZ+maxZ)/2)*XY;
  const spanX = Math.max(0.01, (maxX-minX)*XY);
  const spanY = Math.max(0.01, (maxY-minY));
  const spanZ = Math.max(0.01, (maxZ-minZ)*XY);
  return { center:[cx,cy,cz], radius: Math.max(spanX, spanY, spanZ) * 0.6 };
}

function planBounds(data) {
  const nodes = data?.nodes || [];
  if (!nodes.length) return { min:{x:-1,z:-1}, max:{x:1,z:1} };
  let minX=+Infinity,minZ=+Infinity,maxX=-Infinity,maxZ=-Infinity;
  for (const n of nodes) {
    const w = num(n.width?.[0] ?? n.width ?? n.size?.[0], 4);
    const d = num(n.width?.[1] ?? n.depth ?? n.size?.[1], 4);
    const x = num(n.center?.[0],0);
    const z = num(n.center?.[1],0);
    minX = Math.min(minX, x - w/2);
    maxX = Math.max(maxX, x + w/2);
    minZ = Math.min(minZ, z - d/2);
    maxZ = Math.max(maxZ, z + d/2);
  }
  return { min:{x:minX*XY, z:minZ*XY}, max:{x:maxX*XY, z:maxZ*XY} };
}

/* --------------------------- SceneView --------------------------- */
class SceneView {
  constructor(canvas) {
    this.canvas  = canvas;
    this.glWrap  = canvas.closest('.gl-wrap') || canvas.parentElement; // for overlay + resize

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Scene & camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);

    this.camera = new THREE.PerspectiveCamera(60, this._aspect(), 0.1, 3000);
    this.camera.position.set(20, 20, 20);
    // Rhino-ish lens
    this.camera.filmGauge = 36;      // mm (full-frame)
    this.camera.setFocalLength(50);  // try 40–55 for taste
    this.camera.updateProjectionMatrix();
    // Controls attach to renderer DOM
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this._setControlsDefaults();

    // We handle wheel zoom ourselves (momentum)
    this.controls.enableZoom = false;
    this.controls.zoomToCursor = false;

    // ---- Selection & indexing (NEW) ----
    this.roomIndex   = new Map();   // nodeId -> { meshes:[], edges:[], labels:[] }
    this.selectedId  = null;

    // Momentum-based wheel
    this._zoomMomentum = 0;
    this._wheelNormalize = (e) => {
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
      const d  = THREE.MathUtils.clamp(px, -600, 600);
      let k    = d / 1200;
      if (e.ctrlKey) k *= 0.4; // pinch-zoom gentler
      return k;
    };
    this._onWheel = (e) => { e.preventDefault(); e.stopPropagation(); this._zoomMomentum += this._wheelNormalize(e); };
    this.renderer.domElement.addEventListener('wheel', this._onWheel, { passive: false });

    // Lights & state
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    this.pickables = [];
    this._lastData = null;

    // Labels overlay (inside .gl-wrap)
    this._initLabelRenderer();
    this._ensureNorthWidget();
    this.controls.addEventListener('change', () => this._updateNorthArrow());

    // ---- Left rooms list click-to-highlight (NEW) ----
    this.roomsEl = $('#viewerRooms');
    if (this.roomsEl) {
      this.roomsEl.addEventListener('click',   e => {
        const li = e.target.closest('[data-node]'); if (!li) return;
        this.selectNode(li.dataset.node);              // no zoom
      });
      this.roomsEl.addEventListener('dblclick', e => {
        const li = e.target.closest('[data-node]'); if (!li) return;
        this.selectNode(li.dataset.node, true);        // zoom
      });
    }

    // Start loop & resize
    this._animate();
    this._ro = new ResizeObserver(() => this._resize());
    (this.glWrap || canvas) && this._ro.observe(this.glWrap || canvas);

    // Recenter helpers
    canvas.addEventListener('dblclick', () => this.recenter());
    window.addEventListener('keydown', (e) => {
      const modal = $('#viewerModal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (e.key?.toLowerCase?.() === 'f') this.recenter();
    });
  }

  _setControlsDefaults() {
  const c = this.controls;

  c.enableDamping = true;
  c.dampingFactor = 0.08;

  // make wheel steps smaller
  c.zoomSpeed    = 1;     // try 0.015–0.03 to taste
  c.panSpeed     = 0.6;
  c.rotateSpeed  = 0.8;

  c.screenSpacePanning = false;

  // IMPORTANT: this is what causes big “jump to cursor” zooms
  c.zoomToCursor = false;    // was true

  c.minDistance = 0.5;
  c.maxDistance = 500;
  c.maxPolarAngle = Math.PI / 2.05;
}

_initLabelRenderer() {
    this.labelRenderer = new CSS2DRenderer();
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 200;
    this.labelRenderer.setSize(w, h);

    const el = this.labelRenderer.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';     // critical: don't block mouse events

    const parent = this.canvas.parentElement || document.body;
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    parent.appendChild(el);
  }

_applyZoomStep(k) {
  if (!k) return;

  // Convert small k into multiplicative scale and clamp it tightly per frame.
  const scale = THREE.MathUtils.clamp(Math.exp(k), 0.93, 1.07); // ~±7% per frame

  if (this.camera.isOrthographicCamera) {
    // Ortho zoom behaves inversely
    const nextZoom = this.camera.zoom / scale;
    const minZ = this.controls.minZoom ?? 0.4;
    const maxZ = this.controls.maxZoom ?? 8;
    this.camera.zoom = THREE.MathUtils.clamp(nextZoom, minZ, maxZ);
    this.camera.updateProjectionMatrix();
  } else {
    // Move camera along view vector smoothly
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const len = dir.length();
    const newLen = THREE.MathUtils.clamp(len * scale, this.controls.minDistance, this.controls.maxDistance);
    dir.setLength(newLen);
    this.camera.position.copy(this.controls.target).add(dir);
  }
}

  _aspect() { return (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1); }

  _resize() {
  const w = this.canvas.clientWidth || 300;
  const h = this.canvas.clientHeight || 200;
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(w, h, false);
  this.labelRenderer.setSize(w, h);         // <— keep labels in sync
  this._updateNorthArrow();
}

_animate() {
  const loop = () => {
    this._raf = requestAnimationFrame(loop);
    if (this._zoomMomentum) {
      const step = this._zoomMomentum * 0.10;
      this._zoomMomentum *= 0.85;
      if (Math.abs(this._zoomMomentum) < 0.00015) this._zoomMomentum = 0;
      this._applyZoomStep(step);
    }

    // >>> animate verifier dashes
    if (this._verifierDashMats && this._verifierDashMats.length) {
      for (const m of this._verifierDashMats) {
        // Three's LineDashedMaterial uses .dashOffset in newer builds
        if (typeof m.dashOffset === 'number') {
          m.dashOffset -= 0.015;
          m.needsUpdate = true;
        }
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera); // <— render labels
    this._updateNorthAfterRender();
  };
  loop();
}


  clear() {
    this.pickables.length = 0;
    const toDispose = [];
    this.scene.traverse(o => { if (o !== this.scene) toDispose.push(o); });
    toDispose.forEach(o=>{
      o.parent?.remove(o);
      o.geometry?.dispose?.();
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.());
    });
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  }

  /* ---- Fit + control ranges ---- */
  _applyClipAndDistance(radiusLike) {
  const c = this.controls;
  const r = Math.max(0.001, radiusLike);

  // Gentler distance range (closer min, much lower max)
  const min = Math.max(0.05, r * 0.01);   // was 0.1 / r*0.08
  const max = Math.max(min * 6, r * 20);  // was min*8 / r*40

  c.minDistance = min;
  c.maxDistance = max;

  // Tighter clip planes so close-ups don't clip and far fog isn't huge
  if (this.camera.isPerspectiveCamera) {
    this.camera.near = Math.max(0.005, r * 0.001);  // was 0.01 / r*0.01
    this.camera.far  = Math.max(50, r * 200);       // was r*200
    this.camera.updateProjectionMatrix();
  }
}

  fit3D(data) {
    this._lastData = data;
    const b = worldBounds(data);
    const [cx,cy,cz] = b.center;
    const r = Math.max(0.001, b.radius);

    if (!this.camera.isPerspectiveCamera) {
      this.camera = new THREE.PerspectiveCamera(60, this._aspect(), 0.1, 3000);
      this.controls.object = this.camera;
      this._setControlsDefaults();

      // reapply lens every time we make a new perspective camera
      this.camera.filmGauge = 36;
      this.camera.setFocalLength(50);
      this.camera.updateProjectionMatrix();
    }

    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = this._aspect();
    const hFov = 2 * Math.atan(Math.tan(fov/2) * aspect);
    const dist = Math.max(
      r / Math.tan(hFov / 2),
      (r * 1.2) / Math.tan(fov / 2)
    ) * FIT3D_PAD * FIT_TIGHT;;

    this.camera.position.set(cx + dist, cy + dist * FIT3D_ELEV, cz + dist);

    this.controls.target.set(cx, cy, cz);
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = false;  // keep Orbit wheel OFF
    this.controls.update();

    this._applyClipAndDistance(r);
    this.controls.saveState();
    this._updateNorthArrow();
  }

  fitPlan(data) {
    this._lastData = data;
    const b = planBounds(data);
    const cx = (b.min.x + b.max.x)/2;
    const cz = (b.min.z + b.max.z)/2;
    let w = (b.max.x - b.min.x) || 2;
    let h = (b.max.z - b.min.z) || 2;
    const pad = Math.max(0.08 * Math.max(w,h), 0.16);
    w += pad*2; h += pad*2;

    const aspect = this._aspect();
    let hw = w/2, hh = h/2;
    if (hw/hh > aspect) hh = hw/aspect; else hw = hh*aspect;

    const ortho = new THREE.OrthographicCamera(-hw, hw, hh, -hh, -100, 1000);
    ortho.position.set(cx, 100, cz);

    // ⬇️ Flip the camera roll so plan is rotated 180° (north at top)
    ortho.up.set(0, 0, 1);              // was (0, 0, -1)

    ortho.lookAt(cx, 0, cz);

    this.camera = ortho;
    this.controls.object = ortho;
    this._setControlsDefaults();
    this.controls.enableRotate = false;
    this.controls.enablePan = true;
    this.controls.enableZoom = false;

    this.controls.target.set(cx, 0, cz);
    this.controls.update();
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 8;
    this._applyClipAndDistance(Math.max(w,h));
    this.controls.saveState();
    this._updateNorthArrow();
  }

  recenter() {
    if (!this._lastData) return;
    if (this.camera.isOrthographicCamera) this.fitPlan(this._lastData);
    else this.fit3D(this._lastData);
  }

  createRegistrar(){
  this.roomIndex.clear();
  return (id, kind, obj, centerVec, node) => {
    if (!id) return;
    let rec = this.roomIndex.get(id);
    if (!rec){
      rec = { meshes:[], edges:[], labels:[], center: centerVec ? centerVec.clone() : null, colors: null };
      this.roomIndex.set(id, rec);
    }
    if (centerVec && !rec.center) rec.center = centerVec.clone();

    // save colors once per node
    if (!rec.colors && node){
      const base = (obj?.material?.color)
        ? obj.material.color.clone()       // whatever we actually drew
        : new THREE.Color(node.color || 0x667eea);
      const priv = privacyColor(node);
      rec.colors = { base, priv };
    }

    if (kind === 'mesh')  rec.meshes.push(obj);
    if (kind === 'edge')  rec.edges.push(obj);
    if (kind === 'label') rec.labels.push(obj);
  };
}

  selectNode(id, zoom = false){
  this.selectedId = id;

  // left list active state
  $$('#viewerRooms .room-item').forEach(b => {
    b.classList.toggle('active', b.dataset.node === id);
  });

  // dim others, highlight target
  for (const [nodeId, rec] of this.roomIndex){
    const active = nodeId === id;

    rec.meshes.forEach(m=>{
      const mat = m.material; if (!mat) return;
      mat.transparent = true;
      if (active){
        mat.opacity = 1.0;
        if ('emissive' in mat) mat.emissive.setHex(HIGHLIGHT); // magenta glow
        // optional: also tint base color
        // if ('color' in mat) mat.color.setHex(HIGHLIGHT);
      } else {
        mat.opacity = 0.18;
        if ('emissive' in mat) mat.emissive.setHex(0x000000);
      }
      mat.needsUpdate = true;
    });

    rec.edges.forEach(l=>{
      l.material.opacity = active ? 1.0 : 0.25;
      l.material.color.setHex(active ? HIGHLIGHT : EDGECOLOR); // magenta edges when active
      l.material.needsUpdate = true;
    });

    rec.labels.forEach(lbl=>{
      lbl.element.classList.toggle('muted', !active);
    });
  }

  // only zoom on request (e.g., double-click)
  if (zoom){
    const rec = this.roomIndex.get(id);
    if (rec?.center){
      const c = rec.center;
      this.controls.target.copy(c);
      const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
      const targetLen = Math.max(this.controls.minDistance * 1.4, dir.length() * 0.55);
      dir.setLength(targetLen);
      this.camera.position.copy(c).add(dir);
    }
  }
}

  clearSelection(){
    this.selectedId = null;
    for (const [,rec] of this.roomIndex){
      rec.meshes.forEach(m=>{
        const mat = m.material; if (!mat) return;
        mat.transparent = true;
        mat.opacity = 0.95;
        if (mat.emissive) mat.emissive.setHex(0x000000);
      });
      rec.edges.forEach(l=>{
        l.material.opacity = 0.9;
        l.material.color.setHex(EDGECOLOR);
      });
      rec.labels.forEach(lbl=> lbl.element.classList.remove('muted'));
    }
    $$('#viewerRooms .room-item').forEach(b => b.classList.remove('active'));
  }

  // call this to re-apply base (privacy or original) colors
_applyBaseColors(){
  const usePriv = !!this.colorByPrivacy;
  for (const [, rec] of this.roomIndex){
    const col = usePriv ? rec.colors?.priv : rec.colors?.base;
    if (!col) continue;
    rec.meshes.forEach(m=>{
      if (m.material?.color){
        m.material.color.copy(col);
        m.material.needsUpdate = true;
      }
    });
  }
}

setColorByPrivacy(flag){
  this.colorByPrivacy = !!flag;
  this._applyBaseColors();
  // if overlaps are on, re-apply that highlight on top
  if (this._overlapOn) this.setHighlightOverlaps(true, this._overlapPairs || []);
}

// NEW: highlight any nodes that are in the overlap pairs
setHighlightOverlaps(flag, pairs){
  this._overlapOn = !!flag;
  this._overlapPairs = Array.isArray(pairs) ? pairs : [];

  const ids = new Set();
  if (this._overlapOn) {
    for (const p of this._overlapPairs){
      if (p?.a) ids.add(p.a);
      if (p?.b) ids.add(p.b);
    }
  }

  // Do NOT call _applyBaseColors() here. Preserve whatever scheme is active.

  for (const [nodeId, rec] of this.roomIndex){
    const active = this._overlapOn && ids.has(nodeId);

    rec.meshes.forEach(m=>{
      const mat = m.material; if (!mat) return;
      mat.transparent = true;
      mat.opacity = active ? 1.0 : 0.95;  // tweak visibility only
      if ('emissive' in mat) mat.emissive.setHex(active ? 0xff3366 : 0x000000);
      mat.needsUpdate = true;
    });

    rec.edges.forEach(l=>{
      l.material.opacity = active ? 1.0 : 0.9;
      l.material.color.setHex(active ? 0xff3366 : EDGECOLOR);
      l.material.needsUpdate = true;
    });

    rec.labels.forEach(lbl=>{
      if (this._overlapOn) lbl.element.classList.toggle('muted', !active);
      else lbl.element.classList.remove('muted');
    });
  }
}

setColorByMetric(metricName, perNode = {}) {
  this.metricName = metricName || null;

  // Clear → restore base scheme (privacy/original)
  if (!this.metricName) {
    this._applyBaseColors();
    if (this._overlapOn) this.setHighlightOverlaps(true, this._overlapPairs || []);
    return;
  }

  // Collect numeric values for nodes actually in the scene
  const vals = [];
  for (const [id] of this.roomIndex) {
    const v = perNode?.[id]?.[this.metricName];
    if (Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return;

  // Robust range using clamped percentile indices (works for small N too)
  vals.sort((a,b)=>a-b);
  const n = vals.length;
  const idxLo = Math.max(0, Math.floor((n - 1) * 0.05));
  const idxHi = Math.min(n - 1, Math.ceil ((n - 1) * 0.95));
  const lo = vals[idxLo];
  const hi = vals[idxHi];
  const span = Math.max(1e-9, hi - lo); // avoid divide-by-zero

  // Blue → Red (low=blue, high=red)
  const C0 = new THREE.Color(0x2166f3);
  const C1 = new THREE.Color(0xe74c3c);
  const lerpColor = (out, a, b, t) => out.setRGB(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );

  // Special-case if you want inverted metrics
  const invert = (this.metricName === 'depth_from_entry');

  const col = new THREE.Color();
  for (const [id, rec] of this.roomIndex) {
    const v = perNode?.[id]?.[this.metricName];
    if (!Number.isFinite(v)) continue;

    // normalized t in [0,1]
    const t  = (Math.min(hi, Math.max(lo, v)) - lo) / span;
    const tt = invert ? 1 - t : t;

    lerpColor(col, C0, C1, Math.min(1, Math.max(0, tt)));

    rec.meshes.forEach(m => {
      const mat = m.material; if (!mat) return;
      if (mat.color) mat.color.copy(col);
      mat.transparent = true;
      mat.opacity = Math.max(0.85, mat.opacity ?? 0.85);
      mat.needsUpdate = true;
    });
  }

  // If overlaps are on, keep their emissive/edge pop on top
  if (this._overlapOn) this.setHighlightOverlaps(true, this._overlapPairs || []);
}

// ---- Verifier suggested edges overlay (dashed red cylinders) ----
// === helpers ====================================================
getNodeCenterById(id){
  const rec = this.roomIndex.get(id);
  return rec?.center ? rec.center.clone() : null;
}

// === draw suggested edges + highlight endpoint rooms ============
setVerifierEdges(on, edgesAdd = [], getCenter = (id) => this.getNodeCenterById(id)) {
  // wipe any previous
  if (this._verifierObjs) {
    for (const o of this._verifierObjs) {
      o.parent?.remove(o);
      o.geometry?.dispose?.();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose?.());
    }
  }
  this._verifierObjs = [];
  this._verifierDashMats = [];   // for dash animation
  this._verifierOn = !!on;

  // clear node highlighting if turning off
  if (!this._verifierOn) {
    this._verifierNodeIds = null;
    this._applyVerifierHighlightNodes(false);
    return;
  }

  const COL = 0xff2a55;          // punchy pink-red
  const ids = new Set();

  for (const [a, b] of (edgesAdd || [])) {
    const A = getCenter?.(a);
    const B = getCenter?.(b);
    if (!A || !B) continue;

    // --- 1) animated dashed line (thin but very visible)
    const g = new THREE.BufferGeometry().setFromPoints([A, B]);
    const m = new THREE.LineDashedMaterial({
      color: COL,
      dashSize: 0.60,            // longer dash
      gapSize: 0.28,             // a bit more gap
      transparent: true,
      opacity: 1.0,
      depthTest: false,          // always draw on top
      depthWrite: false
    });
    const line = new THREE.Line(g, m);
    line.computeLineDistances();
    line.renderOrder = 2000;
    this.scene.add(line);
    this._verifierObjs.push(line);
    this._verifierDashMats.push(m);  // animate in _animate()

    // --- 2) bright inner glow tube (thicker)
    const path = new THREE.LineCurve3(A, B);
    const t1 = new THREE.TubeGeometry(path, 48, 0.28, 24, false); // radius ↑
    const tm1 = new THREE.MeshBasicMaterial({
      color: COL,
      transparent: false,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    const tube1 = new THREE.Mesh(t1, tm1);
    tube1.renderOrder = 1999;
    this.scene.add(tube1);
    this._verifierObjs.push(tube1);

    // --- 3) soft outer halo tube (even wider, subtle)
    const t2 = new THREE.TubeGeometry(path, 48, 0.55, 24, false); // radius ↑
    const tm2 = new THREE.MeshBasicMaterial({
      color: COL,
      transparent: false,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    const tube2 = new THREE.Mesh(t2, tm2);
    tube2.renderOrder = 1998;
    this.scene.add(tube2);
    this._verifierObjs.push(tube2);

    // --- 4) endpoint + midpoint glow sprites
    const makeGlow = (pos, s = 0.9) => {
      const sm = new THREE.SpriteMaterial({
        color: COL,
        transparent:false,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      const sp = new THREE.Sprite(sm);
      sp.position.copy(pos);
      sp.scale.set(s, s, s);
      sp.renderOrder = 2001;
      this.scene.add(sp);
      this._verifierObjs.push(sp);
    };
    makeGlow(A, 0.95);
    makeGlow(B, 0.95);
    makeGlow(A.clone().lerp(B, 0.5), 0.75); // midpoint spark

    ids.add(a); ids.add(b);
  }

  // remember which rooms to pop
  this._verifierNodeIds = ids;
  this._applyVerifierHighlightNodes(true);
}

// highlight connector endpoint rooms (works in all modes)
_applyVerifierHighlightNodes(flag){
  const ids = this._verifierNodeIds || new Set();
  const EDGE_RED = 0xff2a55;

  for (const [nodeId, rec] of this.roomIndex) {
    const active = flag && ids.has(nodeId);

    // --- Meshes (Volumes, Plan plates, Wireframe base plates) ---
    rec.meshes.forEach(m => {
      const mat = m.material; if (!mat) return;

      // lazily snapshot original props once
      const ud = mat.userData || (mat.userData = {});
      if (!ud._orig) {
        ud._orig = {
          color:  mat.color ? mat.color.clone() : null,
          emissive: ('emissive' in mat) ? mat.emissive.clone() : null,
          emissiveIntensity: ('emissiveIntensity' in mat) ? mat.emissiveIntensity : null,
          opacity: mat.opacity,
          blending: mat.blending,
          depthWrite: mat.depthWrite
        };
      }

      if (active) {
        // make it as visible as possible
        if (mat.color) mat.color.setHex(EDGE_RED);
        mat.opacity = 1.0;

        // MeshStandardMaterial / Phong etc – strong glow
        if ('emissive' in mat) {
          mat.emissive.setHex(EDGE_RED);
          if ('emissiveIntensity' in mat) mat.emissiveIntensity = Math.max(1.0, mat.emissiveIntensity || 1.0);
        } else {
          // MeshBasicMaterial – use additive so it pops
          mat.blending   = THREE.AdditiveBlending;
          mat.depthWrite = false;
        }
      } else {
        // restore original props
        if (ud._orig) {
          if (ud._orig.color && mat.color) mat.color.copy(ud._orig.color);
          if (ud._orig.emissive && 'emissive' in mat) mat.emissive.copy(ud._orig.emissive);
          if ('emissiveIntensity' in mat && ud._orig.emissiveIntensity != null)
            mat.emissiveIntensity = ud._orig.emissiveIntensity;
          mat.opacity   = ud._orig.opacity;
          mat.blending  = ud._orig.blending;
          mat.depthWrite= ud._orig.depthWrite;
        }
      }
      mat.transparent = true;
      mat.needsUpdate = true;
    });

    // --- Edges (wireframe outlines / plan outlines) ---
    rec.edges.forEach(l => {
      const lm = l.material; if (!lm) return;
      const ud = lm.userData || (lm.userData = {});
      if (!ud._orig) {
        ud._orig = {
          color: lm.color ? lm.color.clone() : null,
          opacity: lm.opacity
        };
      }
      if (active) {
        if (lm.color) lm.color.setHex(EDGE_RED);
        lm.opacity = 1.0;
      } else if (ud._orig) {
        if (ud._orig.color && lm.color) lm.color.copy(ud._orig.color);
        lm.opacity = ud._orig.opacity;
      }
      lm.needsUpdate = true;
    });

    // --- Labels: emphasize endpoints when active, restore otherwise ---
    rec.labels?.forEach(lbl => {
      if (flag) lbl.element.classList.toggle('muted', !active);
      else lbl.element.classList.remove('muted');
    });
  }
}

_initNorthArrow() {
    const host = this.glWrap || this.canvas.parentElement || document.body;

    // container
    const box = document.createElement('div');
    box.className = 'north-widget';
    box.innerHTML = `
      <div class="north-svg">
        <svg viewBox="0 0 100 100" aria-label="North arrow">
          <!-- ring -->
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="6" opacity="0.35"/>
          <!-- needle (we rotate this) -->
          <polygon id="north-needle" points="50,6 62,46 50,40 38,46"
                  fill="currentColor" />
          <!-- N label (kept upright) -->
          <text x="50" y="82" text-anchor="middle" font-size="26" font-weight="700">N</text>
        </svg>
      </div>
    `;
    // don’t steal mouse
    box.style.pointerEvents = 'none';
    host.appendChild(box);

    this._northEl = box;
    this._northNeedle = box.querySelector('#north-needle');

    // keep it updated
    this._updateNorthArrow();
  }

    // In SceneView
  _ensureNorthWidget(){
      if (this._northEl) return;

      // host: .gl-wrap is already position:relative
      const host = this.glWrap || this.renderer.domElement.parentElement;

      const wrap = document.createElement('div');
      wrap.className = 'north-widget';
      // a tiny SVG arrow that defaults pointing UP
      wrap.innerHTML = `
        <div class="north-arrow" aria-label="north">
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M12 3l6 10H6z" fill="currentColor"></path>
          </svg>
          <span class="north-label">N</span>
        </div>
      `;
      // minimal inline styles so it works even without CSS
      Object.assign(wrap.style, {
        position:'absolute', left:'12px', bottom:'12px', zIndex:'5', pointerEvents:'none'
      });
      const arrow = wrap.querySelector('.north-arrow');
      Object.assign(arrow.style, {
        width:'36px', height:'36px', borderRadius:'10px',
        display:'grid', placeItems:'center',
        background:'rgba(255,255,255,.92)',
        boxShadow:'0 2px 6px rgba(0,0,0,.15)',
        color:'#e34855',      // arrow color
        transformOrigin:'50% 50%',
        transition:'transform 80ms linear'
      });
      const label = wrap.querySelector('.north-label');
      Object.assign(label.style, {
        position:'absolute', bottom:'2px', font:'700 10px/1 system-ui, sans-serif',
        color:'#111', opacity:'.8', letterSpacing:'0.02em'
      });

      host.appendChild(wrap);
      this._northEl = wrap;
      this._northArrow = arrow;
    }

    // Update the arrow orientation.
    // In Plan (orthographic top-down) we keep North=Up for verification.
    // In 3D, rotate so it points toward world +Z on the screen.
    _updateNorthArrow(){
      if (!this._northArrow || !this.camera) return;

      if (this.camera.isOrthographicCamera){
        // Plan view is already aligned so that North is at the top.
        this._northArrow.style.transform = 'rotate(0deg)';
        return;
      }

      // Perspective: compute camera yaw around Y and rotate opposite so arrow points to +Z.
      const eul = new THREE.Euler().setFromRotationMatrix(this.camera.matrixWorld, 'YXZ');
      const yawDeg = THREE.MathUtils.radToDeg(eul.y);      // 0 when looking -Z
      const angle = 180 - yawDeg;                           // make +Z (north) point up
      this._northArrow.style.transform = `rotate(${angle}deg)`;
    }


  // ensure it stays correct after resizes / fits
  _updateNorthAfterRender() {
    // tiny helper if you prefer calling post-render
    this._updateNorthArrow();
  }

}

/* --------------------------- Thumbnails --------------------------- */
class Thumbnailer {
  constructor(w=520, h=390) {
    this.w = w; this.h = h;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    this.renderer.setSize(w, h, false);
  }
  render(data, mode='plan') {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    let camera;

    if (mode === 'plan') {
      const b = planBounds(data);
      const cx = (b.min.x + b.max.x)/2, cz = (b.min.z + b.max.z)/2;
      let w = (b.max.x - b.min.x) || 2, h = (b.max.z - b.min.z) || 2;
      const pad = Math.max(0.08*Math.max(w,h), 0.16); w+=pad*2; h+=pad*2;
      const aspect = this.w/this.h; let hw=w/2, hh=h/2; if (hw/hh>aspect) hh=hw/aspect; else hw=hh*aspect;
      camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, -100, 1000);
      camera.position.set(cx, 100, cz);

      // ⬇️ match viewer: 180° rotation for plan
      camera.up.set(0, 0, 1);             // was (0, 0, -1)

      camera.lookAt(cx,0,cz);
      buildPlan(scene, data);
    } else if (mode === 'wireframe') {
      camera = new THREE.PerspectiveCamera(50, this.w/this.h, 0.1, 3000);
      buildWireframe(scene, data);
      const b = worldBounds(data);
      const [cx,cy,cz] = b.center; const r = Math.max(0.001, b.radius);
      const fov = (camera.fov*Math.PI)/180, aspect = this.w/this.h, hFov = 2*Math.atan(Math.tan(fov/2)*aspect);
      const dist = Math.max(
        r / Math.tan(hFov / 2),
        (r * 1.2) / Math.tan(fov / 2)
      ) * FIT3D_PAD * FIT_TIGHT; 
      camera.position.set(cx+dist, cy+dist*.8, cz+dist); camera.lookAt(cx,cy,cz);
    } else if (mode === 'graph') {
      camera = new THREE.PerspectiveCamera(50, this.w/this.h, 0.1, 3000);
      buildGraphOnly(scene, data);
      const b = worldBounds(data);
      const [cx,cy,cz] = b.center; const r = Math.max(0.001, b.radius);
      const fov = (camera.fov*Math.PI)/180, aspect = this.w/this.h, hFov = 2*Math.atan(Math.tan(fov/2)*aspect);
      const dist = Math.max(
        r / Math.tan(hFov / 2),
        (r * 1.2) / Math.tan(fov / 2)
      ) * FIT3D_PAD * FIT_TIGHT; 
      camera.position.set(cx+dist, cy+dist*.8, cz+dist); camera.lookAt(cx,cy,cz);
    } else {
      camera = new THREE.PerspectiveCamera(50, this.w/this.h, 0.1, 3000);
      buildVolumes(scene, data);
      const b = worldBounds(data);
      const [cx,cy,cz] = b.center; const r = Math.max(0.001, b.radius);
      const fov = (camera.fov*Math.PI)/180, aspect = this.w/this.h, hFov = 2*Math.atan(Math.tan(fov/2)*aspect);
      const dist = Math.max(
        r / Math.tan(hFov / 2),
        (r * 1.2) / Math.tan(fov / 2)
      ) * FIT3D_PAD * FIT_TIGHT; 
      camera.position.set(cx+dist, cy+dist*.8, cz+dist); camera.lookAt(cx,cy,cz);
    }

    this.renderer.render(scene, camera);
    const url = this.renderer.domElement.toDataURL();
    scene.traverse(o => {
      o.geometry?.dispose?.();
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.());
    });
    return url;
  }
}

/* --------------------------- App --------------------------- */
class App {
  constructor() {
    this.houses = [];
    this.filtered = [];
    this.thumb = new Thumbnailer(520, 390);
    this.viewer = null;

    this.previewMode = 'plan';
    this.viewerMode  = 'volumes';

    this._wireEvents();
    this._dnd();
    this.metric = null;
    this.metricsPerNode = null;   // lazily set when a house is opened/rendered
  }

  _wireEvents() {
    $('#uploadBtn').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = (e) => this._handleFiles(e.target.files);

    $('#search').oninput = () => this.applyFilters();
    $('#roomMax').oninput = (e) => { $('#roomMaxVal').textContent = e.target.value; this.applyFilters(); };
    $$('#floorChips .chip').forEach(ch => ch.onclick = () => {
      $$('#floorChips .chip').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed','false'); });
      ch.classList.add('active'); ch.setAttribute('aria-pressed','true');
      this.applyFilters();
    });

    $$('.view-toggles .chip').forEach(btn => {
      btn.onclick = () => {
        $$('.view-toggles .chip').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed','false'); });
        btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
        this.previewMode = btn.dataset.mode;
        this.render();
      };
    });

    // View mode chips only (avoid catching metric/privacy/etc.)
    $$('.viewer-toolbar .chip[data-vmode]').forEach(btn => {
      btn.onclick = () => {
        $$('.viewer-toolbar .chip[data-vmode]').forEach(x => {
          x.classList.remove('active'); x.setAttribute('aria-pressed','false');
        });
        btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
        this.viewerMode = btn.dataset.vmode || this.viewerMode;
        if (this._openHouse) this._renderViewer(this._openHouse);
      };
    });
    
    // Privacy toggle (separate)
    this.privacyMode = false;
    const privacyBtn = $('#privacyBtn');
    if (privacyBtn) {
      privacyBtn.onclick = () => {
        this.privacyMode = !this.privacyMode;
        privacyBtn.classList.toggle('active', this.privacyMode);
        privacyBtn.setAttribute('aria-pressed', String(this.privacyMode));
        this.viewer?.setColorByPrivacy(this.privacyMode);
      };
    }
    // Overlaps button
const overlapBtn = $('#overlapBtn');
if (overlapBtn){
  overlapBtn.onclick = () => {
    this._overlapsOn = !this._overlapsOn;

    overlapBtn.classList.toggle('active', this._overlapsOn);
    overlapBtn.setAttribute('aria-pressed', String(this._overlapsOn));

    const pairs = this._openHouse?.data?.validation?.volume_overlaps?.pairs || [];
    // IMPORTANT: always call with the current flag so OFF clears the styling
    this.viewer?.setHighlightOverlaps(this._overlapsOn, pairs);
  };
}

    // ===== Metric coloring (betweenness_choice / degree / integration_closeness) =====
    $$('.viewer-toolbar .metricBtn').forEach(btn => {
      btn.onclick = () => {
        const metric = btn.dataset.metric;
        const isActive = btn.classList.contains('active');

        if (isActive) {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed','false');
          this.metric = null;
        } else {
          $$('.viewer-toolbar .metricBtn').forEach(x => {
            x.classList.remove('active'); x.setAttribute('aria-pressed','false');
          });
          btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
          this.metric = metric;
        }

        // turn off privacy if a metric is active (optional UX)
        if (this.metric && this.privacyMode) {
          this.privacyMode = false;
          const pb = $('#privacyBtn');
          pb?.classList.remove('active');
          pb?.setAttribute('aria-pressed','false');
          this.viewer?.setColorByPrivacy(false);
        }

        // Recolor in place (no re-fit, no recenter, no re-render)
        if (this.viewer) {
          const perNode = this.metricsPerNode ||
                          (this._openHouse?.data?.networkx_analysis?.per_node ?? null);

          if (this.metric && perNode) {
            this.viewer.setColorByMetric(this.metric, perNode);
          } else {
            this.viewer.setColorByMetric(null, null); // back to base scheme
            if (this.privacyMode) this.viewer.setColorByPrivacy(true);
          }

          // keep overlaps highlight
          const pairs = this._openHouse?.data?.validation?.volume_overlaps?.pairs || [];
          this.viewer.setHighlightOverlaps(!!this._overlapsOn, pairs);
        }
      };
    });


    
    // Recenter button
    $('#recenterBtn').onclick = () => this.viewer?.recenter();

    // Verifier connectors toggle (toolbar)
    const verifierBtn = document.getElementById('verifierBtn');
    if (verifierBtn) {
      verifierBtn.onclick = () => {
        if (!Array.isArray(this._edgesAdd) || !this._edgesAdd.length) return;

        this._verifierOn = !this._verifierOn;
        verifierBtn.classList.toggle('active', this._verifierOn);
        verifierBtn.setAttribute('aria-pressed', String(this._verifierOn));
        verifierBtn.textContent = this._verifierOn ? 'Hide connectors' : 'Show connectors';

        const getCenter = (id) => this.viewer?.getNodeCenterById(id);
        this.viewer?.setVerifierEdges(this._verifierOn, this._edgesAdd, getCenter);

        // keep overlaps highlight layered
        const pairs = this._openHouse?.data?.validation?.volume_overlaps?.pairs || [];
        this.viewer?.setHighlightOverlaps(!!this._overlapsOn, pairs);
      };
    }
  }

  _dnd() {
    ['dragover','drop'].forEach(evt => document.addEventListener(evt, e => e.preventDefault()));
    document.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files||[])].filter(f => f.name.toLowerCase().endsWith('.json'));
      if (files.length) this._handleFiles(files);
    });
  }

  // loader UI
  _showLoader(total) {
    $('#loader').classList.remove('hidden');
    $('#loaderText').textContent = `Processing ${total} file${total>1?'s':''}…`;
    $('#loaderPct').textContent = '0%';
    $('#loaderFill').style.width = '0%';
  }
  _updateLoader(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('#loaderPct').textContent = `${pct}%`;
    $('#loaderFill').style.width = `${pct}%`;
  }
  _hideLoader() { $('#loader').classList.add('hidden'); }

  async _handleFiles(files) {
    const list = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.json'));
    if (!list.length) return;

    this._showLoader(list.length);
    let done = 0;
    for (const f of list) {
      try {
        const text = await f.text();
        this._ingest(JSON.parse(text), f.name);
      } catch { console.warn('Bad JSON:', f.name); }
      finally {
        done++; this._updateLoader(done, list.length);
        if (done % 12 === 0) await new Promise(r => requestAnimationFrame(r));
      }
    }
    this._hideLoader();
    this.applyFilters();
  }

  _ingest(data, filename) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];
    this.houses.push({
      id: uuid(),
      name: data?.name || filename.replace(/\.json$/i,''), filename,
      location: data?.location || '—',
      rooms: nodes.length,
      floors: Number.isFinite(data?.floors) ? data.floors : 1,
      edges: edges.length,
      models: parseModelsFromFilename(filename),   // <-- add this
      data: { ...data, nodes, edges }
    });
  }

  applyFilters() {
    const q = $('#search').value.trim().toLowerCase();
    const maxRooms = +$('#roomMax').value;
    const floorChip = $('#floorChips .chip.active')?.dataset.floors || 'all';

    let list = [...this.houses];
    if (q) {
      list = list.filter(h =>
        h.name.toLowerCase().includes(q) ||
        h.location.toLowerCase().includes(q) ||
        h.filename.toLowerCase().includes(q)
      );
    }
    list = list.filter(h => h.rooms <= maxRooms);
    if (floorChip !== 'all') {
      list = list.filter(h => floorChip === '3+' ? h.floors >= 3 : h.floors === +floorChip);
    }

    this.filtered = list;
    $('#totalCount').textContent = this.houses.length;
    $('#filteredCount').textContent = list.length;
    this.render();
  }

  render() {
    const grid = $('#gallery');
    grid.innerHTML = '';
    const items = this.filtered;
    const batch = 18;
    const draw = (i) => {
      const end = Math.min(i + batch, items.length);
      for (let k = i; k < end; k++) grid.appendChild(this._card(items[k]));
      if (end < items.length) requestAnimationFrame(() => draw(end));
    };
    draw(0);
  }

  _card(h) {
  const el = document.createElement('div');
  el.className = 'card';
  const thumbURL = this.thumb.render(h.data, this.previewMode);
  const users = h.data?.users; // e.g. "7 members (2 adults + 3 children + 2 elders)"

  el.innerHTML = `
    <img class="thumb" src="${thumbURL}" alt="${esc(h.name)}"/>
    <div class="info">
      <div class="name" title="${esc(h.name)}">${esc(h.name)}</div>

      <div class="meta">
        <span>Rooms ${h.rooms}</span>
        <span>${h.floors}F</span>
        <span>${h.edges} edges</span>
      </div>

      <div class="meta"><span>${esc(h.location)}</span></div>

      ${users ? `<div class="meta"><span title="${esc(users)}">${esc(users)}</span></div>` : ''}

      ${(h.models?.vlm || h.models?.llm) ? `
        <div class="meta">
          ${h.models?.vlm ? `<span>VLM ${esc(h.models.vlm)}</span>` : ''}
          ${h.models?.llm ? `<span>LLM ${esc(h.models.llm)}</span>` : ''}
        </div>` : ''
      }
    </div>
  `;
  el.onclick = () => this.openViewer(h);
  return el;
}

  _buildRoomsList(house){
    const el = $('#viewerRooms');
    if (!el) return;

    const nodes = (house.data?.nodes || [])
      .slice()
      .sort((a,b)=> (a.floor??0)-(b.floor??0) || String(a.id).localeCompare(String(b.id)));

    el.innerHTML = nodes.map(n=>{
      const color = nodeColor(n).getStyle();
      const title = n.name ?? n.id ?? n.type ?? 'room';
      const floor = n.floor ?? 0;

      const w = num(n.width?.[0] ?? n.width ?? n.size?.[0], 0);
      const d = num(n.width?.[1] ?? n.depth ?? n.size?.[1], 0);
      const h = num(n.height ?? n.room_height, 0);

      const dims = (w && d) ? `${w.toFixed(1)}×${d.toFixed(1)}m` : '';
      const htxt = h ? ` · H${h.toFixed(1)}m` : '';

      const privRaw = (n.privacy_level || 'unspecified');
      const priv    = privRaw.replace(/_/g,' ');
      const feat    = n.unique_features || '';

      const tooltip = `${title}
  Floor: ${floor}
  ${dims}${htxt}
  Privacy: ${priv}
  ${feat ? `Features: ${feat}` : ''}`;

      return `
        <button class="room-item" data-node="${esc(n.id)}" title="${esc(tooltip)}">
          <span class="dot" style="--c:${esc(color)}"></span>
          <div class="ri">
            <div class="ri-top">
              <span class="ri-name">${esc(title)}</span>
              <span class="badge badge-privacy ${esc(privRaw)}">${esc(priv)}</span>
            </div>
            <div class="ri-sub mono">F${floor}${dims ? ` · ${esc(dims)}` : ''}${htxt}</div>
            ${feat ? `<div class="ri-note">${esc(feat)}</div>` : ''}
          </div>
        </button>`;
    }).join('');
  }

 openViewer(house) {
  this._openHouse = house;
  this.metricsPerNode = house?.data?.networkx_analysis?.per_node || null;
  this._buildRoomsList(house);

  $('#viewerModal').classList.remove('hidden');
  $('#closeModal').onclick = () => $('#viewerModal').classList.add('hidden');
  document.addEventListener('keydown', function escOnce(e){
    if (e.key === 'Escape') {
      $('#viewerModal').classList.add('hidden');
      document.removeEventListener('keydown', escOnce);
    }
  }, { once: true });

  if (!this.viewer) this.viewer = new SceneView($('#viewerCanvas'));
  this._ensureViewerNav();

  // Ensure correct canvas size, then render & fit…
  this.viewer._resize();
  this._renderViewer(house);          // calls fit3D/fitPlan + saveState

  // …and one more pass next frame after layout settles
  requestAnimationFrame(() => {
    this.viewer._resize();
    this.viewer.recenter();           // back to that saved fit state
  });

  // ==== SIDEBAR (Tabbed) ====
  const m = $('#viewerMeta');
  const d = house.data || {};
  const r = parseReason(d.reason || '');

  const entry = d.entry_strategy || {};
  const anchor = Array.isArray(entry.anchor_point)
    ? `[${entry.anchor_point.join(', ')}]` : null;

  // Small local helpers to build tab panes
  const renderSiteAnalysis = (text='') => {
    if (!text || !String(text).trim()) return '';
    return `
      <div class="tab-pane" data-pane="site">
        <h4>Site analysis</h4>
        <p class="small">${esc(text)}</p>
      </div>
    `;
  };

  const renderGraphVerifier = (gv) => {
    if (!gv) return '';
    const badge = (v) => {
      const cls = v === 'ok' ? 'badge-ok' : v === 'fail' ? 'badge-fail' : 'badge-warn';
      const label = v === 'ok' ? 'OK' : v === 'fail' ? 'Fail' : 'Warn';
      return `<span class="badge ${cls}">${label}</span>`;
    };

    const findings = Array.isArray(gv.key_findings) ? gv.key_findings.map(f => {
      const mtr = f?.evidence?.metrics || {};
      const idHtml = f.id && f.id !== 'global'
        ? `<button class="link-like" data-node-link="${esc(f.id)}" title="Highlight in view">${esc(f.id)}</button>`
        : `<span class="mono">${esc(f.id || 'global')}</span>`;
      return `
        <li class="finding">
          <div class="finding-head">
            <strong>${idHtml}</strong>
            <span class="badge ${f.severity === 'high' ? 'badge-fail' : f.severity === 'med' ? 'badge-warn' : 'badge-ok'}">${esc(f.severity || '')}</span>
          </div>
          <div class="finding-issue">${esc(f.issue || '')}</div>
          ${f.why_it_matters ? `<div class="finding-why small muted">${esc(f.why_it_matters)}</div>` : ''}

          ${Object.keys(mtr).length ? `
            <div class="kv-grid mono">
              ${Object.entries(mtr).map(([k,v]) => `<div class="kv"><label>${esc(k)}</label><span>${esc(v)}</span></div>`).join('')}
            </div>` : ''}

          ${f.evidence?.topology ? `<div class="small">Topology: ${esc(f.evidence.topology)}</div>` : ''}
          ${f.evidence?.use_implication ? `<div class="small">Use: ${esc(f.evidence.use_implication)}</div>` : ''}
        </li>
      `;
    }).join('') : '';

    const suggestions = Array.isArray(gv.suggestions) ? gv.suggestions.map(s => {
      const d2 = s.details || {};
      const fx = s.expected_effect || {};
      const md = fx.metrics_direction || {};
      return `
        <li class="suggestion">
          <div class="suggestion-head">
            <span class="badge badge-info mono">${esc(s.action || 'change')}</span>
            ${d2.from_node ? `<span class="mono">${esc(d2.from_node)}</span>` : ''} 
            ${d2.to_node ? `→ <span class="mono">${esc(d2.to_node)}</span>` : ''}
            ${Number.isFinite(s.priority) ? `<span class="badge badge-pri">P${s.priority}</span>` : ''}
          </div>
          ${fx.spatial ? `<div class="small muted">${esc(fx.spatial)}</div>` : ''}

          ${Object.keys(md).length ? `
            <div class="kv-grid mono">
              ${Object.entries(md).map(([k,v]) => `<div class="kv"><label>${esc(k)}</label><span>${esc(v)}</span></div>`).join('')}
            </div>` : ''}
        </li>
      `;
    }).join('') : '';

    const kpis = gv.kpi_summary || {};
    const met = Array.isArray(kpis.targets_met) && kpis.targets_met.length
      ? `<div class="pill-row">${kpis.targets_met.map(t=>`<span class="pill pill-ok">${esc(t)}</span>`).join('')}</div>` : '';
    const missed = Array.isArray(kpis.targets_missed) && kpis.targets_missed.length
      ? `<div class="pill-row">${kpis.targets_missed.map(t=>`<span class="pill pill-warn">${esc(t)}</span>`).join('')}</div>` : '';

    const edgesAdd = gv?.patch?.edges_add;
    const edgesUI = Array.isArray(edgesAdd) && edgesAdd.length ? `
      <div class="subsec">
        <label>Proposed connectors</label>
        <div class="pill-row">
          ${edgesAdd.map(([a,b])=>`<span class="pill pill-warn">${esc(a)} → ${esc(b)}</span>`).join('')}
        </div>
        <div style="margin-top:8px;">
          <button id="btnVerifierEdges" class="link-like" aria-pressed="false">Show suggested connectors</button>
        </div>
        <p class="muted small" style="margin-top:6px;">Draws proposed edges as thick dashed red connectors. Visual only—doesn't modify your JSON.</p>
      </div>
    ` : '';

    return `
      <div class="tab-pane" data-pane="verifier">
        <div class="verdict">${badge(gv.verdict || 'warn')}<span class="mono">Graph Verifier</span></div>
        ${gv.parti_summary ? `<p class="small">${esc(gv.parti_summary)}</p>` : ''}

        ${findings ? `
          <div class="subsec">
            <h5>Key findings</h5>
            <ul class="list">${findings}</ul>
          </div>` : ''}

        ${suggestions ? `
          <div class="subsec">
            <h5>Suggestions</h5>
            <ul class="list">${suggestions}</ul>
          </div>` : ''}

        ${(met || missed) ? `
          <div class="subsec">
            <h5>KPIs</h5>
            ${met}
            ${missed}
          </div>` : ''}

        ${edgesUI}
        ${gv.notes ? `<p class="small muted">${esc(gv.notes)}</p>` : ''}
      </div>
    `;
  };

  // Info pane = your existing meta (kept intact)
  const infoPane = `
    <div class="tab-pane active" data-pane="info">
      <h3>${esc(house.name || d.name || '—')}</h3>

      <div class="stats-cards">
        <div class="stat"><div class="stat-n">${house.rooms}</div><div class="stat-l">Rooms</div></div>
        <div class="stat"><div class="stat-n">${house.floors}</div><div class="stat-l">Floors</div></div>
        <div class="stat"><div class="stat-n">${house.edges}</div><div class="stat-l">Edges</div></div>
      </div>

      ${d.description ? `<p class="muted">${esc(d.description)}</p>` : ''}

      <div class="section">
        <h4>At a glance</h4>
        ${kv('Users', d.users)}
        ${kv('Location', d.location)}
        ${kv('Climate', d.climate)}
      </div>

      <div class="section">
        <h4>Envelope</h4>
        ${kv('Roof type', d.roof_type, 'wrap2')}
        ${kv('Facade materials', d.facade_materials, 'wrap2')}
      </div>

      ${(entry.side || anchor || entry.rationale) ? `
      <div class="section">
        <h4>Entry strategy</h4>
        ${kv('Side', entry.side)}
        ${anchor ? `<div class="kv"><label>Anchor</label><span class="mono">${esc(anchor)}</span></div>` : ''}
        ${entry.rationale ? `<p class="small muted">${esc(entry.rationale)}</p>` : ''}
      </div>` : ''}

      ${(r.parti || r.program_rationale || r.moments_list.length || r.climate_tactics_list.length || r.assumptions_list.length) ? `
      <details class="section" open>
        <summary><h4>Design rationale</h4></summary>
        ${r.parti ? kv('Parti', r.parti) : ''}
        ${r.program_rationale ? `<p class="small">${esc(r.program_rationale)}</p>` : ''}

        ${r.moments_list.length ? `
          <div class="subsec">
            <label>Moments</label>
            <ul>${r.moments_list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
          </div>` : ''}

        ${r.climate_tactics_list.length ? `
          <div class="subsec">
            <label>Climate tactics</label>
            <ul>${r.climate_tactics_list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
          </div>` : ''}

        ${r.assumptions_list.length ? `
          <div class="subsec">
            <label>Assumptions</label>
            <ul>${r.assumptions_list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
          </div>` : ''}
      </details>` : ''}
    </div>
  `;

  const sitePane = renderSiteAnalysis(d.site_analysisVLM || '');
  const verifierPane = renderGraphVerifier(d.graph_verifier || null);

  // Tabs header (only include tabs that have content)
  const tabs = [
    { id:'info',     label:'Info'    , has:true },
    { id:'site',     label:'Site'    , has: !!sitePane },
    { id:'verifier', label:'Verifier', has: !!verifierPane }
  ].filter(t => t.has);

  m.innerHTML = `
    <div class="tabs">
      <div class="tab-head" role="tablist" aria-label="Details">
        ${tabs.map((t,i)=>`
          <button class="tab ${i===0?'active':''}" role="tab" data-tab="${t.id}" aria-selected="${i===0?'true':'false'}">
            ${esc(t.label)}
          </button>
        `).join('')}
      </div>
      <div class="tab-body">
        ${infoPane}
        ${sitePane}
        ${verifierPane}
      </div>
    </div>
  `;

  // Tab switching
  m.querySelectorAll('.tab-head .tab').forEach(btn => {
    btn.onclick = () => {
      const target = btn.dataset.tab;
      m.querySelectorAll('.tab-head .tab').forEach(b=>{
        b.classList.toggle('active', b===btn);
        b.setAttribute('aria-selected', b===btn ? 'true' : 'false');
      });
      m.querySelectorAll('.tab-pane').forEach(p=>{
        p.classList.toggle('active', p.dataset.pane === target);
      });
    };
  });

  // Click a node label in Verifier → select & zoom
  m.querySelectorAll('[data-node-link]').forEach(b=>{
    b.onclick = () => {
      const id = b.getAttribute('data-node-link');
      this.viewer?.selectNode(id, true);
    };
  });

  // Verifier "show connectors" toggle (only if edges_add exists)
  const btnVC = m.querySelector('#btnVerifierEdges');
  const edgesAdd = d.graph_verifier?.patch?.edges_add || [];
  if (btnVC && edgesAdd.length) {
    this._verifierOn = !!this._verifierOn; // persist across openings
    // initialize button state text
    btnVC.textContent = this._verifierOn ? 'Hide suggested connectors' : 'Show suggested connectors';
    btnVC.setAttribute('aria-pressed', String(this._verifierOn));

    // apply current state
    const getCenter = (id) => this.viewer?.getNodeCenterById(id);
    this.viewer?.setVerifierEdges(this._verifierOn, edgesAdd, getCenter);

    btnVC.onclick = () => {
      this._verifierOn = !this._verifierOn;
      btnVC.setAttribute('aria-pressed', String(this._verifierOn));
      btnVC.textContent = this._verifierOn ? 'Hide suggested connectors' : 'Show suggested connectors';
      this.viewer?.setVerifierEdges(this._verifierOn, edgesAdd, getCenter);

      // keep overlaps highlight on top if you want
      const pairs = d?.validation?.volume_overlaps?.pairs || [];
      this.viewer?.setHighlightOverlaps(!!this._overlapsOn, pairs);
    };
  }
  // show chip only if there are suggestions
  const vb = document.getElementById('verifierBtn');
  if (vb) {
    const hasEdges = Array.isArray(this._edgesAdd) && this._edgesAdd.length > 0;
    vb.style.display = hasEdges ? '' : 'none';

    // keep label and pressed state in sync when opening
    vb.textContent = this._verifierOn ? 'Hide connectors' : 'Show connectors';
    vb.setAttribute('aria-pressed', String(!!this._verifierOn));

    // if already on (persisted), re-apply them for the new render
    if (hasEdges) {
      const getCenter = (id) => this.viewer?.getNodeCenterById(id);
      this.viewer?.setVerifierEdges(!!this._verifierOn, this._edgesAdd, getCenter);
    }
  }
}

  _renderViewer(house) {
    const view = this.viewer;
    view.clear();
    view.pickables = [];
    view.roomIndex.clear();                    // reset index
    const reg = view.createRegistrar();        // get a registrar function

    if (this.viewerMode === 'plan') {
    buildPlan(view.scene, house.data, reg);       // plan doesn't need highlight registration
    view.fitPlan(house.data);
  } else if (this.viewerMode === 'wireframe') {
    buildWireframe(view.scene, house.data, view.pickables, reg);
    buildGraphOverlay(view.scene, house.data, null, reg); // (optional) labels/graph
    view.fit3D(house.data);
  } else if (this.viewerMode === 'graph') {
    buildGraphOverlay(view.scene, house.data, null, reg);
    view.fit3D(house.data);
  } else {
    buildVolumes(view.scene, house.data, view.pickables, reg);
    buildGraphOverlay(view.scene, house.data, null, reg); // (optional) labels/graph
    view.fit3D(house.data);
  }

  if (this.privacyMode) view.setColorByPrivacy(true);

  // metric (overrides above if set)
  if (this.metric && this.metricsPerNode) {
    this.viewer.setColorByMetric(this.metric, this.metricsPerNode);
  }

  if (this._overlapsOn) {
    const pairs = house.data?.validation?.volume_overlaps?.pairs || [];
    this.viewer.setHighlightOverlaps(true, pairs);
  }const pairs = house.data?.validation?.volume_overlaps?.pairs || [];
    this.viewer.setHighlightOverlaps(!!this._overlapsOn, pairs);

  // re-apply suggested connectors after changing view mode or re-render
  if (this._verifierOn && Array.isArray(this._edgesAdd) && this._edgesAdd.length) {
    const getCenter = (id) => this.viewer?.getNodeCenterById(id);
    this.viewer?.setVerifierEdges(true, this._edgesAdd, getCenter);
  }
    }

  _ensureViewerNav() {
  // host container near the canvas
  const host = document.querySelector('#viewerCanvas')?.closest('.gl-wrap')
            || document.querySelector('#viewerCanvas')?.parentElement;
  if (!host || this._navEl) return;

  const wrap = document.createElement('div');
  wrap.className = 'viewer-nav';
  wrap.innerHTML = `
    <button id="viewerPrev" aria-label="Previous (←)" title="Previous (←)">‹</button>
    <button id="viewerNext" aria-label="Next (→)"     title="Next (→)">›</button>
  `;
  host.appendChild(wrap);
  this._navEl = wrap;

  wrap.querySelector('#viewerPrev').addEventListener('click', () => this._nav(-1));
  wrap.querySelector('#viewerNext').addEventListener('click', () => this._nav(+1));

  // keyboard: only when modal is open
  window.addEventListener('keydown', (e) => {
    const modalOpen = !document.getElementById('viewerModal')?.classList.contains('hidden');
    if (!modalOpen) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); this._nav(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this._nav(+1); }
  });
}
_nav(dir) {
  if (!this.filtered?.length) return;
  // find current index in the *filtered* list
  let i = this.filtered.findIndex(h => h.id === this._openHouse?.id);
  if (i < 0) i = 0;

  // wrap-around
  const n = this.filtered.length;
  const next = (i + dir + n) % n;

  // open
  this.openViewer(this.filtered[next]);
}
  
}

/* --------------------------- Boot --------------------------- */
window.addEventListener('DOMContentLoaded', () => { new App(); });

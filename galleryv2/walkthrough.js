// walkthrough.js  (ES module)
// Edge-faithful camera walkthrough: starts at entry, follows ONLY connected edges inward,
// dwells at first arrivals, backtracks to cover branches, never teleports.

import * as THREE from 'three';

/* --------------------------- Tunables (match script.js) --------------------------- */
const XY = 1;           // world X/Z scale
const LEVEL_RISE = 3;   // meters per floor
const EYE_HEIGHT = 1.6; // eye height

/* --------------------------- Helpers --------------------------- */
const num = (v, d=0)=> Number.isFinite(+v) ? +v : d;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp  = (a, b, t) => a + (b - a) * t;
// smoother than quadratic easeInOut for speed shaping
const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function _nodeCenterAtEye(n){
  const x = num(n.center?.[0], 0) * XY;
  const z = num(n.center?.[1], 0) * XY;
  const y = num(n.floor, 0) * LEVEL_RISE + EYE_HEIGHT;
  return new THREE.Vector3(x, y, z);
}

function _nearestNodeIdToPoint(nodes, px, pz, preferFloor=0){
  let best=null, bestD=Infinity, bestFloorBias=Infinity;
  for (const n of nodes){
    const x = num(n.center?.[0],0), z = num(n.center?.[1],0);
    const dx = x - px, dz = z - pz;
    const d  = dx*dx + dz*dz;
    const floorDiff = Math.abs(num(n.floor,0) - preferFloor);
    if (d < bestD || (Math.abs(d - bestD) < 1e-9 && floorDiff < bestFloorBias)){
      best = n.id; bestD = d; bestFloorBias = floorDiff;
    }
  }
  return best;
}

/* ---------------------- Entry-node selection ---------------------- */
export function findEntryNodeId(data){
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  if (!nodes.length) return null;

  const flagged = nodes.find(n => n.is_entry || n.entry === true);
  if (flagged) return flagged.id;

  const nameHit = nodes.find(n => {
    const nm = String(n.name || n.label || n.id || '').toLowerCase();
    return /\b(entry|main\s*entry|foyer|vestibule|lobby|porch|mudroom)\b/.test(nm);
  });
  if (nameHit) return nameHit.id;

  const anch = Array.isArray(data?.entry_strategy?.anchor_point) ? data.entry_strategy.anchor_point : null;
  if (anch && anch.length >= 2) return _nearestNodeIdToPoint(nodes, +anch[0], +anch[1], 0);

  const ground = nodes.filter(n => (n.floor ?? 0) === 0);
  const pool = ground.length ? ground : nodes;
  let minX = +Infinity;
  for (const n of pool) minX = Math.min(minX, num(n.center?.[0],0));
  let best=null, bestD=Infinity;
  for (const n of pool){
    const x = num(n.center?.[0],0), z = num(n.center?.[1],0);
    const d = (x - minX)*(x - minX) + z*z;
    if (d < bestD){ best = n.id; bestD = d; }
  }
  return best;
}

/* --------------------------- Path planners --------------------------- */
/**
 * Edge-faithful, floor-aware path:
 * - Start at entry (outside glide-in)
 * - Visit all reachable rooms on the current floor first
 * - Move to higher floors only via cross-floor edges
 * - Build DFS route over the discovered tree (edge-accurate, with backtracks)
 *
 * Returns:
 *  { points: THREE.Vector3[], order: string[], route: string[], centers: { [id]: THREE.Vector3 } }
 *    points  – smoothed camera waypoints at eye height (includes outside → entry glide)
 *    order   – first-arrival sequence (floor-grouped); use for HUD/dwell
 *    route   – raw node sequence including backtracks (edge accurate)
 *    centers – exact 3D center per first-arrival node (feed to Walkthrough as roomCenters)
 */
export function planWalkPathViaEdges(data, opts = {}) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  if (!nodes.length) return { points: [], order: [], route: [], centers: {} };

  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj  = new Map(nodes.map(n => [n.id, new Set()]));
  for (const [a, b] of edges) {
    if (adj.has(a) && adj.has(b)) { adj.get(a).add(b); adj.get(b).add(a); }
  }

  const startId = opts.entryId || findEntryNodeId(data) || nodes[0].id;
  if (!byId.has(startId)) return { points: [], order: [], route: [], centers: {} };

  const XY = 1, LEVEL_RISE = 3, EYE_HEIGHT = 1.6;
  const PAD  = 0.90;     // pre/post runway inside rooms
  const BEND = 0.55;     // corner rounding toward center
  const GLIDE = (
    (opts.entryGlideDist != null) ? +opts.entryGlideDist :
    (data?.walkthrough?.entry_glide != null) ? +data.walkthrough.entry_glide :
    2.8                                     // outside runway distance
  );

  const num = (v, d=0)=> Number.isFinite(+v) ? +v : d;
  const center3 = (id) => {
    const n = byId.get(id);
    const x = num(n.center?.[0], 0) * XY;
    const z = num(n.center?.[1], 0) * XY;
    const y = num(n.floor, 0) * LEVEL_RISE + EYE_HEIGHT;
    return new THREE.Vector3(x, y, z);
  };
  const floorOf = (id) => num(byId.get(id)?.floor, 0);

  /* ---------- Floor-aware discovery: ground → up ---------- */
  // We first-visit rooms grouped by floor. Cross-floor neighbors seed the next floor.
  const allFloors = [...new Set([...byId.keys()].map(floorOf))].sort((a,b)=>a-b);
  const seen = new Set();
  let frontier = [startId];  // seeds for the current/next floor
  const order = [];          // first-arrival order (floor-grouped)
  const parent = new Map([[startId, null]]); // build a spanning tree as we discover (for route)

  for (const F of allFloors) {
    // Ensure we have an on-floor seed
    let seeds = frontier.filter(id => floorOf(id) === F);
    if (!seeds.length) {
      const seed = [...byId.keys()].find(id => !seen.has(id) && floorOf(id) === F);
      if (seed) seeds = [seed];
    }
    if (!seeds.length) continue;

    const q = [...new Set(seeds)];
    const localSeen = new Set(q);

    while (q.length) {
      const u = q.shift();

      // First arrival on this floor
      if (!seen.has(u) && floorOf(u) === F) {
        seen.add(u);
        order.push(u);
      }

      for (const v of adj.get(u) || []) {
        // record parent the first time we encounter v (respecting edges)
        if (!parent.has(v)) parent.set(v, u);

        const fV = floorOf(v);
        if (fV === F) {
          if (!localSeen.has(v)) { localSeen.add(v); q.push(v); }
        } else {
          // cross-floor neighbor: seed future floors (keep duplicates out later)
          if (!seen.has(v)) frontier.push(v);
        }
      }
    }
    // remove duplicates in frontier while preserving order
    frontier = [...new Set(frontier)];
  }

  // If some nodes were completely disconnected from the entry component,
  // pick them up floor-by-floor (still floor-grouped, but unreachable from entry).
  if (seen.size < byId.size) {
    for (const F of allFloors) {
      for (const id of byId.keys()) {
        if (!seen.has(id) && floorOf(id) === F) {
          seen.add(id);
          order.push(id);
          // give it a parent if any same-floor neighbor exists
          const neighbor = [...(adj.get(id) || [])].find(nid => parent.has(nid));
          if (!parent.has(id)) parent.set(id, neighbor ?? null);
        }
      }
    }
  }

  /* ---------- Route (edge-accurate): DFS over discovered tree ---------- */
  // Build children lists from "parent" to get a spanning tree consistent with first-visit order.
  const kids = new Map(nodes.map(n => [n.id, []]));
  for (const [v, p] of parent) if (p) kids.get(p).push(v);

  // Sort children a bit "inward": toward centroid of discovered rooms on the same floor
  const centroidByFloor = new Map();
  for (const F of allFloors) {
    const ids = order.filter(id => floorOf(id) === F);
    let sx=0, sz=0, c=0;
    for (const id of ids) { const n = byId.get(id); sx += num(n.center?.[0],0); sz += num(n.center?.[1],0); c++; }
    centroidByFloor.set(F, { x: sx/Math.max(1,c), z: sz/Math.max(1,c) });
  }
  for (const [u, arr] of kids) {
    const F = floorOf(u);
    const cen = centroidByFloor.get(F) || { x:0, z:0 };
    arr.sort((a,b)=>{
      const na=byId.get(a), nb=byId.get(b);
      const da=(num(na.center?.[0],0)-cen.x)**2 + (num(na.center?.[1],0)-cen.z)**2;
      const db=(num(nb.center?.[0],0)-cen.x)**2 + (num(nb.center?.[1],0)-cen.z)**2;
      return da - db;
    });
  }

  const route = [];
  (function dfs(u){
    route.push(u);
    for (const v of kids.get(u) || []) {
      route.push(v);    // step to child
      dfs(v);
      route.push(u);    // backtrack
    }
  })(startId);

  /* ---------- Waypoints (outside glide + smooth passes) ---------- */
  const centers = {};     // first-arrival center for HUD/events
  const first   = new Set();
  const points  = [];

  // Outside runway before entry
  const entryC = center3(startId);
  let outDir = new THREE.Vector3(1,0,0);
  const neigh = [...(adj.get(startId) || [])];

  if (neigh.length) {
    const avg = new THREE.Vector3();
    for (const v of neigh) avg.add(center3(v));
    avg.multiplyScalar(1 / neigh.length);
    outDir.copy(entryC.clone().sub(avg)).setY(0); // point from neighbor cluster → entry (outside)
  } else {
    // fallback: away from on-floor centroid
    const F0 = floorOf(startId);
    const cen = centroidByFloor.get(F0) || { x: entryC.x, z: entryC.z };
    outDir.set(entryC.x - cen.x, 0, entryC.z - cen.z);
  }
  if (outDir.lengthSq() < 1e-6) outDir.set(1,0,0);
  outDir.normalize();
  // 0) start outside and glide toward the entry
  points.push(entryC.clone().addScaledVector(outDir, GLIDE));

  // Build along the edge-accurate route
  for (let i = 0; i < route.length; i++) {
    const id = route[i];
    const c  = center3(id);
    const hasPrev = i > 0, hasNext = i + 1 < route.length;

    const dirIn  = hasPrev ? c.clone().sub(center3(route[i-1])).setY(0).normalize() : null;
    const dirOut = hasNext ? center3(route[i+1]).clone().sub(c).setY(0).normalize() : null;

    if (!first.has(id)) {
      first.add(id);
      centers[id] = c.clone();

      if (id === startId) {
        // We already added the outside runway. Ease into the entry center,
        // optional bend if we have both in & out, then post segment.
        if (dirIn && dirOut) {
          const bis = dirIn.clone().negate().add(dirOut).normalize();
          if (bis.lengthSq() > 1e-6) points.push(c.clone().addScaledVector(bis, BEND));
        }
        points.push(c.clone()); // center (first dwell/HUD happens here)
        if (dirOut) points.push(c.clone().add(dirOut.clone().multiplyScalar(PAD)));
      } else {
        // Normal first arrival: pre → (bend) → center → post
        points.push(
          c.clone().sub(dirIn ? dirIn.clone().multiplyScalar(PAD) : new THREE.Vector3(PAD,0,0))
        );
        if (dirIn && dirOut) {
          const bis = dirIn.clone().negate().add(dirOut).normalize();
          if (bis.lengthSq() > 1e-6) points.push(c.clone().addScaledVector(bis, BEND));
        }
        points.push(c.clone()); // center
        points.push(
          c.clone().add(dirOut ? dirOut.clone().multiplyScalar(PAD) : new THREE.Vector3(PAD,0,0))
        );
      }
    } else {
      // Backtrack pass through an already-visited room – single center keeps the curve continuous
      points.push(c.clone());
    }
  }

  // Ensure first-arrival order follows the floor-grouped discovery we computed
  const firstSet = new Set(order); // order is already floor-grouped
  const finalOrder = order.filter(id => firstSet.has(id));

  return { points, order: finalOrder, route, centers };
}




/* ------------------------- Walkthrough runner ------------------------- */
export class Walkthrough {
  /**
   * @param {SceneView} sceneView
   * @param {THREE.Vector3[]} points  - Catmull-Rom control points (includes outside→entry glide)
   * @param {object} opts:
   *  - speed (m/s)                 default 1.6
   *  - lookAhead (m)               default 1.2
   *  - loop (bool)                 default false
   *  - roomOrder (id[])            first-arrival sequence; entry must be idx 0
   *  - roomCenters {id: Vector3}   exact 3D centers used to place events precisely (optional)
   *  - onRoomEnter(id)             called on first arrival to a room
   *  - dwellSec (s)                default 1.0
   *  - slowRadius (m)              default 2.0
   *  - slowFactor (0..1)           default 0.25
   *  - resumeBoost (>1)            default 1.25
   *  - postBoostMs (ms)            default 600
   *  - maxYawRate (deg/sec)        default 140
   *  - perRoomDwell {id: seconds}  optional
   *  - rampUpSec (s)               ease-in duration from rest. default 0.9
   */
  constructor(sceneView, points, opts = {}) {
    this.vw = sceneView;
    this.opts = Object.assign({
      speed: 1.6,
      lookAhead: 1.2,
      loop: false,
      roomOrder: null,
      roomCenters: null,
      onRoomEnter: null,
      dwellSec: 1.0,
      slowRadius: 2.0,
      slowFactor: 0.25,
      resumeBoost: 1.25,
      postBoostMs: 600,
      maxYawRate: 140,
      perRoomDwell: null,
      rampUpSec: 0.9,
    }, opts);

    this._raf = null;
    this._paused = false;

    // Curve + arc-length lookup
    this.curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.08);
    this._buildArcTable(points);

    // ---- Build first-arrival center events (entry first) ----
    this._events = [];
    if (Array.isArray(this.opts.roomOrder) && this.opts.roomOrder.length) {
      const centersMap = this.opts.roomCenters || null;

      const idToS = (id) => {
        if (centersMap && centersMap[id]) return this._sAtClosestPoint(centersMap[id]);
        const nCenter = this.vw?.roomIndex?.get?.(id)?.center || null;
        return nCenter ? this._sAtClosestPoint(nCenter) : null;
      };

      // Ensure entry (index 0) is added first
      const entryId = this.opts.roomOrder[0];
      const sEntry  = idToS(entryId);
      if (entryId && sEntry != null) this._events.push({ s: sEntry, id: entryId, fired: false });

      // Then the rest (skip duplicate)
      for (let i = 1; i < this.opts.roomOrder.length; i++) {
        const id = this.opts.roomOrder[i];
        const s  = idToS(id);
        if (s != null) this._events.push({ s, id, fired: false });
      }

      // Safety: keep in ascending arc order
      this._events.sort((a, b) => a.s - b.s);
    }

    // Travel state
    this._s = 0;
    this._len = this._len || 0; // set in _buildArcTable
    this._lastTs = 0;

    // Pause/boost/ramp state
    this._holdMs = 0;
    this._postBoostRem = 0;
    this._postBoostWindowMs = this.opts.postBoostMs;
    this._ageSec = 0;

    // Heading smoothing
    this._lastYaw = null;
  }

  /* ======================= Public API ======================= */
  start() {
    this._paused = false;
    this._lastTs = performance.now();
    this._ageSec = 0;   // reset ramp timer
    if (!this._raf) this._tick();
  }
  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
  togglePause() {
    this._paused = !this._paused;
    if (!this._paused && !this._raf) this.start();
  }
  isRunning() { return !!this._raf && !this._paused; }
  setSpeed(v) { this.opts.speed = Math.max(0, +v || 0); }

  /* ======================= Internals ======================== */
  _buildArcTable(points) {
    const SAMPLES = Math.max(240, points.length * 12);
    this._arc = new Float32Array(SAMPLES);
    this._ts  = new Float32Array(SAMPLES);
    let s = 0;
    let prev = this.curve.getPoint(0);
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      const p = this.curve.getPoint(t);
      s += p.distanceTo(prev);
      this._arc[i] = s;
      this._ts[i]  = t;
      prev = p;
    }
    this._len = s;
  }

  _tAtS(s) {
    const L = this._arc.length;
    if (s <= 0) return 0;
    if (s >= this._len) return 1;
    let lo = 0, hi = L - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this._arc[mid] < s) lo = mid; else hi = mid;
    }
    const s0 = this._arc[lo], s1 = this._arc[hi];
    const t0 = this._ts[lo],  t1 = this._ts[hi];
    const u  = (s - s0) / Math.max(1e-9, s1 - s0);
    return t0 + (t1 - t0) * u;
  }

  _sAtClosestPoint(p) {
    // nearest arc sample to arbitrary point
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < this._ts.length; i++) {
      const t = this._ts[i];
      const q = this.curve.getPoint(t);
      const d = q.distanceToSquared(p);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return this._arc[bestI];
  }

  _tick = () => {
    this._raf = requestAnimationFrame(this._tick);
    const now = performance.now();
    const dt  = Math.min(0.05, (now - this._lastTs) / 1000);
    this._lastTs = now;
    if (this._paused) return;

    // Age for ramp
    this._ageSec += dt;

    // If dwelling, hold position but still maintain aim
    if (this._holdMs > 0) {
      this._holdMs -= dt * 1000;
      this._updateCameraPose(dt, 0);
      return;
    }

    // -------- Speed shaping (ramp-in, slow-in, post-boost) --------
    let curSpeed = this.opts.speed;

    // Approach slow-down to next event
    const nextEvt = this._events.find(e => !e.fired);
    if (nextEvt) {
      const distToCenter = Math.max(0, nextEvt.s - this._s);
      if (distToCenter <= this.opts.slowRadius) {
        const u = clamp(distToCenter / Math.max(1e-6, this.opts.slowRadius), 0, 1);
        const mult = lerp(this.opts.slowFactor, 1.0, smoothstep(u));
        curSpeed *= mult;
      }
    }

    // Post-dwell gentle boost
    if (this._postBoostRem > 0) {
      this._postBoostRem = Math.max(0, this._postBoostRem - dt * 1000);
      const k = this._postBoostRem / Math.max(1, this._postBoostWindowMs);
      curSpeed *= lerp(1.0, this.opts.resumeBoost, k);
    }

    // Ramp-in from standstill
    if (this.opts.rampUpSec > 0) {
      const u = clamp(this._ageSec / this.opts.rampUpSec, 0, 1);
      curSpeed *= smoothstep(u);
    }

    // -------- Advance with crossing-aware event handling --------
    const sPrev = this._s;
    let sNext = sPrev + curSpeed * dt;

    // loop / end handling
    if (sNext >= this._len) {
      if (!this.opts.loop) {
        this._s = this._len;
        this._updateCameraPose(dt, 0);
        this.stop();
        return;
      }
      // loop back
      sNext = 0;
      this._events.forEach(e => e.fired = false);
      this._ageSec = 0; // ramp again on loop if desired
    }

    // Check if we cross any unfired event this frame
    const eps = 1e-4;
    const crossed = this._events.find(e => !e.fired && (sPrev - eps) < e.s && e.s <= (sNext + eps));
    if (crossed) {
      // Snap exactly to the event, show HUD, dwell, and return
      this._s = crossed.s;
      this._updateCameraPose(dt, 0.6);

      this.opts.onRoomEnter?.(crossed.id);

      const dwellMs = (this.opts.perRoomDwell?.[crossed.id] ?? this.opts.dwellSec) * 1000;
      this._holdMs = Math.max(0, dwellMs);

      this._postBoostWindowMs = Math.max(120, this.opts.postBoostMs);
      this._postBoostRem = this._postBoostWindowMs;

      crossed.fired = true;
      return;
    }

    // No crossing: just advance and keep flying
    this._s = sNext;
    this._updateCameraPose(dt, this.opts.lookAhead);
  }

  _updateCameraPose(dt, advance = 1.2) {
    const cam = this.vw.camera;
    const ctr = this.vw.controls;

    // Where we are and where we look ahead to
    const t   = this._tAtS(this._s);
    const sLA = clamp(this._s + Math.max(0.3, advance), 0, this._len);
    const tLA = this._tAtS(sLA);

    const p = this.curve.getPoint(t);
    const q = this.curve.getPoint(tLA);

    // Position follows curve directly
    cam.position.copy(p);

    // Target smoothing & yaw-rate clamp (prevents sudden spins)
    const curYaw = Math.atan2(q.x - p.x, q.z - p.z); // yaw around Y (radians)
    if (this._lastYaw == null) this._lastYaw = curYaw;

    const maxYawStep = THREE.MathUtils.degToRad(this.opts.maxYawRate) * dt;
    let delta = curYaw - this._lastYaw;
    // wrap to [-PI, PI]
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    delta = clamp(delta, -maxYawStep, maxYawStep);
    this._lastYaw += delta;

    // Rebuild a softened target using clamped yaw & current distance to look-ahead
    const dist = Math.max(0.2, q.distanceTo(p));
    const softTarget = new THREE.Vector3(
      p.x + Math.sin(this._lastYaw) * dist,
      q.y, // keep natural vertical aim
      p.z + Math.cos(this._lastYaw) * dist
    );

    ctr.target.lerp(softTarget, 0.35);
    ctr.update();
  }
}


/* ---------------------- tiny helpers ---------------------- */
// const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// const lerp  = (a, b, t) => a + (b - a) * t;
// // smoother than quadratic easeInOut for speed shaping
// const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));



// --- Heads-Up Display for walkthrough (exported) -------------------------
/**
 * Creates a small overlay in the viewer for room title + unique features.
 * Usage:
 *   const hud = attachWalkHUD(viewer);
 *   hud.show(nodeId, nodeObject);   // when entering a room
 *   hud.hide();                     // when pausing/stopping
 */
export function attachWalkHUD(sceneView, opts = {}) {
  const {
    maxWidth = '560px',
    titleFontSize = '14px',
    privFontSize = '11px',
    featureFontSize = '16px',   // ← make the unique features bigger
    featureLineHeight = '1.55',
    featureWeight = 500         // 400..700
  } = opts;

  const host = sceneView?.glWrap || sceneView?.renderer?.domElement?.parentElement || document.body;

  const box = document.createElement('div');
  box.className = 'walk-hud hidden';
  box.innerHTML = `
    <div class="wh-inner">
      <div class="wh-title"></div>
      <div class="wh-priv"></div>
      <div class="wh-text"></div>
    </div>
  `;
  Object.assign(box.style, {
    position: 'absolute',
    left: '50%',
    bottom: '16px',
    transform: 'translateX(-50%)',
    zIndex: '6',
    pointerEvents: 'none',
    transition: 'opacity 180ms ease',
    opacity: '0'
  });

  const inner = box.querySelector('.wh-inner');
  Object.assign(inner.style, {
    maxWidth,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    background: 'rgba(14, 18, 22, 0.72)',
    color: 'white',
    padding: '12px 14px',
    borderRadius: '14px',
    boxShadow: '0 8px 20px rgba(0,0,0,.18)',
    border: '1px solid rgba(255,255,255,0.12)',
    font: '400 13px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  });

  const titleEl = box.querySelector('.wh-title');
  Object.assign(titleEl.style, {
    fontWeight: '700',
    fontSize: titleFontSize,   // ← was 14px
    lineHeight: '1.3',
    marginBottom: '2px',
    letterSpacing: '.2px'
  });

  const privEl = box.querySelector('.wh-priv');
  Object.assign(privEl.style, {
    fontSize: privFontSize,    // ← was 11px
    opacity: '.9',
    marginBottom: '6px'
  });

  const textEl = box.querySelector('.wh-text');
  Object.assign(textEl.style, {
    fontSize: featureFontSize,     // ← the unique-features size
    lineHeight: featureLineHeight,
    fontWeight: String(featureWeight),
    opacity: '.98'
  });

  host.appendChild(box);

  const fmt = (s)=> String(s ?? '').trim();
  const privLabel = (p)=> (p ? String(p).replace(/_/g,' ') : '');

  let hideTimer = null;
  const api = {
    show(id, node, autoHideMs = null) {
      const title = node?.name ?? node?.label ?? node?.type ?? node?.id ?? '—';
      const features = fmt(node?.unique_features || '');
      const priv = privLabel(node?.privacy_level);

      titleEl.textContent = title;
      privEl.textContent = priv ? `Privacy: ${priv}` : '';
      textEl.textContent = features;

      box.classList.remove('hidden');
      box.style.opacity = '1';

      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (Number.isFinite(autoHideMs) && autoHideMs > 0) {
        hideTimer = setTimeout(() => api.hide(), autoHideMs);
      }
    },
    hide() {
      box.style.opacity = '0';
      setTimeout(() => box.classList.add('hidden'), 200);
    },
    destroy() {
      if (hideTimer) clearTimeout(hideTimer);
      box.remove();
    }
  };

  return api;
}


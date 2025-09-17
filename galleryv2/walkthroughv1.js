// walkthrough.js  (ES module)
// A smoother camera walkthrough runner for your SceneView.
//
// Exports:
//   - planWalkPath(data, options) -> { points: THREE.Vector3[], order: string[] }
//   - findEntryNodeId(data) -> string | null
//   - Walkthrough(sceneView, points, opts) -> controller with
//       start(), stop(), togglePause(), isRunning(), setSpeed(v)
//
// Assumptions match your app:
//   - data.nodes: [{ id, center:[x,z], width/size, depth/size, height/room_height, floor, ...}]
//   - data.edges: [ [idA, idB], ... ]
//   - optional data.entry_strategy.anchor_point: [x, z]
//   - SceneView has { camera, controls } and your render loop already runs.

import * as THREE from 'three';

/* --------------------------- Tunables (keep in sync with app) --------------------------- */
const XY = 1;            // world scale in X/Z (must match script.js)
const LEVEL_RISE = 3;    // vertical distance per floor (must match script.js)
const EYE_HEIGHT = 1.6;  // meters above floor

/* --------------------------- Small helpers --------------------------- */
const num = (v, d=0)=> Number.isFinite(+v) ? +v : d;

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

  // 1) explicit flag
  const flagged = nodes.find(n => n.is_entry || n.entry === true);
  if (flagged) return flagged.id;

  // 2) name hint
  const nameHit = nodes.find(n => {
    const nm = String(n.name || n.label || n.id || '').toLowerCase();
    return /\b(entry|main\s*entry|foyer|vestibule|lobby|porch|mudroom)\b/.test(nm);
  });
  if (nameHit) return nameHit.id;

  // 3) entry_strategy anchor point
  const anch = Array.isArray(data?.entry_strategy?.anchor_point) ? data.entry_strategy.anchor_point : null;
  if (anch && anch.length >= 2) return _nearestNodeIdToPoint(nodes, +anch[0], +anch[1], 0);

  // 4) fallback: closest ground-floor room to min-X (pretend street side)
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

/* --------------------------- Path planner --------------------------- */
/**
 * Builds a room visit order (BFS from entry) and a smoothed Catmull-Rom
 * waypoint list at eye-height with tiny pre/post pads around each room center.
 */
export function planWalkPath(data, opts={}){
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  if (!nodes.length) return { points: [], order: [] };

  // Lookup + adjacency
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, []]));
  for (const [a,b] of edges){
    if (adj.has(a) && adj.has(b)){ adj.get(a).push(b); adj.get(b).push(a); }
  }

  const startId = opts.entryId || findEntryNodeId(data) || nodes[0].id;
  const seen = new Set([startId]);
  const order = [];
  const q = [startId];

  // BFS from entry
  while (q.length){
    const u = q.shift(); order.push(u);
    for (const v of (adj.get(u) || [])) if (!seen.has(v)){ seen.add(v); q.push(v); }
  }

  // Disconnected? Greedy nearest-next to pick up remaining
  if (seen.size < nodes.length){
    const rest = nodes.map(n=>n.id).filter(id => !seen.has(id));
    let cur = order.at(-1) ?? startId;
    while (rest.length){
      const C = byId.get(cur);
      const cx = num(C.center?.[0],0), cz = num(C.center?.[1],0);
      let pickIdx = 0, best = Infinity;
      for (let i=0;i<rest.length;i++){
        const N = byId.get(rest[i]);
        const dx=cx-num(N.center?.[0],0), dz=cz-num(N.center?.[1],0);
        const d=dx*dx+dz*dz;
        if (d<best){best=d; pickIdx=i;}
      }
      const id = rest.splice(pickIdx,1)[0];
      order.push(id); seen.add(id); cur=id;
    }
  }

  // Waypoints with small pre/post padding (helps smoothness and avoids “cutting corners”)
  const PAD = 0.6;
  const pts = [];
  for (let i=0;i<order.length;i++){
    const A = byId.get(order[i]);
    const pA = _nodeCenterAtEye(A);
    let dir = new THREE.Vector3(1,0,0);
    if (i+1<order.length) dir.copy(_nodeCenterAtEye(byId.get(order[i+1]))).sub(pA).setY(0);
    else if (i>0)        dir.copy(pA).sub(_nodeCenterAtEye(byId.get(order[i-1]))).setY(0);
    if (dir.lengthSq()>1e-6) dir.normalize();
    pts.push(pA.clone().addScaledVector(dir,-PAD)); // enter
    pts.push(pA.clone());                           // center
    pts.push(pA.clone().addScaledVector(dir,+PAD)); // exit
  }

  return { points: pts, order };
}

// --- NEW: edge-faithful route and path ---------------------------------
export function planWalkPathViaEdges(data, opts = {}) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  if (!nodes.length) return { points: [], order: [], route: [] };

  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, new Set()]));
  for (const [a, b] of edges) {
    if (adj.has(a) && adj.has(b)) { adj.get(a).add(b); adj.get(b).add(a); }
  }

  const startId = opts.entryId || findEntryNodeId(data) || nodes[0].id;
  if (!byId.has(startId)) return { points: [], order: [], route: [] };

  // Depth-first walk over the connected component, including backtracking
  const seen = new Set();
  const route = []; // sequence of node ids visited step-by-step (edges between consecutive ids exist)
  (function dfs(u, parent = null) {
    seen.add(u);
    route.push(u);
    for (const v of adj.get(u) || []) {
      if (!seen.has(v)) {
        // go to child
        route.push(v);
        dfs(v, u);
        // backtrack to u if more neighbors remain (and we're not ending here)
        route.push(u);
      }
    }
  })(startId);

  // If there are other components, we won't "teleport" across no-edge gaps.
  // You can choose to start a new walk per component later if desired.

  // Build waypoints strictly along edges in `route`
  // We’ll create [pre, center, post] for every *first arrival* to a node,
  // and simple [center] for revisits during backtracking.
  const firstArrived = new Set();
  const points = [];
  const order = []; // first-visit order (for room-enter dwells)
  const PAD = 0.9;    // approach/exit runway
const BEND = 0.55;  // corner rounding strength

const centerOf = (id) => _nodeCenterAtEye(byId.get(id));
const first = new Set();


for (let i = 0; i < route.length; i++) {
  const id = route[i];
  const c  = centerOf(id);
  const hasPrev = i > 0, hasNext = i + 1 < route.length;

  const dirIn  = hasPrev ? c.clone().sub(centerOf(route[i-1])).setY(0).normalize() : null;
  const dirOut = hasNext ? centerOf(route[i+1]).clone().sub(c).setY(0).normalize() : null;

  if (!first.has(id)) {
    first.add(id); order.push(id);

    // pre
    points.push(c.clone().sub(dirIn ? dirIn.clone().multiplyScalar(PAD) : new THREE.Vector3(PAD,0,0)));

    // rounded corner (bisector between -dirIn and dirOut)
    if (dirIn && dirOut) {
      const bis = dirIn.clone().negate().add(dirOut).normalize();
      if (bis.lengthSq() > 1e-6) points.push(c.clone().addScaledVector(bis, BEND));
    }

    // center (for dwell)
    points.push(c.clone());

    // post
    points.push(c.clone().add(dirOut ? dirOut.clone().multiplyScalar(PAD) : new THREE.Vector3(PAD,0,0)));
  } else {
    points.push(c.clone()); // backtrack pass
  }
}

  return { points, order, route };
}

/* ------------------------- Walkthrough runner ------------------------- */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2); // smooth ease

/**
 * Camera walkthrough controller
 *
 * Options:
 *  - speed: base cruise speed (m/s). default 1.6
 *  - lookAhead: meters ahead along the curve to aim the target. default 1.2
 *  - loop: loop path when done. default false
 *  - onRoomEnter(id): callback when reaching a room center
 *  - roomOrder: array of node ids aligned with centers (1 per 3 points)
 *  - dwellSec: seconds to pause at each center. default 1.0
 *  - slowRadius: meters before center where slow-down begins. default 2.0
 *  - slowFactor: min speed multiplier at center (0..1). default 0.25
 *  - resumeBoost: brief accel multiplier after dwell (>1). default 1.25
 *  - postBoostMs: duration of the post-boost, ms. default 600
 *  - maxYawRate: deg/sec to clamp camera turn speed (prevents snap). default 180
 *  - perRoomDwell: optional Map/Object { id -> seconds } to override dwell per room
 */
export class Walkthrough {
  constructor(sceneView, points, opts={}){
    this.vw = sceneView;
    this.opts = Object.assign({
      speed: 1.6,
      lookAhead: 1.2,
      loop: false,
      onRoomEnter: null,
      roomOrder: null,
      dwellSec: 1.0,
      slowRadius: 2.0,
      slowFactor: 0.25,
      resumeBoost: 1.25,
      postBoostMs: 600,
      maxYawRate: 180, // deg/sec
      perRoomDwell: null
    }, opts);

    this._raf = null;
    this._paused = false;

    // Curve + arc-length table
    this.curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.08);
    this._buildArcTable(points);

    // Room-center events (every 3rd point is center)
    this._events = [];
    if (Array.isArray(this.opts.roomOrder) && this.opts.roomOrder.length){
      for (let i=1, r=0; i<points.length; i+=3, r++){
        const sCenter = this._sAtPoint(points[i]);
        const id = this.opts.roomOrder[r] ?? null;
        this._events.push({ s: sCenter, id, fired: false });
      }
    }

    // Travel state
    this._s = 0;
    this._lastTs = 0;

    // Dwell & boost state
    this._holdMs = 0;
    this._postBoostRem = 0;

    // Heading smoothing state
    this._lastYaw = null; // radians
  }

  /* ---------- public API ---------- */
  start(){ this._paused = false; this._lastTs = performance.now(); if (!this._raf) this._tick(); }
  stop(){ if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
  togglePause(){ this._paused = !this._paused; if (!this._paused && !this._raf) this.start(); }
  isRunning(){ return !!this._raf && !this._paused; }
  setSpeed(v){ this.opts.speed = Math.max(0, +v || 0); }

  /* ---------- internals ---------- */
  _buildArcTable(points){
    const SAMPLES = Math.max(240, points.length * 12);
    this._arc = new Float32Array(SAMPLES);
    this._ts  = new Float32Array(SAMPLES);
    let s = 0;
    let prev = this.curve.getPoint(0);
    for (let i=0;i<SAMPLES;i++){
      const t = i/(SAMPLES-1);
      const p = this.curve.getPoint(t);
      s += p.distanceTo(prev);
      this._arc[i] = s;
      this._ts[i]  = t;
      prev = p;
    }
    this._len = s;
  }

  _tAtS(s){
    const L = this._arc.length;
    if (s <= 0) return 0;
    if (s >= this._len) return 1;
    let lo=0, hi=L-1;
    while (hi - lo > 1){
      const mid = (lo+hi)>>1;
      if (this._arc[mid] < s) lo = mid; else hi = mid;
    }
    const s0 = this._arc[lo], s1 = this._arc[hi];
    const t0 = this._ts[lo],  t1 = this._ts[hi];
    const u = (s - s0) / Math.max(1e-9, s1 - s0);
    return t0 + (t1 - t0) * u;
  }

  _sAtPoint(p){
    let bestI = 0, bestD = Infinity;
    for (let i=0;i<this._ts.length;i++){
      const t = this._ts[i];
      const q = this.curve.getPoint(t);
      const d = q.distanceToSquared(p);
      if (d < bestD){ bestD = d; bestI = i; }
    }
    return this._arc[bestI];
  }

  _tick = () => {
    this._raf = requestAnimationFrame(this._tick);
    const now = performance.now();
    const dt  = Math.min(0.05, (now - this._lastTs) / 1000); // clamp huge frame skips
    this._lastTs = now;

    if (this._paused) return;

    // 1) DWELL: if we’re holding at a center, stay put but keep aiming ahead
    if (this._holdMs > 0) {
      this._holdMs -= dt * 1000;
      this._updateCameraPose(dt, /*advance*/0);
      return;
    }

    // 2) Dynamic speed: approach slow-down + optional brief post-boost
    let curSpeed = this.opts.speed;

    // Find next unfired center and slow as we approach it (along-curve distance)
    const nextEvt = this._events.find(e => !e.fired);
    if (nextEvt) {
      const distToCenter = Math.max(0, nextEvt.s - this._s);
      if (distToCenter <= this.opts.slowRadius) {
        // ease from 1 → slowFactor across [0, slowRadius]
        const u = clamp(distToCenter / Math.max(1e-6, this.opts.slowRadius), 0, 1);
        const eased = easeInOut(u); // nicer than linear
        const mult = lerp(this.opts.slowFactor, 1.0, eased);
        curSpeed *= mult;
      }
    }

    // Post-dwell gentle boost (decays back to 1.0)
    if (this._postBoostRem > 0) {
      this._postBoostRem = Math.max(0, this._postBoostRem - dt * 1000);
      const k = this._postBoostRem / Math.max(1, this._postBoostWindowMs);
      curSpeed *= lerp(1.0, this.opts.resumeBoost, k);
    }

    // 3) Advance along arc-length
    this._s += curSpeed * dt;

    // 4) End or loop
    if (this._s >= this._len) {
      if (this.opts.loop) {
        this._s = 0;
        this._events.forEach(e => e.fired = false);
      } else {
        this._s = this._len;
        this._updateCameraPose(dt, /*advance*/0);
        this.stop();
        return;
      }
    }

    // 5) Update camera
    this._updateCameraPose(dt, /*advance*/ this.opts.lookAhead);

    // 6) Room-center events: snap to exact center, dwell, and post-boost
    for (const e of this._events) {
      if (!e.fired && this._s >= e.s) {
        e.fired = true;

        // Snap to center so we don't overshoot before pausing
        this._s = e.s;
        this._updateCameraPose(dt, 0.6); // tiny lookAhead while paused

        // Callback
        this.opts.onRoomEnter?.(e.id);

        // Dwell: per-room override if provided
        const dwell = (this.opts.perRoomDwell?.[e.id] ?? this.opts.dwellSec) * 1000;
        this._holdMs = Math.max(0, dwell);

        // Post-boost after dwell
        this._postBoostWindowMs = Math.max(120, this.opts.postBoostMs);
        this._postBoostRem = this._postBoostWindowMs;

        break; // handle one event per frame
      }
    }
  }

  _updateCameraPose(dt, advance=1.2){
    const cam = this.vw.camera;
    const ctr = this.vw.controls;

    const t  = this._tAtS(this._s);
    const sLA = clamp(this._s + Math.max(0.3, advance), 0, this._len);
    const tLA = this._tAtS(sLA);

    const p = this.curve.getPoint(t);
    const q = this.curve.getPoint(tLA);

    // Position follows curve directly
    cam.position.copy(p);

    // Target smoothing & yaw-rate clamp (prevents sudden spins)
    const curYaw = Math.atan2(q.x - p.x, q.z - p.z); // yaw around Y (radians), screen-aligned
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

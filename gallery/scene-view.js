import { CURRENT, STYLE } from "./themes.js";
import { Builders } from "./builders.js";
import { updateLabelScales } from "./labels.js";
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneView {
  constructor(canvas){
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);
    this.renderer.setClearColor(0xffffff, 1);

    this.camera = new THREE.PerspectiveCamera(60, this._aspect(), 0.1, 1000);
    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);

    this.disposables=[]; this.pickables=[]; this.labels=[];
    this._click = (e)=>this._handlePick(e);
    canvas.addEventListener("click", this._click);

    this._ro = new ResizeObserver(()=>this._resize());
    this._ro.observe(canvas.parentElement || canvas);

    const loop = ()=>{
      this._raf = requestAnimationFrame(loop);
      this.controls.update();
      const w=this.canvas.clientWidth||1, h=this.canvas.clientHeight||1;
      this.renderer.setSize(w,h,false);
      if(this._pendingFitMode && w>0 && h>0){ const m=this._pendingFitMode; this._pendingFitMode=null; this.fitToContent(m); }
      if(this.labels.length) updateLabelScales(this.labels, this.camera);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _aspect(){ return (this.canvas.clientWidth||1)/(this.canvas.clientHeight||1); }

  computeWorldBounds(data){
    const nodes=Array.isArray(data?.nodes)?data.nodes:[]; if(!nodes.length)
      return { center:[0,0,0], radius:10, aabb:{min:[0,0,0],max:[0,0,0]} };
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const n of nodes){
      const w=Math.max(Number((n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0]) || 4), 0.001);
      const d=Math.max(Number((n.width?.[1] ?? n.depth ?? n.size?.[1]) || 4), 0.001);
      const h=Math.max(Number(n.height??n.room_height??3),0.001);
      const cx=Number(n.center?.[0]||0), cz=Number(n.center?.[1]||0);
      const y0 = STYLE.floorIsIndex ? Number(n.floor||0)*STYLE.levelRise : Number(n.floor||0);
      const y1 = y0 + h;
      minX=Math.min(minX, cx-w/2); maxX=Math.max(maxX, cx+w/2);
      minZ=Math.min(minZ, cz-d/2); maxZ=Math.max(maxZ, cz+d/2);
      minY=Math.min(minY, y0);     maxY=Math.max(maxY, y1);
    }
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
    const spanX=Math.max(0.01,maxX-minX), spanY=Math.max(0.01,maxY-minY), spanZ=Math.max(0.01,maxZ-minZ);
    const radius = Math.max(spanX,spanY,spanZ)*0.6;
    return { center:[cx,cy,cz], radius, aabb:{min:[minX,minY,minZ], max:[maxX,maxY,maxZ]} };
  }

  computePlanBounds(data){
    const nodes=Array.isArray(data?.nodes)?data.nodes:[]; if(!nodes.length) return {min:{x:-1,z:-1}, max:{x:1,z:1}};
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const n of nodes){
      const w=Math.max(Number((n.width?.[0]??n.width??n.w??n.size?.[0])||4),0.001);
      const d=Math.max(Number((n.width?.[1]??n.depth??n.size?.[1])||4),0.001);
      const x=Number(n.center?.[0]||0), z=Number(n.center?.[1]||0);
      minX=Math.min(minX, x-w/2); maxX=Math.max(maxX, x+w/2);
      minZ=Math.min(minZ, z-d/2); maxZ=Math.max(maxZ, z+d/2);
    }
    return {min:{x:minX,z:minZ}, max:{x:maxX,z:maxZ}};
  }

  fitToContent(mode="volumes"){
    const data=this._lastData; if(!data) return;
    if(mode==="plan"){ const b=this.computePlanBounds(data); this.setOrthoByBounds(b,0.8); return; }
    const wb=this.computeWorldBounds(data); const [cx,cy,cz]=wb.center; const r=Math.max(0.001, wb.radius);
    const fov=((this.camera.isPerspectiveCamera?this.camera.fov:60)*Math.PI)/180; const aspect=this._aspect();
    const hFov = 2*Math.atan(Math.tan(fov/2)*aspect);
    const dist = Math.max(r/Math.tan(hFov/2), (r*1.2)/Math.tan(fov/2)) * 1.6;
    const eye=[cx+dist, cy+dist*0.8, cz+dist];
    this.setPerspective(eye, [cx,cy,cz]);
    if(this.camera.isPerspectiveCamera){
      this.camera.near=Math.max(0.01, dist*0.01); this.camera.far=dist*100; this.camera.updateProjectionMatrix();
    }
    this.controls.target.set(cx,cy,cz); this.controls.update();
  }

  queueFit(mode){ this._pendingFitMode = mode || this._currentDetailMode || "volumes"; }

  _resize(){
    const w=this.canvas.clientWidth||1, h=this.canvas.clientHeight||1;
    this.renderer.setSize(w,h,false);
    if(this.camera.isPerspectiveCamera){ this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); return; }
    if(this.camera.isOrthographicCamera && this._savedOrtho){
      const {cx,cz,contentHalfW,contentHalfH}=this._savedOrtho;
      const aspect=w/h; let halfW=contentHalfW, halfH=contentHalfH;
      if(halfW/halfH > aspect) halfH = halfW/aspect; else halfW = halfH*aspect;
      this.camera.left=-halfW; this.camera.right=halfW; this.camera.top=halfH; this.camera.bottom=-halfH;
      this.camera.updateProjectionMatrix(); this.camera.position.set(cx,this.camera.position.y,cz);
      this.controls.target.set(cx,0,cz); this.controls.update();
    }
  }

  _handlePick(e){
    if(!this.onPick || !this.pickables.length) return;
    const r=this.canvas.getBoundingClientRect();
    const mouse=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
    const ray=new THREE.Raycaster(); ray.setFromCamera(mouse,this.camera);
    const hit=ray.intersectObjects(this.pickables,false)[0]; if(hit) this.onPick(hit.object.userData.node||{});
  }

  clearScene(){
    for(const o of this.disposables){ o.parent && o.parent.remove(o);
      o.geometry?.dispose?.(); (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.()); }
    this.disposables.length=0; this.pickables.length=0; this.labels.length=0;
  }

  resetCamera(){ this._savedOrtho=null; this.setPerspective([20,20,20],[0,0,0]); }

  setPerspective(pos=[20,20,20], look=[0,0,0]){
    const aspect=this._aspect();
    if(!this.camera?.isPerspectiveCamera){ this.camera=new THREE.PerspectiveCamera(60,aspect,0.1,1000); this.controls.object=this.camera; }
    else { this.camera.aspect=aspect; }
    this.camera.position.set(...pos); this.camera.lookAt(...look); this.camera.updateProjectionMatrix();
    this.controls.enableRotate=true; this.controls.enablePan=true; this.controls.enableZoom=true;
    this.controls.target.set(...look); this.controls.update();
  }

  setOrthoByBounds(bounds, pad=1){
    const {min,max}=bounds; const cx=(min.x+max.x)/2, cz=(min.z+max.z)/2;
    let w=(max.x-min.x)+pad*2, h=(max.z-min.z)+pad*2; if(w<=0) w=0.02; if(h<=0) h=0.02;
    const contentHalfW=w/2, contentHalfH=h/2; const aspect=this._aspect();
    let halfW=contentHalfW, halfH=contentHalfH;
    if(halfW/halfH > aspect) halfH=halfW/aspect; else halfW=halfH*aspect;

    let cam=this.camera;
    if(!cam?.isOrthographicCamera){ cam = new THREE.OrthographicCamera(-halfW,halfW,halfH,-halfH,-100,1000); }
    else { cam.left=-halfW; cam.right=halfW; cam.top=halfH; cam.bottom=-halfH; }

    cam.position.set(cx,100,cz); cam.up.set(0,0,-1); cam.lookAt(cx,0,cz); cam.updateProjectionMatrix();
    this.camera=cam; this.controls.object=cam; this.controls.enableRotate=false; this.controls.enablePan=true; this.controls.enableZoom=true;
    this.controls.target.set(cx,0,cz); this.controls.update();
    this._savedOrtho = { cx,cz,contentHalfW,contentHalfH };
  }

  build(mode, data){
    this._lastData = data; this.clearScene();
    this.pickables=[]; this.labels=[];
    let made=[];
    if(mode==="graph") made=Builders.graph(this.scene,data,this.pickables,this.labels);
    else if(mode==="volumes") made=Builders.volumes(this.scene,data,this.pickables,this.labels);
    else if(mode==="wireframe") made=Builders.wireframe(this.scene,data,this.pickables,this.labels);
    else if(mode==="plan") made=Builders.plan(this.scene,data,this.pickables,this.labels);
    this.disposables.push(...made);
  }

  clearHighlight(){
    if(this._hl){ this._hl.traverse(o=>{o.geometry?.dispose?.(); (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.()); }); this.scene.remove(this._hl); }
    this._hl=null;
  }

  highlightRoom(node, mode="volumes"){
    this.clearHighlight(); if(!node) return;
    const g=new THREE.Group(); g.renderOrder=998; this._hl=g; this.scene.add(g);

    const XY=STYLE.xyScale, LVH=STYLE.levelRise, _n=(v,d=0)=>(Number.isFinite(+v)?+v:d);
    const w=_n(node.width?.[0]??node.width??node.w??node.size?.[0],4)*XY;
    const d=_n(node.width?.[1]??node.depth??node.size?.[1],4)*XY;
    const h=_n(node.height??node.room_height??3);
    const x=_n(node.center?.[0],0)*XY, z=_n(node.center?.[1],0)*XY;
    const yBottom=_n(node.floor,0)*LVH; const yCenter=yBottom+0.5*h;
    const ACCENT=0x00ffd5;

    if(mode==="plan"){
      const pg=new THREE.PlaneGeometry(Math.max(w,0.02), Math.max(d,0.02)); pg.rotateX(-Math.PI/2);
      const fill=new THREE.Mesh(pg,new THREE.MeshBasicMaterial({color:ACCENT,transparent:true,opacity:0.15,depthWrite:false}));
      fill.position.set(x,0.015,z); g.add(fill);
      const hw=w/2, hd=d/2;
      const pos=new Float32Array([-hw,0,-hd, hw,0,-hd,  hw,0,-hd, hw,0,hd,  hw,0,hd, -hw,0,hd,  -hw,0,hd, -hw,0,-hd]);
      const og=new THREE.BufferGeometry(); og.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
      const outline=new THREE.LineSegments(og,new THREE.LineBasicMaterial({color:ACCENT,transparent:true,opacity:0.9}));
      outline.position.set(x,0.02,z); g.add(outline);
    } else if(mode==="graph"){
      const halo=new THREE.Mesh(new THREE.SphereGeometry(STYLE.nodeRadius*1.6,18,18),
        new THREE.MeshBasicMaterial({color:ACCENT,transparent:true,opacity:0.28,depthWrite:false}));
      halo.position.set(_n(node.center?.[0])*XY, _n(node.floor)*LVH, _n(node.center?.[1])*XY); g.add(halo);
      const ring=new THREE.Mesh(new THREE.RingGeometry(STYLE.nodeRadius*1.45, STYLE.nodeRadius*1.7, 32),
        new THREE.MeshBasicMaterial({color:ACCENT, side:THREE.DoubleSide, transparent:true, opacity:0.8}));
      ring.rotation.x=-Math.PI/2; ring.position.copy(halo.position).add(new THREE.Vector3(0,0.01,0)); g.add(ring);
    } else {
      const boxGeo=new THREE.BoxGeometry(Math.max(w,0.05),Math.max(h,0.05),Math.max(d,0.05));
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({color:ACCENT,transparent:true,opacity:0.9}));
      edge.position.set(x,yCenter,z); g.add(edge);
      const plateG=new THREE.PlaneGeometry(Math.max(w,0.05),Math.max(d,0.05)); plateG.rotateX(-Math.PI/2);
      const plate=new THREE.Mesh(plateG,new THREE.MeshBasicMaterial({color:ACCENT,transparent:true,opacity:0.12,depthWrite:false}));
      plate.position.set(x,yBottom+0.002,z); g.add(plate);
    }
  }

  dispose(){ cancelAnimationFrame(this._raf); this._ro.disconnect(); this.canvas.removeEventListener("click", this._click);
    this.clearScene(); this.controls.dispose(); this.renderer.dispose(); }
}

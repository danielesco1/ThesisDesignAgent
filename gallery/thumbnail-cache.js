import { CURRENT, STYLE } from "./themes.js";
import { Builders } from "./builders.js";
import * as THREE from 'three';

export class ThumbnailCache {
  constructor(maxSize=50){ this.cache=new Map(); this.maxSize=maxSize;
    this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:"low-power"});
    this.w=200; this.h=150; this.renderer.setSize(this.w,this.h,false); this.setTheme(CURRENT);
  }
  setTheme(theme){ this.cache.clear(); this.renderer.setClearColor(theme.thumbBg,1); this.theme=theme; }

  _worldBounds(data){
    const nodes=Array.isArray(data?.nodes)?data.nodes:[]; if(!nodes.length) return {center:[0,0,0],radius:10};
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const n of nodes){
      const w=Math.max(Number((n.width?.[0]??n.width??n.w??n.size?.[0])||4),0.001);
      const d=Math.max(Number(n.width?.[1]??n.depth??(n.size?.[1]||4)),0.001);
      const h=Math.max(Number(n.height??n.room_height??3),0.001);
      const cx=Number(n.center?.[0]||0), cz=Number(n.center?.[1]||0);
      const y0 = STYLE.floorIsIndex ? Number(n.floor||0)*STYLE.levelRise : Number(n.floor||0);
      const y1 = y0 + h;
      minX=Math.min(minX,cx-w/2); maxX=Math.max(maxX,cx+w/2);
      minZ=Math.min(minZ,cz-d/2); maxZ=Math.max(maxZ,cz+d/2);
      minY=Math.min(minY,y0);     maxY=Math.max(maxY,y1);
    }
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
    const spanX=Math.max(0.01,maxX-minX), spanY=Math.max(0.01,maxY-minY), spanZ=Math.max(0.01,maxZ-minZ);
    return { center:[cx,cy,cz], radius: Math.max(spanX,spanY,spanZ)*0.6 };
  }

  _planBounds(data){
    const nodes=Array.isArray(data?.nodes)?data.nodes:[]; if(!nodes.length) return {min:{x:-1,z:-1}, max:{x:1,z:1}};
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const n of nodes){
      const w=Math.max(Number((n.width?.[0]??n.width??n.w??n.size?.[0])||4),0.001);
      const d=Math.max(Number((n.width?.[1]??n.depth??n.size?.[1])||4),0.001);
      const x=Number(n.center?.[0]||0), z=Number(n.center?.[1]||0);
      minX=Math.min(minX,x-w/2); maxX=Math.max(maxX,x+w/2);
      minZ=Math.min(minZ,z-d/2); maxZ=Math.max(maxZ,z+d/2);
    }
    return {min:{x:minX,z:minZ}, max:{x:maxX,z:maxZ}};
  }

  _render(data, mode){
    const scene=new THREE.Scene(); scene.background=new THREE.Color(this.theme.thumbBg);
    scene.add(new THREE.AmbientLight(0xffffff,0.6));
    let camera;

    if(mode==="plan"){
      const {min,max}=this._planBounds(data);
      const cx=(min.x+max.x)/2, cz=(min.z+max.z)/2;
      let w=(max.x-min.x)||2, h=(max.z-min.z)||2;
      const pad=Math.max(0.06*Math.max(w,h),0.12); w+=pad*2; h+=pad*2;
      const aspect=this.w/this.h; let halfW=w/2, halfH=h/2;
      if(halfW/halfH>aspect) halfH=halfW/aspect; else halfW=halfH*aspect;
      camera=new THREE.OrthographicCamera(-halfW,halfW,halfH,-halfH,-100,1000);
      camera.position.set(cx,100,cz); camera.up.set(0,0,-1); camera.lookAt(cx,0,cz);
    } else {
      const {center:[cx,cy,cz], radius:r}=this._worldBounds(data);
      camera=new THREE.PerspectiveCamera(50,this.w/this.h,0.1,1000);
      const fov=(camera.fov*Math.PI)/180, aspect=this.w/this.h;
      const hFov=2*Math.atan(Math.tan(fov/2)*aspect);
      const dist=Math.max(r/Math.tan(hFov/2),(r*1.2)/Math.tan(fov/2))*1.6;
      camera.position.set(cx+dist, cy+dist*0.8, cz+dist); camera.lookAt(cx,cy,cz);
      camera.near=Math.max(0.01,dist*0.01); camera.far=dist*100; camera.updateProjectionMatrix();
    }

    const disposables = mode==="volumes" ? Builders.volumes(scene,data) : (mode==="plan" ? Builders.plan(scene,data) : Builders.graph(scene,data));
    this.renderer.render(scene,camera);
    const url = this.renderer.domElement.toDataURL();

    disposables.forEach(o=>{ o.geometry?.dispose?.(); (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.()); scene.remove(o); });
    return url;
  }

  get(keyId, data, mode="plan"){
    const themeKey=this.theme?.thumbBg??"t", key=`${keyId}:${mode}:${themeKey}`;
    if(this.cache.has(key)) return this.cache.get(key);
    if(this.cache.size>=this.maxSize) this.cache.delete(this.cache.keys().next().value);
    const url=this._render(data,mode); this.cache.set(key,url); return url;
  }
}

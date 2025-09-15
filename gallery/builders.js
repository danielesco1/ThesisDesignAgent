import { CURRENT, STYLE } from "./themes.js";
import { num, colorOf } from "./utils.js";
import { makeLabelSprite } from "./labels.js";
import * as THREE from 'three';

export const Builders = {
  graph(scene, data, pickables, labels){
    const out=[]; const nodes=Array.isArray(data?.nodes)?data.nodes:[]; const edges=Array.isArray(data?.edges)?data.edges:[];
    const id2=new Map(nodes.map(n=>[n.id,n])); const sphere=new THREE.SphereGeometry(STYLE.nodeRadius,STYLE.nodeSegs,STYLE.nodeSegs);

    for(const n of nodes){
      const m=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:colorOf(n)}));
      m.position.set(num(n.center?.[0])*STYLE.xyScale, num(n.floor)*STYLE.levelRise, num(n.center?.[1])*STYLE.xyScale);
      m.userData.node=n; m.renderOrder=1; scene.add(m); out.push(m); pickables?.push(m);
      if(labels){ const spr=makeLabelSprite(String(n.id||n.type||"")); spr.position.copy(m.position).add(new THREE.Vector3(0,1.2,0));
        spr.renderOrder=999; spr.material && (spr.material.depthTest=false); scene.add(spr); out.push(spr); labels.push(spr); }
    }
    if(edges.length){
      const pos=[];
      for(const [a,b] of edges){ const A=id2.get(a), B=id2.get(b); if(!A||!B) continue;
        pos.push(num(A.center?.[0])*STYLE.xyScale, num(A.floor)*STYLE.levelRise, num(A.center?.[1])*STYLE.xyScale,
                 num(B.center?.[0])*STYLE.xyScale, num(B.floor)*STYLE.levelRise, num(B.center?.[1])*STYLE.xyScale ); }
      if(pos.length){
        const g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
        const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:CURRENT.edgeColor,transparent:true,opacity:CURRENT.edgeOpacity}));
        lines.renderOrder=0; scene.add(lines); out.push(lines);
      }
    }
    return out;
  },

  volumes(scene, data, pickables, labels){
    const out=[]; const nodes=Array.isArray(data?.nodes)?data.nodes:[]; const edges=Array.isArray(data?.edges)?data.edges:[];
    for(const n of nodes){
      const w = Math.max(num(n.width?.[0]??n.width??n.w??n.size?.[0],4)*STYLE.xyScale, 0.05);
      const d = Math.max(num(n.width?.[1]??n.depth??n.size?.[1],4)*STYLE.xyScale, 0.05);
      const h = Math.max(num(n.height??n.room_height??3), 0.05);
      const x = num(n.center?.[0],0)*STYLE.xyScale, z=num(n.center?.[1],0)*STYLE.xyScale;
      const y = num(n.floor,0)*STYLE.levelRise + 0.5*h;

      const box = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
        new THREE.MeshStandardMaterial({ color:colorOf(n), transparent:true, opacity:CURRENT.volumeOpacity,
          roughness:0.95, metalness:0, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 }));
      box.castShadow=true; box.position.set(x,y,z); box.userData.node=n; box.renderOrder=1;
      scene.add(box); out.push(box); pickables?.push(box);

      if(CURRENT.isLight){
        const el=new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),
          new THREE.LineBasicMaterial({color:CURRENT.volumeEdgeColor??0x000000,transparent:true,opacity:CURRENT.volumeEdgeOpacity??0.45}));
        el.position.copy(box.position); el.quaternion.copy(box.quaternion); el.scale.copy(box.scale); el.renderOrder=1;
        scene.add(el); out.push(el);
      }
      if(labels){ const spr=makeLabelSprite(String(n.id||n.type||"")); spr.position.set(x,y+h*0.65,z);
        spr.renderOrder=999; spr.material && (spr.material.depthTest=false); scene.add(spr); out.push(spr); labels.push(spr); }
    }
    if(edges.length){
      const id2=new Map(nodes.map(n=>[n.id,n])); const pos=[];
      for(const [a,b] of edges){ const A=id2.get(a), B=id2.get(b); if(!A||!B) continue;
        const hA=num(A.height??A.room_height??3), hB=num(B.height??B.room_height??3);
        const xA=num(A.center?.[0],0)*STYLE.xyScale, zA=num(A.center?.[1],0)*STYLE.xyScale;
        const xB=num(B.center?.[0],0)*STYLE.xyScale, zB=num(B.center?.[1],0)*STYLE.xyScale;
        const yA=num(A.floor,0)*STYLE.levelRise+0.5*hA, yB=num(B.floor,0)*STYLE.levelRise+0.5*hB;
        pos.push(xA,yA,zA,xB,yB,zB);
      }
      if(pos.length){
        const g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
        const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:CURRENT.edgeColor,transparent:true,opacity:CURRENT.edgeOpacityVol}));
        lines.renderOrder=0; scene.add(lines); out.push(lines);
      }
    }
    return out;
  },

  wireframe(scene, data, pickables, labels){
    const out=[]; const nodes=Array.isArray(data?.nodes)?data.nodes:[];
    const wireColor = CURRENT.wireColor ?? (CURRENT.isLight ? 0x000000 : 0xffffff);
    const wireOpacity= CURRENT.wireOpacity?? (CURRENT.isLight ? 0.55 : 0.45);

    for(const n of nodes){
      const w=Math.max(num(n.width?.[0]??n.width??n.w??n.size?.[0],4)*STYLE.xyScale,0.05);
      const d=Math.max(num(n.width?.[1]??n.depth??n.size?.[1],4)*STYLE.xyScale,0.05);
      const h=Math.max(num(n.height??n.room_height??3),0.05);
      const x=num(n.center?.[0],0)*STYLE.xyScale, z=num(n.center?.[1],0)*STYLE.xyScale;
      const y=num(n.floor,0)*STYLE.levelRise + 0.5*h;
      const yBottom = STYLE.floorIsIndex ? num(n.floor,0)*STYLE.levelRise : num(n.floor,0);

      const boxGeo = new THREE.BoxGeometry(w,h,d);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({color:wireColor,transparent:true,opacity:wireOpacity}));
      wire.position.set(x,y,z); wire.userData.node=n; scene.add(wire); out.push(wire);

      const proxy = new THREE.Mesh(boxGeo.clone(), new THREE.MeshBasicMaterial({visible:false}));
      proxy.position.copy(wire.position); proxy.userData.node=n; scene.add(proxy); pickables?.push(proxy); out.push(proxy);

      const pg=new THREE.PlaneGeometry(w,d); pg.rotateX(-Math.PI/2);
      const plate = new THREE.Mesh(pg,new THREE.MeshBasicMaterial({ color:colorOf(n), transparent:true, opacity:0.7, depthWrite:false }));
      plate.position.set(x,yBottom+0.0006,z); plate.renderOrder=-1; scene.add(plate); out.push(plate);

      const hw=w/2, hd=d/2;
      const pos=new Float32Array([-hw,0,-hd, hw,0,-hd,  hw,0,-hd, hw,0,hd,  hw,0,hd, -hw,0,hd,  -hw,0,hd, -hw,0,-hd]);
      const og=new THREE.BufferGeometry(); og.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
      const outline=new THREE.LineSegments(og,new THREE.LineBasicMaterial({color:CURRENT.planOutline,transparent:true,opacity:CURRENT.floorLineOpacity??0.45}));
      outline.position.set(x,yBottom+0.0006,z); scene.add(outline); out.push(outline);
    }
    out.push(...this.graph(scene,data,pickables,labels));
    return out;
  },

  plan(scene, data, pickables, labels){
    const out=[]; const nodes=Array.isArray(data?.nodes)?data.nodes:[]; const edges=Array.isArray(data?.edges)?data.edges:[];
    for(const n of nodes){
      const w=Math.max(num(n.width?.[0]??n.width??n.w??n.size?.[0],4)*STYLE.xyScale,0.02);
      const d=Math.max(num(n.width?.[1]??n.depth??n.size?.[1],4)*STYLE.xyScale,0.02);
      const x=num(n.center?.[0],0)*STYLE.xyScale, z=num(n.center?.[1],0)*STYLE.xyScale, y=0.001;

      const pg=new THREE.PlaneGeometry(w,d); pg.rotateX(-Math.PI/2);
      const plane=new THREE.Mesh(pg,new THREE.MeshBasicMaterial({color:colorOf(n),transparent:true,opacity:CURRENT.planFillOpacity}));
      plane.position.set(x,y,z); plane.userData.node=n; scene.add(plane); out.push(plane); pickables?.push(plane);

      const hw=w/2, hd=d/2;
      const pos=new Float32Array([-hw,y,-hd, hw,y,-hd,  hw,y,-hd, hw,y,hd,  hw,y,hd, -hw,y,hd,  -hw,y,hd, -hw,y,-hd]);
      const og=new THREE.BufferGeometry(); og.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
      const ol=new THREE.LineSegments(og,new THREE.LineBasicMaterial({color:CURRENT.planOutline,transparent:true,opacity:CURRENT.edgeOpacity}));
      ol.position.set(x,0,z); scene.add(ol); out.push(ol);

      if(labels){ const spr=makeLabelSprite(String(n.id||n.type||"")); spr.position.set(x,y+0.02,z);
        spr.renderOrder=999; spr.material && (spr.material.depthTest=false, spr.material.depthWrite=false);
        scene.add(spr); out.push(spr); labels.push(spr); }
    }
    if(edges.length){
      const id2=new Map(nodes.map(n=>[n.id,n])); const pos=[];
      for(const [a,b] of edges){ const A=id2.get(a), B=id2.get(b); if(!A||!B) continue;
        const xA=num(A.center?.[0],0)*STYLE.xyScale, zA=num(A.center?.[1],0)*STYLE.xyScale;
        const xB=num(B.center?.[0],0)*STYLE.xyScale, zB=num(B.center?.[1],0)*STYLE.xyScale;
        pos.push(xA,0.01,zA, xB,0.01,zB); }
      if(pos.length){
        const g=new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
        const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:CURRENT.edgeColor,transparent:true,opacity:CURRENT.edgeOpacity}));
        scene.add(lines); out.push(lines);
      }
    }
    return out;
  }
};

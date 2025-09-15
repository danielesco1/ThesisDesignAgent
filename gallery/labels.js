import { CURRENT } from "./themes.js";

export function makeLabelSprite(text,{fontPx=18,maxWidthPx=240,padX=10,padY=7,lineGap=4}={}){
  const words = String(text || "").replace(/_/g," ").trim().split(/\s+/);
  const c = document.createElement("canvas"), ctx=c.getContext("2d");
  ctx.font = `600 ${fontPx}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
  const lines=[]; let line="";
  for(const w of words){ const t=line?line+" "+w:w;
    if(ctx.measureText(t).width + padX*2 > maxWidthPx && line){ lines.push(line); line=w; }
    else line=t;
  }
  if(line) lines.push(line);
  const textW = Math.min(maxWidthPx, Math.max(...lines.map(l=>ctx.measureText(l).width)));
  const textH = lines.length*fontPx + (lines.length-1)*lineGap;
  const ratio = Math.min(window.devicePixelRatio||1, 2);
  c.width = Math.ceil((textW + padX*2)*ratio);
  c.height= Math.ceil((textH + padY*2)*ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);

  const w=c.width/ratio, h=c.height/ratio, r=10;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = CURRENT.isLight ? "rgba(0,0,0,0.78)" : "rgba(0,0,0,0.70)";
  ctx.beginPath();
  ctx.moveTo(r,0); ctx.arcTo(w,0,w,h,r); ctx.arcTo(w,h,0,h,r);
  ctx.arcTo(0,h,0,0,r); ctx.arcTo(0,0,w,0,r); ctx.closePath(); ctx.fill();

  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 4;
  ctx.font = `700 ${fontPx}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
  ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="top";
  let y=padY; const x=w/2;
  for(const l of lines){ ctx.fillText(l,x,y); y+=fontPx+lineGap; }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 2; tex.needsUpdate = true;

  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false }));
  spr.scale.set(0.001,0.001,1); spr.userData.aspect = w/h;
  return spr;
}

export function updateLabelScales(labels, camera){
  if(!labels?.length || !camera) return;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smoothstep=(e0,e1,x)=>{ const t=clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); };

  const isOrtho = !!camera.isOrthographicCamera;
  if(isOrtho){
    const span = camera.top - camera.bottom;
    const h = clamp(span*0.02, 0.14, 0.6);
    const alpha = smoothstep(180,25,span);
    const visible = alpha > 0.08;
    const maxVisible = clamp(Math.round(28 - span*0.12), 6, 28);
    const L = labels.length, keepEvery = L > maxVisible ? Math.ceil(L/maxVisible) : 1;
    for(let i=0; i<L; i++){
      const spr = labels[i], show = visible && i%keepEvery===0;
      spr.visible = !!show; if(!show) continue;
      const aspect = spr.userData.aspect || 2.5;
      spr.scale.set(h*aspect, h, 1);
      spr.lookAt(camera.position);
      spr.material && (spr.material.opacity = alpha);
    }
    return;
  }
  const maxVisible=10;
  labels.map(spr=>({spr,dist:spr.position.distanceTo(camera.position)}))
        .sort((a,b)=>a.dist-b.dist)
        .forEach((it,i)=>{
          const {spr,dist}=it;
          const h=Math.max(0.12, Math.min(0.35, dist*0.02));
          const aspect=spr.userData.aspect||2.5;
          spr.scale.set(h*aspect,h,1); spr.lookAt(camera.position);
          if(i<maxVisible){ spr.visible=true; spr.material && (spr.material.opacity=1-(i/maxVisible)*0.35); }
          else spr.visible=false;
        });
}

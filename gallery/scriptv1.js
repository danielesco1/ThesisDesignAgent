// House Graph Inspector — minimal, modular JS
// Utils: $, $$, uuid, debounce

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const uuid=()=>typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' 
  ? crypto.randomUUID() 
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const debounce=(fn,ms=150)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};

// makes a small canvas-text sprite
// =============== Label sprites ===============
function makeLabelSprite(
  text,
  { fontPx=16, maxWidthPx=220, padX=8, padY=6, lineGap=4 } = {}
){
  const words = String(text||'').replace(/_/g,' ').trim().split(/\s+/);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');

  ctx.font = `600 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  const lines=[]; let line='';
  for(const w of words){
    const t=line?line+' '+w:w;
    if(ctx.measureText(t).width + padX*2 > maxWidthPx && line){ lines.push(line); line=w; }
    else line=t;
  }
  if(line) lines.push(line);

  const textW = Math.min(maxWidthPx, Math.max(1, ...lines.map(l=>ctx.measureText(l).width)));
  const textH = lines.length*fontPx + (lines.length-1)*lineGap;

  c.width  = Math.ceil(textW + padX*2);
  c.height = Math.ceil(textH + padY*2);

  // pill
  const r = 10;
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle = CURRENT.isLight ? 'rgba(0,0,0,0.80)' : 'rgba(0,0,0,0.70)';
  ctx.beginPath();
  ctx.moveTo(r,0);
  ctx.arcTo(c.width,0,c.width,c.height,r);
  ctx.arcTo(c.width,c.height,0,c.height,r);
  ctx.arcTo(0,c.height,0,0,r);
  ctx.arcTo(0,0,c.width,0,r);
  ctx.closePath();
  ctx.fill();

  // text
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = padY; const x = c.width/2;
  for(const l of lines){ ctx.fillText(l, x, y); y += fontPx + lineGap; }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,          // <-- always draw on top
    sizeAttenuation: true,
    opacity: 1
  }));
  spr.renderOrder = 999;        // <-- after other geometry
  spr.scale.set(0.001, 0.001, 1);
  spr.userData.aspect = c.width / c.height;
  return spr;
}

function updateLabelScales(labels, camera){
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  // heuristic cap: don’t show more than 14 labels at once
  const maxVisible = 14;
  const sorted = labels
    .map(s => ({ spr:s, dist: s.position.distanceTo(camera.position) }))
    .sort((a,b)=> a.dist - b.dist);

  sorted.forEach((item, i) => {
    const spr = item.spr;

    // scale: perspective uses distance; ortho uses viewport height
    let h;
    if (camera.isOrthographicCamera){
      const viewH = (camera.top - camera.bottom); // world units
      h = clamp(viewH * 0.02, 0.18, 0.55);
    } else {
      h = clamp(item.dist * 0.02, 0.18, 0.60);
    }
    spr.scale.set(h*(spr.userData.aspect||2.5), h, 1);
    spr.lookAt(camera.position);

    // fade/hide by rank
    if (i < maxVisible){
      spr.visible = true;
      const t = i / maxVisible;
      spr.material.opacity = 1 - t * 0.35;
    } else {
      spr.visible = false;
    }
  });
}
// ThumbnailCache: tiny Three.js render → dataURL; disposes meshes/materials
class ThumbnailCache{
  constructor(maxSize=50){
    this.cache=new Map(); this.maxSize=maxSize;
    this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'low-power'});
    this.w=200; this.h=150; this.renderer.setSize(this.w,this.h);
  }

  getThumbnail(id,data,mode='graph'){
    const key=`${id}:${mode}`;
    if(this.cache.has(key)) return this.cache.get(key);
    if(this.cache.size>=this.maxSize) this.cache.delete(this.cache.keys().next().value);
    const url=this.generateThumbnail(data,mode);
    this.cache.set(key,url); return url;
  }

  generateThumbnail(data, mode='graph'){
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0a0a);
  const camera = new THREE.PerspectiveCamera(50, this.w/this.h, 0.1, 1000);
  camera.position.set(10,10,10); camera.lookAt(0,0,0);
  scene.add(new THREE.AmbientLight(0xffffff,.6));

  // FIX: use global Builders if present for plan/volumes; otherwise fall back
  let disposables = [];
  if (mode === 'volumes' && typeof Builders?.volumes === 'function') {
    disposables = Builders.volumes(scene, data);
  } else if (mode === 'plan' && typeof Builders?.plan === 'function') {
    disposables = Builders.plan(scene, data);
  } else if (mode === 'graph' && typeof Builders?.graph === 'function') {
    disposables = Builders.graph(scene, data);
  } else {
    // fallback to the simple ones from ThumbnailCache
    disposables = (mode === 'volumes')
      ? this.createVolumeGraph(scene, data)
      : this.createSimplifiedGraph(scene, data);
  }

  this.renderer.render(scene, camera);
  const url = this.renderer.domElement.toDataURL();

  disposables.forEach(o => {
    o.geometry?.dispose?.();
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.());
    scene.remove(o);
  });
  return url;
}

  // --- Graph (spheres + lines). Optionally collect pickables.
  createSimplifiedGraph(scene,data,pickables,labelsArr){
  const disposables=[], nodes=Array.isArray(data?.nodes)?data.nodes:[], edges=Array.isArray(data?.edges)?data.edges:[];
  const id2=new Map(nodes.map(n=>[n.id,n]));
  // color: node.color fallback by privacy
  const colorOf = n => new THREE.Color(n.color || (n.privacy_level==='private' ? '#ff6b6b'
                                   : n.privacy_level==='semi_private' ? '#f5a623'
                                   : '#667eea'));
  const sphereGeom=new THREE.SphereGeometry(.35,12,12);

  nodes.forEach(n=>{
    const mat=new THREE.MeshBasicMaterial({color:colorOf(n)});
    const m=new THREE.Mesh(sphereGeom,mat);
    m.position.set((n.center?.[0]??0)*.3,(n.floor??0)*2,(n.center?.[1]??0)*.3);
    m.userData.node=n; scene.add(m); disposables.push(m);
    pickables && pickables.push(m);

    // label sprite (id if present else type)
    if (labelsArr){
        const spr = makeLabelSprite(String(n.id || n.type || ''), {
            maxWidthPx: 420,   // wider wrap
            fontPx: 28,
            worldScale: 0.012  // slightly bigger on screen
        });
        spr.position.copy(m.position).add(new THREE.Vector3(0, 1.2, 0)); // higher above node
        scene.add(spr); disposables.push(spr); labelsArr.push(spr);
        }
  });

  const lineMat=new THREE.LineBasicMaterial({color:0x667eea,opacity:.3,transparent:true});
  const pos=[]; edges.forEach(([a,b])=>{const A=id2.get(a),B=id2.get(b); if(!A||!B)return;
    pos.push((A.center?.[0]??0)*.3,(A.floor??0)*2,(A.center?.[1]??0)*.3,
             (B.center?.[0]??0)*.3,(B.floor??0)*2,(B.center?.[1]??0)*.3)});
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const lines=new THREE.LineSegments(g,lineMat); scene.add(lines); disposables.push(lines);
  return disposables;
}
// --- Volumes (boxes + lines). Optionally collect pickables + labels.
createVolumeGraph(scene, data, pickables, labelsArr){
  const disposables = [];
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];

  // XY = plan; Y = vertical (Rhino Z -> three.js Y)
  const XY = 0.3;
  const LEVEL_H = 3; // fallback per-floor rise if floor is provided w/o height
  const num = (v, d=0) => Number.isFinite(+v) ? +v : d;
  const colorOf = n => new THREE.Color(
    n.color || (n.privacy_level==='private' ? '#ff6b6b'
             : n.privacy_level==='semi_private' ? '#f5a623'
             : '#667eea')
  );

  

  // rooms
  nodes.forEach(n => {
    const w = num(n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0], 4) * XY;  // X
    const d = num(n.width?.[1] ?? n.depth ?? n.size?.[1],         4) * XY;  // Z (plan depth)  <- no n.height here
    const h = num(n.height ?? 3);                     // Y (vertical)

    const x = num(n.center?.[0], 0) * XY;
    const z = num(n.center?.[1], 0) * XY;
    const y = num(n.floor, 0) * LEVEL_H + 0.5 * h; // center at half height

    const geom = new THREE.BoxGeometry(Math.max(w,.05), Math.max(h,.05), Math.max(d,.05));
    const mat  = new THREE.MeshLambertMaterial({ color: colorOf(n), transparent:true, opacity:.95 });
    const box  = new THREE.Mesh(geom, mat);
    box.position.set(x, y, z);
    box.userData.node = n;

    scene.add(box);
    disposables.push(box);
    if (pickables) pickables.push(box);

    // label sprite above box
    if (labelsArr){
      const spr = makeLabelSprite(String(n.id || n.type || ''));
      spr.position.set(x, y + h * 0.65, z);
      scene.add(spr);
      disposables.push(spr);
      labelsArr.push(spr);
    }
  });

  // edges at each node's vertical center
  const id2 = new Map(nodes.map(n => [n.id, n]));
  const pos = [];
  edges.forEach(([a,b]) => {
    const A = id2.get(a), B = id2.get(b);
    if (!A || !B) return;

    const hA = num(A.room_height ?? A.h ?? A.height ?? 3);
    const hB = num(B.room_height ?? B.h ?? B.height ?? 3);

    const xA = num(A.center?.[0], 0) * XY, zA = num(A.center?.[1], 0) * XY;
    const xB = num(B.center?.[0], 0) * XY, zB = num(B.center?.[1], 0) * XY;

    const yA = num(A.floor, 0) * LEVEL_H + 0.5 * hA;
    const yB = num(B.floor, 0) * LEVEL_H + 0.5 * hB;

    pos.push(xA, yA, zA,  xB, yB, zB);
  });

  if (pos.length){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0x8895ff, transparent: true, opacity: 0.25 })
    );
    scene.add(lines);
    disposables.push(lines);
  }

  return disposables;
}
}

// ComparisonEngine: quick diffs/sims across key fields
class ComparisonEngine{
  constructor(){this.compareFields=['rooms','floors','edges','area','privacy_distribution','connectivity','centrality','clustering']}
  compareHouses(hs){const differences=[],similarities=[];for(const f of this.compareFields){const vals=hs.map(h=>this.getFieldValue(h,f)),same=this._allEqual(vals),variance=this._variance(vals),item={field:f,values:vals,same,variance};(same?similarities:differences).push(item)}return{differences,similarities}}
  getFieldValue(h,f){const d=h.data;switch(f){
    case'rooms':return(d.nodes||[]).length;
    case'floors':return Number.isFinite(d.floors)?d.floors:1;
    case'edges':return(d.edges||[]).length;
    case'area':return(d.site_area?.width||0)*(d.site_area?.height||0);
    case'privacy_distribution':return this._privacyVector(d);
    case'connectivity':{const n=Math.max(1,(d.nodes||[]).length);return(d.edges||[]).length/n}
    case'centrality':return this._avgCentrality(d);
    case'clustering':return d.networkx_analysis?.global?.average_clustering||0;
    default:return null}}
  _privacyVector(d){const dist={public:0,semi_private:0,private:0};(d.nodes||[]).forEach(n=>{const k=(n.privacy_level||'').toLowerCase();if(k in dist)dist[k]++});const tot=Math.max(1,(d.nodes||[]).length);return[dist.public/tot,dist.semi_private/tot,dist.private/tot]}
  _avgCentrality(d){const per=d.networkx_analysis?.per_node||{},vals=Object.values(per).map(o=>o.betweenness_choice||0);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0}
  _allEqual(a){if(!a.length)return true;const f=JSON.stringify(a[0]);return a.every(v=>JSON.stringify(v)===f)}
  _variance(v){const flat=v.flat?v.flat():v;if(!flat.length||flat.some(x=>typeof x!=='number'))return 0;const m=flat.reduce((a,b)=>a+b,0)/flat.length;return Math.sqrt(flat.reduce((s,x)=>s+Math.pow(x-m,2),0)/flat.length)}
}

// GalleryManager: IO, filters, rendering (grid/list/cluster), compare, export
class GalleryManager{
  constructor(){
    this.houses=[]; this.filteredHouses=[]; this.selectedHouses=new Set(); this.compareHouses=[]; this.searchTerm='';
    this.thumbnailCache=new ThumbnailCache(); this.comparisonEngine=new ComparisonEngine();
    this.currentView='grid'; this._rafIds=[]; this._panelRenderers=[];
    this.previewMode='graph'; // <-- add this
    this.init();
  }
  init(){
    $('#uploadBtn').addEventListener('click',()=>$('#fileInput').click());
    $('#fileInput').addEventListener('change', e => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.json'));
    this.handleFileUpload({ target: { files } }); // reuse existing handler
    });
    ['dragover','drop'].forEach(evt=>document.body.addEventListener(evt,e=>e.preventDefault()));
    document.body.addEventListener('drop',e=>{const files=[...(e.dataTransfer?.files||[])].filter(f=>f.name.toLowerCase().endsWith('.json'));if(files.length)this.handleFileUpload({target:{files}})});
    $('#searchBar').addEventListener('input',debounce(e=>{this.searchTerm=e.target.value.toLowerCase();this.applyFilters()},120));
    $$('.filter-chip[data-floors]').forEach(c=>c.addEventListener('click',()=>this._activateChip(c,'[data-floors]')));
    $$('.filter-chip[data-privacy]').forEach(c=>c.addEventListener('click',()=>this._activateChip(c,'[data-privacy]')));
    $('#roomRange').addEventListener('input',e=>{$('#roomMax').textContent=e.target.value;this.applyFilters()});
    $$('[data-view]').forEach(b=>b.addEventListener('click',()=>this.switchView(b.dataset.view)));
    $('#selectAllBtn').addEventListener('click',()=>this.selectAll());
    $('#clearBtn').addEventListener('click',()=>this.clearSelection());
    $('#deselectBatch').addEventListener('click',()=>this.clearSelection());
    $('#compareBtn').addEventListener('click',()=>this.enterComparisonMode());
    $('#compareBatch').addEventListener('click',()=>this.compareSelected());
    $('#exitComparison').addEventListener('click',()=>this.exitComparisonMode());
    $('#exportBtn').addEventListener('click',()=>this.exportData());
    $('#analyzeBtn').addEventListener('click',()=>$('#sidebar').scrollTo({top:$('#sidebar').scrollHeight,behavior:'smooth'}));
    $('#previewGraphBtn')?.addEventListener('click', ()=>{
      this.previewMode='graph';
      this.renderGallery();
    });
    $('#previewVolumesBtn')?.addEventListener('click', ()=>{
      this.previewMode='volumes';
      this.renderGallery();
    });
    $('#previewPlanBtn')?.addEventListener('click', ()=>{
      this.previewMode='plan';
      this.renderGallery();
    });

    this.updateStats()
  }
  _activateChip(active,sel){const g=active.parentElement; $$(sel,g).forEach(c=>{c.classList.remove('active');c.setAttribute('aria-pressed','false')}); active.classList.add('active');active.setAttribute('aria-pressed','true');this.applyFilters()}
  async handleFileUpload(e){
    const files=Array.from(e.target.files),grid=$('#galleryGrid'),loading=document.createElement('div');loading.className='loading-spinner';grid.appendChild(loading);
    const batchSize=10;for(let i=0;i<files.length;i+=batchSize){const batch=files.slice(i,i+batchSize);await Promise.all(batch.map(f=>this.processFile(f)))} loading.remove();this.applyFilters();this.updateAnalytics()
  }
  processFile(file){return new Promise(res=>{const r=new FileReader();r.onload=e=>{try{this.addHouse(JSON.parse(e.target.result),file.name)}catch{console.warn('JSON parse error:',file.name);this._toast(`Could not parse ${file.name}`)}res()};r.readAsText(file)})}
  addHouse(data,filename){
    const nodes=Array.isArray(data?.nodes)?data.nodes:[],edges=Array.isArray(data?.edges)?data.edges:[];
    this.houses.push({id:uuid(),name:data?.name||filename.replace(/\.json$/i,''),data:{...data,nodes,edges},filename,rooms:nodes.length,floors:Number.isFinite(data?.floors)?data.floors:1,edges:edges.length,location:data?.location||'Unknown'})
  }
  applyFilters(){
    let f=[...this.houses];
    if(this.searchTerm){const q=this.searchTerm;f=f.filter(h=>h.name.toLowerCase().includes(q)||(h.location||'').toLowerCase().includes(q)||(h.filename||'').toLowerCase().includes(q))}
    const maxRooms=parseInt($('#roomRange').value,10); f=f.filter(h=>h.rooms<=maxRooms);
    const fc=$('.filter-chip[data-floors].active'); if(fc&&fc.dataset.floors!=='all'){const v=fc.dataset.floors;f=f.filter(h=>v==='3+'?h.floors>=3:h.floors===parseInt(v,10))}
    const pc=$('.filter-chip[data-privacy].active'); if(pc&&pc.dataset.privacy!=='all'){const key=pc.dataset.privacy;f=f.filter(h=>(h.data.nodes||[]).some(n=>(n.privacy_level||'').toLowerCase().includes(key)))}
    this.filteredHouses=f; this.renderGallery(); this.updateStats()
  }
  updateAnalytics(){
    const H=(arr,b)=>{const h={};arr.forEach(x=>{const k=b(x);h[k]=(h[k]||0)+1});return h};
    const roomsH=H(this.houses.map(h=>h.rooms),r=>Math.floor(r/2)*2);
    const floorsH=H(this.houses.map(h=>h.floors),f=>f);
    const compH=H(this.houses.map(h=>(h.edges||0)/Math.max(1,h.rooms)),c=>(Math.floor(c*2)/2).toFixed(1));
    const draw=(id,h)=>{const bars=document.getElementById(id);bars.innerHTML='';const m=Math.max(1,...Object.values(h));Object.entries(h).sort((a,b)=>+a[0]-+b[0]).forEach(([bk,ct])=>{const b=document.createElement('div');b.className='chart-bar';b.style.height=`${ct/m*100}%`;b.title=`${bk}: ${ct}`;bars.appendChild(b)})};
    draw('roomBars',roomsH);draw('floorBars',floorsH);draw('complexityBars',compH)
  }
  updateStats(){$('#totalCount').textContent=this.houses.length;$('#filteredCount').textContent=this.filteredHouses.length;$('#selectedCount').textContent=this.selectedHouses.size}
  renderGallery(){
    if(this.currentView==='cluster')this.switchView('grid'); $('#comparisonView').classList.remove('active'); $('#clusterView').classList.remove('active'); $('#galleryContainer').style.display='block';
    const container=$('#galleryGrid'); container.innerHTML=''; const items=this.filteredHouses, batch=24;
    const render=(i)=>{const end=Math.min(i+batch,items.length);for(let k=i;k<end;k++)container.appendChild(this.createCard(items[k])); if(end<items.length)requestAnimationFrame(()=>render(end))}; render(0)
  }
  createCard(h){
    const isList=this.currentView==='list',card=document.createElement('div'); 
    card.className='asset-card'; 
    card.style.height=isList?'120px':'250px';
    if(this.selectedHouses.has(h.id))card.classList.add('selected'); if(this.compareHouses.includes(h.id))card.classList.add('compare');
    const thumb=this.thumbnailCache.getThumbnail(h.id,h.data,this.previewMode);
    card.innerHTML=isList?`
      <div class="asset-preview"><img src="${thumb}" alt="${h.name}"></div>
      <div class="asset-info" style="display:flex;flex-direction:column;gap:6px;justify-content:center;">
        <div class="asset-name" title="${h.name}">${h.name}</div>
        <div class="asset-meta"><span>🏠 ${h.rooms}</span><span>📐 ${h.floors}F</span><span>🔗 ${h.edges}</span><span>📍 ${h.location}</span></div>
      </div>`:`
      <div class="asset-preview">
        <img src="${thumb}" alt="${h.name}">${this.compareHouses.includes(h.id)?'<div class="compare-badge">COMPARE</div>':''}
      </div>
      <div class="asset-info"><div class="asset-name" title="${h.name}">${h.name}</div><div class="asset-meta"><span>Rooms ${h.rooms}</span><span>Floors ${h.floors}F</span><span>Edges ${h.edges}</span></div></div>`;
    card.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey)this.toggleSelection(h.id);else if(e.shiftKey)this.addToComparison(h.id);else this.openDetail(h)});
    return card
  }

  toggleSelection(id){this.selectedHouses.has(id)?this.selectedHouses.delete(id):this.selectedHouses.add(id);this.updateBatchActions();this.renderGallery()}
  selectAll(){this.filteredHouses.forEach(h=>this.selectedHouses.add(h.id));this.updateBatchActions();this.renderGallery()}
  clearSelection(){this.selectedHouses.clear();this.compareHouses=[];this.updateBatchActions();this.renderGallery()}
  updateBatchActions(){const c=this.selectedHouses.size,el=$('#batchActions'); if(c>0){el.classList.add('active');$('#batchCount').textContent=c}else el.classList.remove('active'); this.updateStats()}
  addToComparison(id){this.compareHouses=this.compareHouses.includes(id)?this.compareHouses.filter(x=>x!==id):(this.compareHouses.length<4?[...this.compareHouses,id]:this.compareHouses);this.renderGallery()}
  compareSelected(){this.compareHouses=Array.from(this.selectedHouses).slice(0,4);this.enterComparisonMode()}
  enterComparisonMode(){if(this.compareHouses.length<2){alert('Select at least 2 houses to compare (Shift+Click or use batch).');return} $('#galleryContainer').style.display='none';$('#clusterView').classList.remove('active');$('#comparisonView').classList.add('active');this.renderComparison()}
  renderComparison(){
    const panels=$('#comparisonPanels'); panels.innerHTML=''; const hs=this.compareHouses.map(id=>this.houses.find(h=>h.id===id)).filter(Boolean);
    hs.forEach(h=>{const p=document.createElement('div');p.className='comparison-panel';p.innerHTML=`
      <div class="panel-header" title="${h.name}">${h.name}</div>
      <div class="panel-viewer"><canvas class="panel-canvas"></canvas></div>
      <div class="panel-stats">
        <div class="diff-item"><span class="diff-label">Rooms</span><span class="diff-value">${h.rooms}</span></div>
        <div class="diff-item"><span class="diff-label">Floors</span><span class="diff-value">${h.floors}</span></div>
        <div class="diff-item"><span class="diff-label">Edges</span><span class="diff-value">${h.edges}</span></div>
        <div class="diff-item"><span class="diff-label">Connectivity</span><span class="diff-value">${(h.edges/Math.max(1,h.rooms)).toFixed(2)}</span></div>
      </div>`; panels.appendChild(p); this.render3DView(h,$('.panel-canvas',p))});
    this.showDifferences(hs)
  }
  render3DView(h,canvas){
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true}),resize=()=>{const w=canvas.clientWidth||400,h=canvas.clientHeight||300;renderer.setSize(w,h,false)};
    resize(); const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a1a1a);
    const camera=new THREE.PerspectiveCamera(50,1,.1,1000);camera.position.set(15,15,15);camera.lookAt(0,0,0);
    scene.add(new THREE.AmbientLight(0xffffff,.8));
    (this.previewMode==='volumes'
        ? this.thumbnailCache.createVolumeGraph(scene,h.data)
        : this.thumbnailCache.createSimplifiedGraph(scene,h.data));
    const ro=new ResizeObserver(()=>resize()); ro.observe(canvas);
    const animate=()=>{const id=requestAnimationFrame(animate);this._rafIds.push(id);const t=Date.now()*0.001;camera.position.x=15*Math.cos(t);camera.position.z=15*Math.sin(t);camera.lookAt(0,0,0);const w=canvas.clientWidth||400,hh=canvas.clientHeight||300;camera.aspect=w/hh;camera.updateProjectionMatrix();renderer.render(scene,camera)}; animate();
    this._panelRenderers.push({renderer,scene,ro})
  }
  showDifferences(hs){
    const panel=$('#differencesPanel'),cmp=this.comparisonEngine.compareHouses(hs),fmt=v=>Array.isArray(v)?v.map(n=>typeof n==='number'?n.toFixed(2):n).join(' / '):v;
    let html='<h3>Analysis</h3>'; if(cmp.differences.length){html+='<h4>Differences</h4>';cmp.differences.forEach(d=>{html+=`<div class="diff-item"><span class="diff-label">${d.field}</span><div class="diff-values">${d.values.map(v=>`<span class="diff-value different">${fmt(v)}</span>`).join('')}</div></div>`})}
    if(cmp.similarities.length){html+='<h4>Similarities</h4>';cmp.similarities.forEach(s=>{html+=`<div class="diff-item"><span class="diff-label">${s.field}</span><span class="diff-value same">${fmt(s.values[0])}</span></div>`})}
    panel.innerHTML=html
  }
  exitComparisonMode(){
    $('#galleryContainer').style.display='block'; $('#comparisonView').classList.remove('active');
    this._rafIds.forEach(id=>cancelAnimationFrame(id)); this._rafIds=[];
    this._panelRenderers.forEach(({renderer,scene,ro})=>{ro.disconnect();renderer.dispose();scene.traverse(o=>{o.geometry&&o.geometry.dispose?.(); if(o.material){Array.isArray(o.material)?o.material.forEach(m=>m.dispose?.()):o.material.dispose?.()}})}); 
    this._panelRenderers=[]
  }
  switchView(v){
    $$('[data-view]').forEach(b=>{const on=b.dataset.view===v;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
    this.currentView=v; const g=$('#galleryContainer'),c=$('#comparisonView'),cl=$('#clusterView'); g.style.display='none'; c.classList.remove('active'); cl.classList.remove('active');
    if(v==='cluster')this.renderClusterView(); else{g.style.display='block';this.renderGallery()}
  }
  renderClusterView(){
    $('#galleryContainer').style.display='none'; $('#comparisonView').classList.remove('active'); $('#clusterView').classList.add('active');
    const container=$('#clusterContainer'); container.innerHTML='<canvas id="clusterCanvas" width="1200" height="600"></canvas>';
    const canvas=$('#clusterCanvas'),ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    this.filteredHouses.forEach(h=>{const x=(h.rooms/20)*(canvas.width-20)+10,y=(h.floors/5)*(canvas.height-20)+10;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#667eea';ctx.fill()})
  }
  // -------- Detail Modal --------
openDetail(h){
  this._detailHouse = h;
  const modal = document.getElementById('viewerModal');
  const info  = document.getElementById('roomInfo');
  modal.classList.remove('hidden');

  // sidebar info
  const props = document.getElementById('houseProps');
  if (props) {
    props.innerHTML = `
      <p><b>Name:</b> ${h.name}</p>
      <p><b>Description:</b> ${h.data.description||''}</p>
      <p><b>Users:</b> ${h.data.users||''}</p>
      <p><b>Profession:</b> ${h.data.profession||''}</p>
      <p><b>Location:</b> ${h.location||''}</p>
      <p><b>Climate:</b> ${h.data.climate||''}</p>
      <p><b>Roof:</b> ${h.data.roof_type||''}</p>
      <p><b>Facade:</b> ${h.data.facade_materials||''}</p>
      <p><b>Reason:</b> ${h.data.reason||''}</p>
      <p><b>Rooms:</b> ${h.rooms}</p>
      <p><b>Floors:</b> ${h.floors}</p>
      <p><b>Edges:</b> ${h.edges}</p>
    `;
  }
  info.textContent = '';

  // Render with current preview mode
  this.renderDetail(h, this.previewMode);

  // toolbar toggles
  document.querySelectorAll('.viewer-toolbar .view-btn').forEach(btn=>{
    btn.onclick = () => {
      document.querySelectorAll('.viewer-toolbar .view-btn')
        .forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      this.renderDetail(h, btn.dataset.mode);
    };
  });

  // close handler (also remove listeners)
  document.getElementById('closeModal').onclick = () => {
    modal.classList.add('hidden');
    if (this._detailRAF) cancelAnimationFrame(this._detailRAF);
    if (this._detailControls?.dispose) this._detailControls.dispose();
    if (this._detailRenderer) this._detailRenderer.dispose();
    if (this._detailClick) document.getElementById('viewerCanvas')
      .removeEventListener('click', this._detailClick);
    if (this._detailResize) window.removeEventListener('resize', this._detailResize);
    // dispose previous objects
    (this._detailDisposables||[]).forEach(o=>{
      o.parent && o.parent.remove(o);
      o.geometry?.dispose?.();
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.());
    });
    this._detailDisposables = [];
  };
}

// helper: bounds over XZ for plan framing
_planBounds(data) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  if (!nodes.length) return { min:{x:-1,z:-1}, max:{x:1,z:1} };
  const n=v=>Number.isFinite(+v)?+v:0;
  let minX= Infinity, maxX=-Infinity, minZ= Infinity, maxZ=-Infinity;
  for (const r of nodes){
    const w = n(r.width?.[0] ?? r.width ?? r.w ?? r.size?.[0], 4) * STYLE.xyScale;
    const d = n(r.width?.[1] ?? r.depth ?? r.size?.[1],       4) * STYLE.xyScale;
    const x = n(r.center?.[0], 0) * STYLE.xyScale;
    const z = n(r.center?.[1], 0) * STYLE.xyScale;
    minX = Math.min(minX, x - w/2); maxX = Math.max(maxX, x + w/2);
    minZ = Math.min(minZ, z - d/2); maxZ = Math.max(maxZ, z + d/2);
  }
  return { min:{x:minX,z:minZ}, max:{x:maxX,z:maxZ} };
}

renderDetail(h, mode='volumes'){
  const canvas = document.getElementById('viewerCanvas');
  const info   = document.getElementById('roomInfo');

  // --- teardown previous frame/state
  if (this._detailRAF) cancelAnimationFrame(this._detailRAF);
  if (this._detailControls?.dispose) this._detailControls.dispose();
  if (this._detailRenderer) this._detailRenderer.dispose();
  if (this._detailClick) canvas.removeEventListener('click', this._detailClick);
  if (this._detailResize) window.removeEventListener('resize', this._detailResize);
  (this._detailDisposables||[]).forEach(o=>{
    o.parent && o.parent.remove(o);
    o.geometry?.dispose?.();
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose?.());
  });
  this._detailDisposables = [];

  // --- renderer / scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setClearColor(CURRENT.bg, 1);
  this._detailRenderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CURRENT.bg);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  // --- camera & controls (will swap for Ortho in plan)
  let camera = new THREE.PerspectiveCamera(60, (canvas.clientWidth||1)/(canvas.clientHeight||1), 0.1, 1000);
  camera.position.set(20,20,20);
  camera.lookAt(0,0,0);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  this._detailControls = controls;

  // --- build geometry & labels
  const pickables = [];
  const labels = [];
  let disposables = [];
  if (mode === 'graph') {
    disposables = Builders.graph(scene, h.data, pickables, labels);
  } else if (mode === 'wireframe') {
    disposables = Builders.wireframe(scene, h.data, pickables, labels);
  } else if (mode === 'plan') {
    disposables = Builders.plan(scene, h.data, pickables, labels);
  } else {
    disposables = Builders.volumes(scene, h.data, pickables, labels);
  }
  this._detailDisposables = disposables;
  this._pickables = pickables;

  // --- PLAN: orthographic framing kept on resize
  let savedPlan = null; // {cx, cz, halfW, halfH}
  if (mode === 'plan') {
    const {min, max} = this._planBounds(h.data);
    const cx = (min.x + max.x)/2, cz = (min.z + max.z)/2;
    let w = (max.x - min.x) || 2, hgt = (max.z - min.z) || 2;
    const pad = 0.8; w += pad*2; hgt += pad*2;

    const aspect = (canvas.clientWidth||1)/(canvas.clientHeight||1);
    let halfW = w/2, halfH = hgt/2;
    if (halfW/halfH > aspect) halfH = halfW/aspect; else halfW = halfH*aspect;

    camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -100, 1000);
    camera.position.set(cx, 100, cz);
    camera.up.set(0,0,-1);
    camera.lookAt(cx,0,cz);
    savedPlan = { cx, cz, halfW, halfH };

    controls.object = camera;
    controls.enableRotate = false;
    controls.target.set(cx, 0, cz);
    controls.update();
  } else {
    controls.enableRotate = true;
    controls.target.set(0,0,0);
    controls.update();
  }

  // --- picking
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const onClick = e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(this._pickables || [], false)[0];
    if (hit) {
      const n = hit.object.userData.node || {};
      info.textContent =
        `Room ${n.id ?? ''} — w:${n.width ?? '?'} d:${n.height ?? '?'} h:${n.room_height ?? n.height ?? '?'} floor:${n.floor ?? 0}`;
    }
  };
  canvas.addEventListener('click', onClick);
  this._detailClick = onClick;

  // --- resize (preserve plan centering)
  const onResize = () => {
    const w = canvas.clientWidth||1, h = canvas.clientHeight||1;
    renderer.setSize(w, h, false);
    if (camera.isPerspectiveCamera) {
      camera.aspect = w/h; camera.updateProjectionMatrix();
    } else if (savedPlan) {
      // recompute half sizes keeping content centered and padded
      const aspect = w/h;
      let { cx, cz, halfW, halfH } = savedPlan;
      if (halfW/halfH > aspect) { halfH = halfW/aspect; } else { halfW = halfH*aspect; }
      camera.left = -halfW; camera.right = halfW;
      camera.top  =  halfH; camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      camera.position.set(cx, camera.position.y, cz);
      camera.lookAt(cx,0,cz);
      controls.target.set(cx,0,cz);
    }
  };
  this._detailResize = onResize;
  window.addEventListener('resize', onResize, { passive:true });
  onResize(); // initial size

  // --- animate
  const loop = () => {
    this._detailRAF = requestAnimationFrame(loop);
    controls.update();
    if (labels.length) updateLabelScales(labels, camera);
    renderer.render(scene, camera);
  };
  loop();

}
  exportData(){
    const selected=Array.from(this.selectedHouses).map(id=>this.houses.find(h=>h.id===id)).filter(Boolean);
    const data=selected.length?selected:this.filteredHouses, json=JSON.stringify(data,null,2), blob=new Blob([json],{type:'application/json'}), url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='house-data-export.json'; a.click(); URL.revokeObjectURL(url)
  }
 _toast(msg){
    const t=document.createElement('div');
    t.textContent=msg;
    t.style.cssText='position:fixed;left:50%;top:20px;transform:translateX(-50%);background:#222;border:1px solid #444;color:#fff;padding:8px 12px;border-radius:8px;z-index:9999;opacity:.95';
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),2500)
  }
}



// Boot
(() => {
  document.addEventListener('DOMContentLoaded', () => new GalleryManager());
})();

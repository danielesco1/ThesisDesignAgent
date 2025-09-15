import { $, $$, uuid, debounce, esc, buildDropdown } from "./utils.js";
import { CURRENT, THEMES, setTheme } from "./themes.js";
import { ICON } from "./icons.js";
import { ThumbnailCache } from "./thumbnail-cache.js";
import { ComparisonEngine } from "./comparison-engine.js";
import { SceneView } from "./scene-view.js";

export class GalleryManager {
  constructor(){
    this.houses=[]; this.filteredHouses=[]; this.selectedHouses=new Set();
    this.compareHouses=[]; this.searchTerm=""; this.previewMode="plan";
    this.thumbnailCache=new ThumbnailCache(); this.comparisonEngine=new ComparisonEngine();
    this.currentView="grid"; this._panelRenderers=[]; this._rafIds=[];
    this._sceneView=null; this.themeName="light"; this.favorites=new Set(); this.favKeys=new Set(JSON.parse(localStorage.getItem("houseFavoriteKeys")||"[]"));
    this.onlyFavorites=false; this._filters={user:"All",location:"All"};
    this.init();
  }

  init(){
    $("#uploadBtn").onclick = ()=>$("#fileInput").click();
    $("#fileInput").onchange = (e)=>{ const files=Array.from(e.target.files).filter(f=>f.name.toLowerCase().endsWith(".json")); this.handleFileUpload({target:{files}}); };
    ["dragover","drop"].forEach(evt=>document.body.addEventListener(evt, e=>e.preventDefault()));
    document.body.addEventListener("drop", (e)=>{ const files=[...(e.dataTransfer?.files||[])].filter(f=>f.name.toLowerCase().endsWith(".json")); if(files.length) this.handleFileUpload({target:{files}}); });

    $("#searchBar").addEventListener("input", debounce((e)=>{ this.searchTerm=e.target.value.toLowerCase(); this.applyFilters(); },120));
    $$(".filter-chip[data-floors]").forEach(c=>c.onclick = ()=>this._activateChip(c, "[data-floors]"));
    $("#roomRange").oninput = (e)=>{ $("#roomMax").textContent=e.target.value; this.applyFilters(); };

    $("#selectAllBtn").onclick = ()=>this.selectAll();
    $("#clearBtn").onclick     = ()=>this.clearSelection();
    $("#deselectBatch").onclick= ()=>this.clearSelection();
    $("#compareBtn").onclick   = ()=>this.enterComparisonMode();
    $("#compareBatch").onclick = ()=>this.compareSelected();
    $("#exitComparison").onclick = ()=>this.exitComparisonMode();

    $("#previewGraphBtn").onclick  = ()=>{ this.previewMode="graph";  this._setHeaderPreviewButtons("previewGraphBtn");  this.renderGallery(); };
    $("#previewVolumesBtn").onclick= ()=>{ this.previewMode="volumes";this._setHeaderPreviewButtons("previewVolumesBtn");this.renderGallery(); };
    $("#previewPlanBtn").onclick   = ()=>{ this.previewMode="plan";   this._setHeaderPreviewButtons("previewPlanBtn");   this.renderGallery(); };

    $("#favoritesFilterBtn").onclick = (e)=>{ this.onlyFavorites=!this.onlyFavorites; e.currentTarget.setAttribute("aria-pressed", String(this.onlyFavorites)); this.applyFilters(); };
    $("#compareFavoritesBtn").onclick= ()=>this.compareFavorites();

    this.updateStats();
    this._setHeaderPreviewButtons("previewPlanBtn");
    this._initFacetDropdowns();
    this.applyTheme(this.themeName);

    const t=$("#themeToggle"); if(t){ t.checked=THEMES.light.isLight; t.onchange=()=>this.applyTheme(t.checked ? "light" : "dark"); }
  }

  applyTheme(name){
    setTheme(name);
    this.thumbnailCache.setTheme(CURRENT);
    if(this._sceneView){ this._sceneView.scene.background.set(CURRENT.bg); this._sceneView.renderer.setClearColor(CURRENT.bg,1); }
    for(const {renderer,scene} of this._panelRenderers){ scene.background.set(CURRENT.bg); renderer.setClearColor(CURRENT.bg,1); }
    this.renderGallery();
    if(this._detailHouse) this.renderDetail(this._detailHouse, this.previewMode);
  }

  _initFacetDropdowns(){ this._rebuildFacetDropdowns(); }
  _rebuildFacetDropdowns(){
    const uniq = (arr)=>Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));
    const userValues=["All", ...uniq(this.houses.map(h=>h.data?.users && String(h.data.users).trim()))];
    const locValues =["All", ...uniq(this.houses.map(h=>(h.location||h.data?.location) && String(h.location||h.data.location).trim()))];
    const userEl=$("#userDropdown"), locEl=$("#locationDropdown");
    if(userEl){ buildDropdown(userEl, userValues, (v)=>{ this._filters.user=v; this.applyFilters(); });
      userEl.querySelector(".dropdown-value").textContent = userValues.includes(this._filters.user)?this._filters.user:"All"; }
    if(locEl){ buildDropdown(locEl, locValues, (v)=>{ this._filters.location=v; this.applyFilters(); });
      locEl.querySelector(".dropdown-value").textContent = locValues.includes(this._filters.location)?this._filters.location:"All"; }
  }

  async handleFileUpload(e){
    const files=Array.from(e.target.files), grid=$("#galleryGrid");
    const loading=document.createElement("div"); loading.className="loading-spinner"; grid.appendChild(loading);
    const batch=10; for(let i=0;i<files.length;i+=batch){ const part=files.slice(i,i+batch); await Promise.all(part.map(f=>this.processFile(f))); }
    loading.remove(); this.applyFilters(); this.updateAnalytics(); this._rebuildFacetDropdowns();
  }

  processFile(file){ return new Promise(res=>{ const r=new FileReader();
    r.onload=(e)=>{ try{ this.addHouse(JSON.parse(e.target.result), file.name); }catch{ console.warn("JSON parse error:",file.name); this._toast(`Could not parse ${file.name}`); } res(); };
    r.readAsText(file);
  }); }

  addHouse(data, filename){
    const nodes=Array.isArray(data?.nodes)?data.nodes:[]; const edges=Array.isArray(data?.edges)?data.edges:[];
    const id=uuid(); const house={ id, name:data?.name || filename.replace(/\.json$/i,""), data:{...data,nodes,edges},
      filename, rooms:nodes.length, floors:Number.isFinite(data?.floors)?data.floors:1, edges:edges.length, location:data?.location || "Unknown" };
    this.houses.push(house); if(this.favKeys.has(filename)) this.favorites.add(id);
  }

  applyFilters(){
    let f=[...this.houses];
    if(this.onlyFavorites) f=f.filter(h=>this.favorites.has(h.id));
    if(this.searchTerm){ const q=this.searchTerm;
      f=f.filter(h=>h.name.toLowerCase().includes(q) || (h.location||"").toLowerCase().includes(q) || (h.filename||"").toLowerCase().includes(q));
    }
    const maxRooms=parseInt($("#roomRange").value,10); f=f.filter(h=>h.rooms<=maxRooms);
    const fc=$(".filter-chip[data-floors].active"); if(fc && fc.dataset.floors!=="all"){
      const v=fc.dataset.floors; f=f.filter(h=> (v==="3+"? h.floors>=3 : h.floors===parseInt(v,10))); }

    const userSel=(this._filters.user||"All").toLowerCase(); if(userSel!=="all"){
      f=f.filter(h=>{ const u=h.data?.users; const arr=Array.isArray(u)?u:String(u??"").split(","); return arr.map(s=>s.trim().toLowerCase()).includes(userSel); });
    }
    const locSel=(this._filters.location||"All").toLowerCase(); if(locSel!=="all"){
      f=f.filter(h=> (h.location||h.data?.location||"").toString().trim().toLowerCase()===locSel);
    }

    this.filteredHouses=f; this.renderGallery(); this.updateStats();
  }

  updateAnalytics(){
    const H=(arr,b)=>{ const h={}; arr.forEach(x=>{ const k=b(x); h[k]=(h[k]||0)+1; }); return h; };
    const roomsH=H(this.houses.map(h=>h.rooms), r=>Math.floor(r/2)*2);
    const floorsH=H(this.houses.map(h=>h.floors), f=>f);
    const compH=H(this.houses.map(h=>(h.edges||0)/Math.max(1,h.rooms)), c=>(Math.floor(c*2)/2).toFixed(1));
    const draw=(id,h)=>{ const bars=document.getElementById(id); bars.innerHTML="";
      const m=Math.max(1,...Object.values(h)); Object.entries(h).sort((a,b)=>+a[0]-+b[0]).forEach(([bk,ct])=>{
        const b=document.createElement("div"); b.className="chart-bar"; b.style.height=`${(ct/m)*100}%`; b.title=`${bk}: ${ct}`; bars.appendChild(b); });
    };
    draw("roomBars",roomsH); draw("floorBars",floorsH); draw("complexityBars",compH);
  }

  updateStats(){ $("#totalCount").textContent=this.houses.length; $("#filteredCount").textContent=this.filteredHouses.length; $("#selectedCount").textContent=this.selectedHouses.size; }

  renderGallery(){
    $("#comparisonView").classList.add("hidden"); $("#clusterView").classList.add("hidden");
    $("#galleryContainer").style.display="block";
    const c=$("#galleryGrid"); c.innerHTML=""; const items=this.filteredHouses, batch=24;
    const render=(i)=>{ const end=Math.min(i+batch, items.length);
      for(let k=i;k<end;k++) c.appendChild(this.createCard(items[k]));
      if(end<items.length) requestAnimationFrame(()=>render(end));
    }; render(0);
  }

  createCard(h){
    const card=document.createElement("div"); card.className="asset-card";
    if(this.selectedHouses.has(h.id)) card.classList.add("selected");
    if(this.compareHouses.includes(h.id)) card.classList.add("compare");
    const thumb=this.thumbnailCache.get(h.id, h.data, this.previewMode);
    const isFav=this.favorites.has(h.id);
    const heart=`<button class="heart-btn" aria-pressed="${isFav}" aria-label="${isFav?"Unfavorite":"Favorite"}" title="${isFav?"Unfavorite":"Favorite"}" data-id="${h.id}">${isFav?"❤":"♡"}</button>`;
    const d=h.data||{};
    const loc=d.location||h.location||"—", users=d.users||"—", clim=d.climate||"—", roof=d.roof_type||"—", facade=d.facade_materials||"—";
    const overlaps=d?.validation?.volume_overlaps?.count ?? 0, desc=(d.description||"").trim();

    card.innerHTML = `
      <div class="asset-preview">
        <img src="${thumb}" alt="${h.name.replace(/"/g,"&quot;")}" />
        ${this.compareHouses.includes(h.id)?'<div class="compare-badge">COMPARE</div>':""}
        ${heart}
      </div>
      <div class="asset-info">
        <div class="asset-name" title="${h.name.replace(/"/g,"&quot;")}">${esc(h.name)}</div>
        <div class="asset-meta">
          <span>${ICON.rooms} Rooms ${h.rooms}</span>
          <span>${ICON.floors} ${h.floors}F</span>
          <span>${ICON.edges} ${h.edges}</span>
        </div>
        <div class="asset-location">${ICON.location} ${esc(loc)}</div>
        <div class="asset-extra">
          <div class="meta-row">
            <span>${ICON.users} ${esc(users)}</span>
            <span>${ICON.climate} ${esc(clim)}</span>
            <span>${ICON.overlaps} ${esc(overlaps)}</span>
          </div>
          <div class="meta-row">
            <span>${ICON.roof} ${esc(roof)}</span>
            <span>${ICON.facade} ${esc(facade)}</span>
          </div>
          ${desc ? `<p class="asset-desc" title="${desc.replace(/"/g,"&quot;")}">${esc(desc)}</p>` : ""}
        </div>
      </div>
    `;

    card.onclick = (e)=>{
      if(e.target.closest(".heart-btn")) return;
      if(e.ctrlKey||e.metaKey) this.toggleSelection(h.id);
      else if(e.shiftKey) this.addToComparison(h.id);
      else this.openDetail(h);
    };
    const heartBtn = card.querySelector(".heart-btn");
    if(heartBtn){ heartBtn.onclick=(e)=>{ e.stopPropagation(); this.toggleFavorite(h.id,h.filename);
      const favNow=this.favorites.has(h.id); heartBtn.setAttribute("aria-pressed", String(favNow));
      heartBtn.setAttribute("aria-label", favNow ? "Unfavorite" : "Favorite");
      heartBtn.title = favNow ? "Unfavorite" : "Favorite"; heartBtn.textContent = favNow ? "❤" : "♡";
    }; }
    return card;
  }

  toggleFavorite(id){
    this.favorites.has(id) ? this.favorites.delete(id) : this.favorites.add(id);
    const h=this.houses.find(x=>x.id===id); if(h){ if(this.favorites.has(id)) this.favKeys.add(h.filename); else this.favKeys.delete(h.filename);
      localStorage.setItem("houseFavoriteKeys", JSON.stringify([...this.favKeys])); }
    if(this.onlyFavorites) this.applyFilters(); else this.updateStats();
  }

  _setHeaderPreviewButtons(activeId){ $$("[data-viewbtn]").forEach(b=>{ const on=b.id===activeId; b.classList.toggle("active",on); b.setAttribute("aria-pressed",String(on)); }); }

  _activateChip(active, sel){ const g=active.parentElement; $$(sel,g).forEach(c=>{ c.classList.remove("active"); c.setAttribute("aria-pressed","false"); });
    active.classList.add("active"); active.setAttribute("aria-pressed","true"); this.applyFilters(); }

  toggleSelection(id){ this.selectedHouses.has(id) ? this.selectedHouses.delete(id) : this.selectedHouses.add(id); this.updateBatchActions(); this.renderGallery(); }
  selectAll(){ this.filteredHouses.forEach(h=>this.selectedHouses.add(h.id)); this.updateBatchActions(); this.renderGallery(); }
  clearSelection(){ this.selectedHouses.clear(); this.compareHouses=[]; this.updateBatchActions(); this.renderGallery(); }
  updateBatchActions(){ const c=this.selectedHouses.size, el=$("#batchActions"); if(c>0){ el.classList.add("active"); $("#batchCount").textContent=c; } else el.classList.remove("active"); this.updateStats(); }
  addToComparison(id){ this.compareHouses = this.compareHouses.includes(id) ? this.compareHouses.filter(x=>x!==id) :
                        this.compareHouses.length<4 ? [...this.compareHouses,id] : this.compareHouses; this.renderGallery(); }
  compareSelected(){ this.compareHouses = [...this.selectedHouses].slice(0,4); this.enterComparisonMode(); }
  compareFavorites(){ const favs=this.houses.filter(h=>this.favorites.has(h.id)).slice(0,4); if(favs.length<2){ alert("Favorite at least 2 items to compare."); return; }
    this.compareHouses=favs.map(h=>h.id); this.enterComparisonMode(); }

  enterComparisonMode(){
    if(this.compareHouses.length<2){ alert("Select at least 2 houses to compare."); return; }
    $("#galleryContainer").style.display="none"; $("#clusterView").classList.add("hidden"); $("#comparisonView").classList.remove("hidden");
    this.renderComparison();
  }

  renderComparison(){
    const panels=$("#comparisonPanels"); panels.innerHTML="";
    const hs=this.compareHouses.map(id=>this.houses.find(h=>h.id===id)).filter(Boolean);
    hs.forEach(h=>{
      const p=document.createElement("div"); p.className="comparison-panel";
      p.innerHTML=`<div class="panel-header" title="${esc(h.name)}">${esc(h.name)}</div>
        <div class="panel-viewer"><canvas class="panel-canvas"></canvas></div>
        <div class="panel-stats">
          <div class="diff-item"><span class="diff-label">Rooms</span><span class="diff-value">${h.rooms}</span></div>
          <div class="diff-item"><span class="diff-label">Floors</span><span class="diff-value">${h.floors}</span></div>
          <div class="diff-item"><span class="diff-label">Edges</span><span class="diff-value">${h.edges}</span></div>
          <div class="diff-item"><span class="diff-label">Connectivity</span><span class="diff-value">${(h.edges/Math.max(1,h.rooms)).toFixed(2)}</span></div>
        </div>`;
      panels.appendChild(p); this.render3DView(h, p.querySelector(".panel-canvas"));
    });
    this.showDifferences(hs);
  }

  render3DView(h, canvas){
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    const resize=()=>{ const w=canvas.clientWidth||400, h=canvas.clientHeight||300; renderer.setSize(w,h,false); };
    resize();
    const scene=new THREE.Scene(); scene.background=new THREE.Color(CURRENT.bg);
    const camera=new THREE.PerspectiveCamera(50,1,0.1,1000); scene.add(new THREE.AmbientLight(0xffffff,0.8));

    (this.previewMode==="volumes" ? (awaitImport(Builders=>Builders.volumes)) :
     this.previewMode==="plan"    ? (awaitImport(Builders=>Builders.plan)) :
                                    (awaitImport(Builders=>Builders.graph)))(scene,h.data);

    function awaitImport(sel){ return async (scene,data)=> sel((await import("./builders.js")).Builders)(scene,data); } // (quick dynamic import wrapper)

    const fit3D=()=>{
      const nodes=Array.isArray(h.data?.nodes)?h.data.nodes:[]; if(!nodes.length){ camera.position.set(15,15,15); camera.lookAt(0,0,0); return; }
      let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
      for(const n of nodes){
        const w=Math.max(Number((n.width?.[0] ?? n.width ?? n.w ?? n.size?.[0]) || 4), 0.001);
        const d=Math.max(Number((n.width?.[1] ?? n.depth ?? n.size?.[1]) || 4), 0.001);
        const hgt=Math.max(Number(n.height??n.room_height??3),0.001);
        const cx=Number(n.center?.[0]||0), cz=Number(n.center?.[1]||0);
        const y0 = Number(n.floor||0); const y1=y0+hgt;
        minX=Math.min(minX,cx-w/2); maxX=Math.max(maxX,cx+w/2);
        minZ=Math.min(minZ,cz-d/2); maxZ=Math.max(maxZ,cz+d/2);
        minY=Math.min(minY,y0);     maxY=Math.max(maxY,y1);
      }
      const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
      const spanX=Math.max(0.01,maxX-minX), spanY=Math.max(0.01,maxY-minY), spanZ=Math.max(0.01,maxZ-minZ);
      const r=Math.max(spanX,spanY,spanZ)*0.6; const w=canvas.clientWidth||400, hh=canvas.clientHeight||300;
      camera.aspect=w/hh; const fov=(camera.fov*Math.PI)/180; const hFov=2*Math.atan(Math.tan(fov/2)*camera.aspect);
      const dist=Math.max(r/Math.tan(hFov/2),(r*1.2)/Math.tan(fov/2))*1.6;
      camera.position.set(cx+dist, cy+dist*0.8, cz+dist); camera.lookAt(cx,cy,cz);
      camera.near=Math.max(0.01, dist*0.01); camera.far=dist*100; camera.updateProjectionMatrix();
    };
    fit3D();
    const ro=new ResizeObserver(()=>{ resize(); fit3D(); }); ro.observe(canvas);
    const animate=()=>{ const id=requestAnimationFrame(animate); this._rafIds.push(id); renderer.render(scene,camera); };
    animate(); this._panelRenderers.push({renderer,scene,ro});
  }

  showDifferences(hs){
    const panel=$("#differencesPanel"), cmp=this.comparisonEngine.compareHouses(hs);
    const fmt=(v)=>Array.isArray(v)? v.map(n=> (typeof n==="number"? n.toFixed(2):n)).join(" / ") : v;
    let html="<h3>Analysis</h3>";
    if(cmp.differences.length){ html+="<h4>Differences</h4>";
      cmp.differences.forEach(d=>{ html+=`<div class="diff-item"><span class="diff-label">${esc(d.field)}</span><div class="diff-values">${d.values.map(v=>`<span class="diff-value different">${esc(fmt(v))}</span>`).join("")}</div></div>`; });
    }
    if(cmp.similarities.length){ html+="<h4>Similarities</h4>";
      cmp.similarities.forEach(s=>{ html+=`<div class="diff-item"><span class="diff-label">${esc(s.field)}</span><span class="diff-value same">${esc(fmt(s.values[0]))}</span></div>`; });
    }
    panel.innerHTML=html;
  }

  exitComparisonMode(){
    $("#galleryContainer").style.display="block"; $("#comparisonView").classList.add("hidden");
    this._rafIds.forEach(id=>cancelAnimationFrame(id)); this._rafIds=[];
    this._panelRenderers.forEach(({renderer,scene,ro})=>{ ro.disconnect(); renderer.dispose();
      scene.traverse(o=>{ o.geometry&&o.geometry.dispose?.(); if(o.material){ Array.isArray(o.material)?o.material.forEach(m=>m.dispose?.()):o.material.dispose?.(); } });
    });
    this._panelRenderers=[];
  }

  _positionViewerNav(modal){
    const overlay=modal.querySelector(".viewer-nav"), canvas=modal.querySelector("#viewerCanvas"), host=modal.querySelector(".modal-content");
    if(!overlay||!canvas||!host) return;
    const rHost=host.getBoundingClientRect(), rCanvas=canvas.getBoundingClientRect();
    const topMid=Math.round(rCanvas.top - rHost.top + rCanvas.height/2);
    const pad=12, leftEdge=Math.max(pad, Math.round(rCanvas.left - rHost.left + pad));
    const rightEdge=Math.max(pad, Math.round(rHost.right - rCanvas.right + pad));
    const heartR=Math.max(16, Math.round(rHost.right - rCanvas.right + 16));
    const heartB=Math.max(16, Math.round(rHost.bottom - rCanvas.bottom + 16));
    overlay.style.setProperty("--nav-top", `${topMid}px`);
    overlay.style.setProperty("--nav-left", `${leftEdge}px`);
    overlay.style.setProperty("--nav-right", `${rightEdge}px`);
    overlay.style.setProperty("--heart-right", `${heartR}px`);
    overlay.style.setProperty("--heart-bottom", `${heartB}px`);
  }

  openDetail(h){
    this._detailHouse=h; this._currentDetailMode=this.previewMode;
    const modal=$("#viewerModal"); modal.classList.remove("hidden");
    const props=$("#houseProps");
    if(props){
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
        <div class="detail-section"><h4>Description</h4><p>${esc(h.data.description)||"No description available"}</p></div>
        <div class="spec-item"><label>Location</label><span>${esc(h.location)||"—"}</span></div>
        <div class="spec-item"><label>Climate</label><span>${esc(h.data.climate)||"—"}</span></div>
        <div class="spec-item"><label>Users</label><span>${esc(h.data.users)||"—"}</span></div>
        <div class="spec-item"><label>Reason</label><span>${esc(h.data.reason)||"—"}</span></div>
      </div>
      <div class="tab-content" id="specs">
        <div class="spec-list">
          <div class="spec-item"><label>Location</label><span>${esc(h.location)||"—"}</span></div>
          <div class="spec-item"><label>Climate</label><span>${esc(h.data.climate)||"—"}</span></div>
          <div class="spec-item"><label>Users</label><span>${esc(h.data.users)||"—"}</span></div>
          <div class="spec-item"><label>Profession</label><span>${esc(h.data.profession)||"—"}</span></div>
          <div class="spec-item"><label>Roof Type</label><span>${esc(h.data.roof_type)||"—"}</span></div>
          <div class="spec-item"><label>Facade</label><span>${esc(h.data.facade_materials)||"—"}</span></div>
          <div class="spec-item"><label>Reason</label><span>${esc(h.data.reason)||"—"}</span></div>
        </div>
      </div>
      <div class="tab-content" id="analysis"></div>
      <div class="tab-content" id="verification"></div>
      <div class="tab-content" id="site"></div>`;
      $$(".detail-tabs .tab", props).forEach(tab=>{
        tab.onclick=()=>{ $$(".detail-tabs .tab", props).forEach(t=>t.classList.remove("active"));
          $$(".tab-content", props).forEach(c=>c.classList.remove("active"));
          tab.classList.add("active"); document.getElementById(tab.dataset.tab)?.classList.add("active");
        };
      });
    }
    const info=$("#roomInfo"); info.innerHTML='<div class="room-tooltip-container"></div>';

    if(!this._sceneView) this._sceneView=new SceneView($("#viewerCanvas"));
    this._sceneView.onPick = (n)=>{ this._sceneView.highlightRoom(n, this._currentDetailMode); info.textContent = n?.id||""; };

    this.renderDetail(h, this._currentDetailMode);
    this._sceneView.queueFit(this._currentDetailMode);
    requestAnimationFrame(()=> this._sceneView.queueFit(this._currentDetailMode));
    requestAnimationFrame(()=> requestAnimationFrame(()=> this._positionViewerNav(modal)));

    const toolbarBtns=$$(".viewer-toolbar .view-btn", modal);
    toolbarBtns.forEach(b=>{ b.classList.toggle("active", b.dataset.mode===this._currentDetailMode);
      b.onclick=()=>{ toolbarBtns.forEach(x=>x.classList.remove("active")); b.classList.add("active");
        this._currentDetailMode=b.dataset.mode; this.renderDetail(h,this._currentDetailMode);
        this._sceneView.queueFit(this._currentDetailMode);
        requestAnimationFrame(()=> this._sceneView.queueFit(this._currentDetailMode));
        requestAnimationFrame(()=> requestAnimationFrame(()=> this._positionViewerNav(modal)));
      };
    });

    const doClose=()=>{ this._sceneView?.clearHighlight?.(); if(this._sceneView) this._sceneView._savedOrtho=null;
      this._sceneView?.resetCamera?.(); modal.classList.add("hidden");
      if(this._viewerKeyHandler){ window.removeEventListener("keydown", this._viewerKeyHandler); this._viewerKeyHandler=null; }
      if(this._viewerNavRO){ this._viewerNavRO.disconnect(); this._viewerNavRO=null; }
      if(this._viewerNavWinResize){ window.removeEventListener("resize", this._viewerNavWinResize); this._viewerNavWinResize=null; }
    };
    $("#closeModal").onclick=()=>doClose();
    document.addEventListener("keydown", function escKey(e){ if(e.key==="Escape"){ doClose(); document.removeEventListener("keydown", escKey);} }, {once:true});

    $(".viewer-nav", modal)?.remove();
    const overlay=document.createElement("div"); overlay.className="viewer-nav";
    overlay.innerHTML=`
      <button class="edge-nav edge-left"  aria-label="Previous (←)" title="Previous (←)">‹</button>
      <button class="edge-nav edge-right" aria-label="Next (→)"     title="Next (→)">›</button>
      <button class="heart-viewer" aria-pressed="${this.favorites.has(h.id)}"
              aria-label="${this.favorites.has(h.id)?"Unfavorite":"Favorite"}"
              title="${this.favorites.has(h.id)?"Unfavorite":"Favorite"}">${this.favorites.has(h.id)?"❤":"♡"}</button>`;
    modal.querySelector(".modal-content").appendChild(overlay);

    const leftBtn=overlay.querySelector(".edge-left"), rightBtn=overlay.querySelector(".edge-right"), heartBtn=overlay.querySelector(".heart-viewer");
    const getList=()=> (this.filteredHouses.length ? this.filteredHouses : this.houses);
    const goNeighbor=(delta)=>{ const list=getList(); const i=list.findIndex(x=>x.id===this._detailHouse.id); if(i===-1||!list.length) return;
      const j=(i+delta+list.length)%list.length; const next=list[j]; const mode=this._currentDetailMode;
      this.openDetail(next); this._currentDetailMode=mode; this.renderDetail(next,mode);
      $$(".viewer-toolbar .view-btn", modal).forEach(b=> b.classList.toggle("active", b.dataset.mode===mode));
      queueMicrotask(()=>{ this._sceneView?.fitToContent?.(mode); this._positionViewerNav(modal); });
    };
    leftBtn.onclick=(e)=>{ e.stopPropagation(); goNeighbor(-1); };
    rightBtn.onclick=(e)=>{ e.stopPropagation(); goNeighbor(+1); };
    heartBtn.onclick=(e)=>{ e.stopPropagation(); const id=this._detailHouse.id; this.toggleFavorite(id);
      const favNow=this.favorites.has(id); heartBtn.setAttribute("aria-pressed", String(favNow));
      heartBtn.setAttribute("aria-label", favNow ? "Unfavorite" : "Favorite");
      heartBtn.title = favNow ? "Unfavorite" : "Favorite"; heartBtn.textContent = favNow ? "❤" : "♡"; this.updateStats(); };

    if(this._viewerKeyHandler) window.removeEventListener("keydown", this._viewerKeyHandler);
    this._viewerKeyHandler=(e)=>{ if(modal.classList.contains("hidden")) return;
      if(e.key==="ArrowLeft"){ e.preventDefault(); goNeighbor(-1); }
      if(e.key==="ArrowRight"){ e.preventDefault(); goNeighbor(+1); }
      if(e.key.toLowerCase?.()==="f"){ e.preventDefault(); heartBtn.click(); } };
    window.addEventListener("keydown", this._viewerKeyHandler);

    const host=modal.querySelector(".modal-content"); const canvas=modal.querySelector("#viewerCanvas");
    const place=()=>this._positionViewerNav(modal); place();
    if(this._viewerNavRO) this._viewerNavRO.disconnect();
    this._viewerNavRO=new ResizeObserver(place); this._viewerNavRO.observe(host); if(canvas) this._viewerNavRO.observe(canvas);
    if(this._viewerNavWinResize) window.removeEventListener("resize", this._viewerNavWinResize);
    this._viewerNavWinResize=place; window.addEventListener("resize", this._viewerNavWinResize, {passive:true});
  }

  renderDetail(h, mode="volumes"){
    const sv=this._sceneView; if(!sv) return;
    this._currentDetailMode=mode; sv.build(mode, h.data);
    if(mode==="plan"){ const b=sv.computePlanBounds(h.data), pad=0.8;
      sv.setOrthoByBounds({min:{x:b.min.x-pad,z:b.min.z-pad}, max:{x:b.max.x+pad,z:b.max.z+pad}}, 1);
      this._detailResize?.(); this._detailResize=()=>sv.setOrthoByBounds(b,1); window.addEventListener("resize", this._detailResize, {passive:true});
    } else {
      window.removeEventListener("resize", this._detailResize||(()=>{})); this._detailResize=null;
      const wb=sv.computeWorldBounds(h.data); if(wb?.center){ const c=wb.center, d=wb.radius*2.2; sv.setPerspective([c[0]+d,c[1]+d,c[2]+d], c); }
      else sv.setPerspective([20,20,20],[0,0,0]);
    }
    sv.queueFit(mode); requestAnimationFrame(()=>sv.queueFit(mode));
  }

  _toast(msg){ const t=document.createElement("div"); t.textContent=msg;
    t.style.cssText="position:fixed;left:50%;top:20px;transform:translateX(-50%);background:#222;border:1px solid #444;color:#fff;padding:8px 12px;border-radius:8px;z-index:9999;opacity:.95";
    document.body.appendChild(t); setTimeout(()=>t.remove(),2500);
  }
}

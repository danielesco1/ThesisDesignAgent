// tiny DOM + helpers
export const $  = (s, r=document) => r.querySelector(s);
export const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
export const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const debounce = (fn, ms=150) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
export const esc = (s)=> String(s ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
export const num = (v, d=0) => (Number.isFinite(+v) ? +v : d);
export const colorOf = (n) => new THREE.Color(
  n.color || (n.privacy_level==="private" ? "#ff6b6b" :
              n.privacy_level==="semi_private" ? "#f5a623" : "#667eea")
);

// dropdown builder
export function buildDropdown(rootEl, values, onChange){
  const trigger = rootEl.querySelector(".dropdown-trigger");
  const valueEl = rootEl.querySelector(".dropdown-value");
  const menu    = rootEl.querySelector(".dropdown-menu");
  menu.setAttribute("role","listbox");
  menu.innerHTML = "";
  values.forEach((v,i)=>{
    const li = document.createElement("li");
    li.setAttribute("role","option"); li.tabIndex=0;
    li.textContent = v; if(i===0) li.setAttribute("aria-selected","true");
    li.onclick = ()=>{ [...menu.children].forEach(x=>x.removeAttribute("aria-selected"));
      li.setAttribute("aria-selected","true"); valueEl.textContent=v;
      rootEl.setAttribute("aria-expanded","false"); trigger.setAttribute("aria-expanded","false"); onChange(v); };
    li.onkeydown = (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); li.click(); } };
    menu.appendChild(li);
  });
  trigger.onclick = (e)=>{ e.stopPropagation();
    const open = rootEl.getAttribute("aria-expanded")==="true";
    rootEl.setAttribute("aria-expanded", String(!open));
    trigger.setAttribute("aria-expanded", String(!open));
  };
  document.addEventListener("click", ()=>{ rootEl.setAttribute("aria-expanded","false"); trigger.setAttribute("aria-expanded","false"); });
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape"){ rootEl.setAttribute("aria-expanded","false"); trigger.setAttribute("aria-expanded","false"); }});
}

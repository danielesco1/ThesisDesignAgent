export class ComparisonEngine {
  constructor(){ this.compareFields=["rooms","floors","edges","area","privacy_distribution","connectivity","centrality","clustering"]; }
  compareHouses(hs){ const differences=[], similarities=[]; for(const f of this.compareFields){
      const vals=hs.map(h=>this.getFieldValue(h,f)), same=this._allEqual(vals), variance=this._variance(vals);
      (same?similarities:differences).push({field:f, values:vals, same, variance});
    } return {differences, similarities};}
  getFieldValue(h,f){ const d=h.data; switch(f){
    case "rooms": return (d.nodes||[]).length;
    case "floors": return Number.isFinite(d?.floors)?d.floors:1;
    case "edges": return (d.edges||[]).length;
    case "area": return (d.site_area?.width||0)*(d.site_area?.height||0);
    case "privacy_distribution": return this._privacyVector(d);
    case "connectivity": { const n=Math.max(1,(d.nodes||[]).length); return (d.edges||[]).length / n; }
    case "centrality": return this._avgCentrality(d);
    case "clustering": return d.networkx_analysis?.global?.average_clustering || 0;
    default: return null; } }
  _privacyVector(d){ const dist={public:0,semi_private:0,private:0};
    (d.nodes||[]).forEach(n=>{ const k=(n.privacy_level||"").toLowerCase(); if(k in dist) dist[k]++; });
    const tot=Math.max(1,(d.nodes||[]).length); return [dist.public/tot, dist.semi_private/tot, dist.private/tot];}
  _avgCentrality(d){ const per=d.networkx_analysis?.per_node||{}; const vals=Object.values(per).map(o=>o.betweenness_choice||0);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0; }
  _allEqual(a){ if(!a.length) return true; const f=JSON.stringify(a[0]); return a.every(v=>JSON.stringify(v)===f); }
  _variance(v){ const flat=v.flat?v.flat():v; if(!flat.length||flat.some(x=>typeof x!=="number")) return 0;
    const m=flat.reduce((a,b)=>a+b,0)/flat.length; return Math.sqrt(flat.reduce((s,x)=>s+Math.pow(x-m,2),0)/flat.length); }
}

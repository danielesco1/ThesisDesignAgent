# House Graph Inspector

A minimal, modular web app to **browse, filter, compare, and visualize** house-graph JSONs (nodes = rooms, edges = connections). No build step. Just open `index.html`.

- **Stack:** HTML + CSS + vanilla JS + Three.js (CDN)
- **Files:**  
  - `index.html` – semantic layout & IDs  
  - `styles.css` – compact, commented styles  
  - `script.js` – all behavior (upload, filters, rendering, compare)

## Quick Start
1. Put `index.html`, `styles.css`, `script.js` in the same folder.
2. Open `index.html` in a browser (Chrome recommended).
3. Click **Upload JSONs** or **drag-and-drop** `.json` files anywhere on the page.
4. Use **search + filters** to narrow results.
5. **Ctrl/Cmd-click** to multi-select; **Shift-click** to mark for **comparison**.
6. Switch views: **Grid / List / Cluster**.
7. **Compare Selected** to open side-by-side 3D panels.
8. **Export** to download a `.json` with selected/filtered items.

## Expected JSON Shape (minimal)
```json
{
  "name": "My House",
  "floors": 2,
  "location": "City, Country",
  "site_area": { "width": 20, "height": 30 },
  "nodes": [
    { "id": "living", "center": [5, 10], "floor": 0, "privacy_level": "public" }
  ],
  "edges": [["living", "kitchen"]],
  "networkx_analysis": {
    "global": { "average_clustering": 0.12 },
    "per_node": { "living": { "betweenness_choice": 0.08 } }
  }
}
Only nodes (with id) and edges are strictly required. Missing fields are defaulted.

Keyboard / UX
Ctrl/Cmd-Click: select/deselect a card

Shift-Click: add/remove card to comparison set (max 4)

Compare: needs ≥2 selected in the compare set

Analyze: scrolls the sidebar to distribution charts

Troubleshooting
No thumbnails? Check JSON keys: nodes[*].id, nodes[*].center, nodes[*].floor, and edges as [fromId, toId].

Performance with many files: the app batches card rendering; still, try ≤1–2k items.

GPU/Memory: 3D thumbnails and compare views dispose geometries/materials to avoid leaks.

Customize
Look & feel: edit styles.css (colors, radii, spacing).

Metrics: edit ComparisonEngine.compareFields in script.js.

Cluster logic: tweak renderClusterView() mapping (x = rooms, y = floors).

License
MIT (or your choice).

yaml
Copy code

---

## documentation.md
```markdown
# House Graph Inspector — Technical Documentation

## 1) Architecture Overview
- **index.html**: Semantic structure + stable IDs/classes for scripting and CSS.
- **styles.css**: Single, compact stylesheet grouped by UI regions (Header, Sidebar, Gallery, Comparison, Cluster).
- **script.js**: Three modular classes + a thin bootstrap:
  - `ThumbnailCache`: renders tiny 3D previews (spheres for rooms, lines for edges) to data URLs.
  - `ComparisonEngine`: computes differences/similarities across numeric/derived fields.
  - `GalleryManager`: the controller (state, events, filtering, DOM updates, 3D compare panels).

```mermaid
flowchart LR
  JSONs[(JSON Files)]
  subgraph App
    GM[GalleryManager]
    TC[ThumbnailCache]
    CE[ComparisonEngine]
  end
  JSONs --> GM
  GM <--> TC
  GM <--> CE
  GM -->|DOM updates| UI[Cards/Views/Charts]
2) Data Model (assumed keys)
House object (internal):

js
Copy code
{
  id, name, data, filename,
  rooms: data.nodes.length,
  floors: data.floors || 1,
  edges: data.edges.length,
  location: data.location || 'Unknown'
}
Incoming JSON:

nodes[]: { id: string, center?: [x,y], floor?: number, privacy_level?: 'public'|'semi_private'|'private' }

edges[]: [fromId, toId]

Optional: floors, location, site_area{width,height}, networkx_analysis{global,per_node}

Missing/unknown fields are defaulted so uploads don't crash.

3) Major Components
3.1 ThumbnailCache
Purpose: Fast 3D preview for each house card (no interactive controls).

Key methods:

getThumbnail(houseId, data): memoized dataURL; evicts LRU when size exceeded.

createSimplifiedGraph(scene, data): adds spheres (nodes) + line segments (edges).

Memory safety: Disposes geometry and materials and removes objects from the scene after rendering to prevent GPU leaks.

3.2 ComparisonEngine
Fields compared (compareFields):

rooms, floors, edges

area (site width*height if present)

privacy_distribution (vector of public/semi_private/private ratios)

connectivity (edges / rooms)

centrality (mean of networkx_analysis.per_node[*].betweenness_choice)

clustering (global average_clustering)

Outputs:

{ differences: [...], similarities: [...] } with per-field values, same, variance

3.3 GalleryManager (controller)
State: houses, filteredHouses, selectedHouses(Set), compareHouses(Array), searchTerm, currentView

I/O:

File uploads via input and drag-drop; JSON parsing with try/catch.

Export selected or filtered houses to a single .json.

UI wiring (IDs/classes used):

Stats: #totalCount, #filteredCount, #selectedCount

Filters: .filter-chip[data-floors], .filter-chip[data-privacy], #roomRange, #searchBar

Views: buttons with [data-view="grid|list|cluster"]

Gallery: #galleryGrid (cards), #galleryContainer

Batch bar: #batchActions, counters and actions

Comparison: #comparisonView, #comparisonPanels, #differencesPanel

Cluster: #clusterView, #clusterContainer

Rendering:

Cards: createCard() sets thumbnail (from ThumbnailCache) + meta; supports grid and list layout.

Batched DOM: gallery renders in chunks (batchSize=24) via requestAnimationFrame for responsiveness.

Mini-charts: quick histograms for rooms, floors, and edges/room.

Cluster View: simple 2D scatter (x=rooms normalized, y=floors normalized).

Comparison View: up to 4 canvases; each has its own Three.js renderer + orbiting camera animation.

Cleanup:

On exiting comparison: cancelAnimationFrame, ResizeObserver.disconnect, renderer.dispose(), and deep disposal of geometry/material to avoid leaks.

4) Events & Interactions
Selection: Ctrl/Cmd-click toggles; batch actions appear with count.

Compare: Shift-click to add to compare set (max 4). Requires ≥2 to enter comparison mode.

Filters:

Search applies to name, location, filename (lowercased).

Room slider caps rooms <= value.

Floor chips: "all" | 1 | 2 | "3+".

Privacy chips filter if any node contains that privacy level.

Analyze: Scrolls sidebar to distribution charts (placeholder for deeper analytics).

5) Performance Notes
Thumbnails reuse a single WebGLRenderer; generated previews are static data URLs.

DOM batching avoids long frames when rendering many cards.

Disposals: All geometries/materials in preview & compare scenes are disposed to prevent GPU memory growth.

6) Extensibility Recipes
Add a new comparison field
Add the field name to ComparisonEngine.compareFields.

Extend getFieldValue() with your computation.

(Optional) Render it in each panel's stats.

Add a per-house detail modal
Implement openDetail(house) to show a modal with metadata and a larger 3D view.

Reuse ThumbnailCache.createSimplifiedGraph() for the 3D scene.

Dispose on close.

Change cluster axes
Edit renderClusterView() to map any metrics (e.g., x=connectivity, y=centrality) with min–max normalization.

Accept remote data
Replace file input handling with a fetch() loop, then call addHouse(data, 'sourceName.json').

7) Styling Conventions
Compact single file (styles.css) grouped by region; class names are semantic.

Gradients and subtle blur provide depth; cards elevate on hover.

Scrollbar styled to match theme.

8) LLM Patching Guide (safe edit points)
Metrics logic: ComparisonEngine.getFieldValue()

Card layout: createCard() innerHTML (keep .asset- class names).

Batch size for render throughput: renderGallery() → batchSize.

Charts: updateAnalytics() → renderBars/draw helpers.

3D graph: ThumbnailCache.createSimplifiedGraph(); keep disposals when adding meshes/materials.

Comparison panels: render3DView(); if adding controls, ensure dispose and cancelAnimationFrame remain.

Invariant to preserve: Always dispose geometries/materials and WebGL renderers on teardown; keep batched rendering for large lists; don’t block the main thread with heavy loops.

9) Dependency
Three.js via CDN (r128):

html
Copy code
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
You may pin or vendor the file for offline use.

10) Testing Checklist
Upload 1–5 valid JSONs → thumbnails appear

Search + filters update counts & cards

Select/Compare logic (Ctrl/Cmd-click, Shift-click) works; compare view shows ≤4

Exit comparison releases GPU memory (watch Chrome's task manager)

Export contains selected or filtered set
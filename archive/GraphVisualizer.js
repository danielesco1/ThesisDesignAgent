// graphVisualizer.js
/**
 * GraphVisualizer manages loading a node-edge graph into a Three.js scene.
 * Relies on global THREE (loaded via <script>) and is itself an ES module.
 */
export class GraphVisualizer {
  /**
   * @param {THREE.Scene} scene — your Three.js scene
   */
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.nodeMeshes = {};
    this.edgeLines = [];
    this.edgeConnections = []; // Store edge connections
    
    // Drag state
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedNode = null;
    this.isDragging = false;
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    this.initDragControls();
  }

  initDragControls() {
    const canvas = this.renderer.domElement;
    
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', () => this.onMouseUp());
  }

    onMouseDown(event) {
    event.preventDefault(); // Prevent default behavior
    console.log('Mouse down event triggered');
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Check recursively through the group
    const intersects = this.raycaster.intersectObjects(this.group.children, true);
    console.log('Intersects found:', intersects.length);
    
    // Filter for actual node meshes
    const nodeIntersects = intersects.filter(intersect => 
        Object.values(this.nodeMeshes).includes(intersect.object)
    );
    
    if (nodeIntersects.length > 0) {
        console.log('Node selected:', nodeIntersects[0].object);
        this.selectedNode = nodeIntersects[0].object;
        this.isDragging = true;
        
        // Disable OrbitControls
        if (window.viewer3D && window.viewer3D.controls) {
        window.viewer3D.controls.enabled = false;
        console.log('OrbitControls disabled');
        }
        
        // Set drag plane at node height
        this.dragPlane.constant = -this.selectedNode.position.y;
        
        // Highlight selected node
        this.selectedNode.material.emissive = new THREE.Color(0x444444);
    }
    }

    onMouseUp() {
        if (this.selectedNode) {
            this.selectedNode.material.emissive = new THREE.Color(0x000000);
            this.selectedNode = null;
        }
        this.isDragging = false;
        
        // CRITICAL: Re-enable OrbitControls
        if (window.viewer3D && window.viewer3D.controls) {
            window.viewer3D.controls.enabled = true;
        }
        }

  onMouseMove(event) {
    if (!this.isDragging || !this.selectedNode) return;
    
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);
    
    if (intersectPoint) {
      this.selectedNode.position.x = intersectPoint.x;
      this.selectedNode.position.z = intersectPoint.z;
      
      // Update edges connected to this node
      this.updateConnectedEdges(this.selectedNode);
      
      // Update label position
      const nodeId = Object.keys(this.nodeMeshes).find(key => this.nodeMeshes[key] === this.selectedNode);
      this.updateLabelPosition(nodeId);
    }
  }

  updateMouse(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  updateConnectedEdges(node) {
    const nodeId = Object.keys(this.nodeMeshes).find(key => this.nodeMeshes[key] === node);
    
    this.edgeConnections.forEach((edge, index) => {
      if (edge.from === nodeId || edge.to === nodeId) {
        const line = this.edgeLines[index];
        const fromMesh = this.nodeMeshes[edge.from];
        const toMesh = this.nodeMeshes[edge.to];
        
        if (fromMesh && toMesh && line) {
          const positions = line.geometry.attributes.position;
          positions.setXYZ(0, fromMesh.position.x, fromMesh.position.y, fromMesh.position.z);
          positions.setXYZ(1, toMesh.position.x, toMesh.position.y, toMesh.position.z);
          positions.needsUpdate = true;
        }
      }
    });
  }

  updateLabelPosition(nodeId) {
    // Find and update sprite label position
    const node = this.nodeMeshes[nodeId];
    if (!node) return;
    
    this.group.children.forEach(child => {
      if (child instanceof THREE.Sprite && 
          Math.abs(child.position.x - node.position.x) < 0.1 &&
          Math.abs(child.position.z - node.position.z) < 0.1) {
        child.position.x = node.position.x;
        child.position.z = node.position.z;
      }
    });
  }

  /** Remove all existing graph objects from the scene. */
  clearGraph() {
    this.nodeMeshes = {};
    this.edgeLines = [];

    // Remove everything under this.group, disposing geometries/materials
    while (this.group.children.length) {
      const obj = this.group.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
      this.group.remove(obj);
    }
  }

  /**
   * Load a new graph into the scene.
   * @param {{ nodes: Array, edges: Array }} graphData
   */
  loadGraph(graphData) {
    this.clearGraph();
    this.edgeConnections = []; // Reset connections

    // Auto-layout nodes if positions not provided
    const processedNodes = this._processNodes(graphData.nodes);

    // 1) Create all node meshes
    processedNodes.forEach(node => this._createNode(node));

    // 2) Then create edges so all node meshes exist
    graphData.edges.forEach(edge => {
      this._createEdge(edge);
      this.edgeConnections.push(edge); // Store connection info
    });
  }

  /**
   * Process nodes to add positions if missing
   */
  _processNodes(nodes) {
    return nodes.map((node, index) => {
      // If node already has position, use it
      if (node.x !== undefined && node.z !== undefined) {
        return node;
      }

      // Force-directed layout simulation
      const positions = this._calculateForceLayout(nodes, index);
      
      return {
        ...node,
        x: positions.x,
        y: node.y ?? 0,
        z: positions.z,
        width: node.width ?? 2,
        height: node.height ?? 2,
        depth: node.depth ?? 2
      };
    });
  }

  _calculateForceLayout(nodes, currentIndex) {
    // Grid layout as fallback (3x3 grid)
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const row = Math.floor(currentIndex / cols);
    const col = currentIndex % cols;
    const spacing = 4;
    
    return {
      x: (col - cols/2) * spacing,
      z: (row - cols/2) * spacing
    };
  }

  /**
   * @param {{ id, x, y, z, width?, depth?, height?, massingType?, label? }} node
   */
  _createNode(node) {
    const w = node.width  ?? 2;
    const d = node.depth  ?? 2;
    const h = node.height ?? 2;
    let geometry;

    if (node.massingType === 'cylinder') {
      geometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 16);
    } else {
      geometry = new THREE.BoxGeometry(w, h, d);
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(Math.random(), Math.random(), Math.random()),
      roughness: 0.5,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(
      node.x ?? 0,
      (node.y ?? 0) + h / 2,
      node.z ?? 0
    );

    this.group.add(mesh);
    this.nodeMeshes[node.id] = mesh;

    // Add text label
    if (node.label) {
      this._createTextLabel(node.label, mesh.position.x, mesh.position.y + h/2 + 0.5, mesh.position.z);
    }
  }

  /**
   * Create a text sprite label
   */
  _createTextLabel(text, x, y, z) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    
    // Draw background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw border
    context.strokeStyle = 'white';
    context.lineWidth = 3;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    
    // Draw text
    context.font = 'bold 60px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      sizeAttenuation: true
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(x, y + 2, z);
    sprite.scale.set(4, 1, 1);
    
    this.group.add(sprite);
    
    console.log(`Label created for ${text} at position:`, x, y + 2, z);
  }

  /**
   * @param {{ from: string, to: string }} edge
   */
  _createEdge(edge) {
    const a = this.nodeMeshes[edge.from];
    const b = this.nodeMeshes[edge.to];
    if (!a || !b) return;

    const points = [a.position.clone(), b.position.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(geometry, material);

    this.group.add(line);
    this.edgeLines.push(line);
  }
}
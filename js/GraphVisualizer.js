// GraphVisualizer.js - Simple graph creation only
export class GraphVisualizer {
    constructor(scene) {
      this.scene = scene;
      this.group = new THREE.Group();
      this.scene.add(this.group);
      this.nodes = {};
      this.edges = [];
    }
  
    clearGraph() {
      this.group.children.forEach(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this.group.clear();
      this.nodes = {};
      this.edges = [];
    }
  
    loadGraph(graphData) {
      this.clearGraph();
      
      // Create nodes
      graphData.nodes.forEach((node, i) => {
        const mesh = this.createNode(node, i);
        this.nodes[node.id] = mesh;
      });
      
      // Create edges
      graphData.edges.forEach(edge => {
        const line = this.createEdge(edge);
        if (line) this.edges.push({ line, ...edge });
      });
    }
  
    createNode(node, index) {
      // Auto-position if not provided
      const position = this.getNodePosition(node, index);
      
      // Create geometry
      const geometry = node.massingType === 'cylinder' 
        ? new THREE.CylinderGeometry(1, 1, 2, 16)
        : new THREE.BoxGeometry(2, 2, 2);
      
      // Create mesh
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(Math.random(), Math.random(), Math.random()),
        roughness: 0.5,
        metalness: 0.1
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position.x, position.y, position.z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { id: node.id, type: 'node', data: node };
      
      this.group.add(mesh);
      
      // Add label
      if (node.label) {
        const label = this.createLabel(node.label, mesh.position);
        this.group.add(label);
      }
      
      return mesh;
    }
  
    createEdge(edge) {
      const fromNode = this.nodes[edge.source || edge.from];
      const toNode = this.nodes[edge.target || edge.to];
      
      if (!fromNode || !toNode) return null;
      
      const geometry = new THREE.BufferGeometry().setFromPoints([
        fromNode.position,
        toNode.position
      ]);
      
      const material = new THREE.LineBasicMaterial({ 
        color: 0xffffff,
        opacity: 0.6,
        transparent: true
      });
      
      const line = new THREE.Line(geometry, material);
      line.userData = { type: 'edge', source: edge.source, target: edge.target };
      
      this.group.add(line);
      return line;
    }
  
    createLabel(text, position) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.font = 'bold 30px Arial';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width/2, canvas.height/2);
      
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture })
      );
      
      sprite.position.set(position.x, position.y + 2, position.z);
      sprite.scale.set(2, 0.5, 1);
      sprite.userData = { type: 'label' };
      
      return sprite;
    }
  
    getNodePosition(node, index) {
      // Use provided position or auto-layout
      if (node.x !== undefined && node.z !== undefined) {
        return { x: node.x, y: node.y || 0, z: node.z };
      }
      
      // Grid layout
      const cols = Math.ceil(Math.sqrt(this.nodes.length + 1));
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      return {
        x: (col - cols/2) * 4,
        y: 0,
        z: (row - cols/2) * 4
      };
    }
  
    updateEdge(edgeIndex) {
      const edge = this.edges[edgeIndex];
      if (!edge) return;
      
      const fromNode = this.nodes[edge.source || edge.from];
      const toNode = this.nodes[edge.target || edge.to];
      
      if (fromNode && toNode) {
        const positions = edge.line.geometry.attributes.position;
        positions.setXYZ(0, fromNode.position.x, fromNode.position.y, fromNode.position.z);
        positions.setXYZ(1, toNode.position.x, toNode.position.y, toNode.position.z);
        positions.needsUpdate = true;
      }
    }
  }
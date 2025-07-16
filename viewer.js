// viewer.js - Simple Three.js viewer with debugging
import { GraphVisualizer } from "./GraphVisualizer.js";

class Viewer3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        if (!this.container) {
            console.error('Container not found:', containerId);
            return;
        }
        
        console.log('Initializing 3D viewer...');
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.cube = null;
        
        this.init();
        this.animate();
    }

    init() {
        try {
            // Scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x2a2a2a); // Dark gray background
            
            // Camera
            const aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
            this.camera.position.set(15, 15, 15);
            this.camera.lookAt(0, 0, 0);
            
            // Renderer
            this.renderer = new THREE.WebGLRenderer({ 
                antialias: true,
                powerPreference: "high-performance"
            });
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.container.appendChild(this.renderer.domElement);
            
            // Controls
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            
            this.setupLights();
            // this.createCube();
            this.createGround();
            // this.createCube();

            

            // Inside Viewer3D.init():
            this.graphViz = new GraphVisualizer(this.scene, this.camera, this.renderer);
            
            // Handle resize
            window.addEventListener('resize', () => this.onResize());
            
            console.log('3D viewer initialized successfully');
        } catch (error) {
            console.error('Error initializing 3D viewer:', error);
        }
    }
    
    setupLights() {
        // Ambient light - brighter for dark scene
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        // Key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 1);
        keyLight.position.set(5, 10, 5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 20;
        keyLight.shadow.camera.left = -10;
        keyLight.shadow.camera.right = 10;
        keyLight.shadow.camera.top = 10;
        keyLight.shadow.camera.bottom = -10;
        this.scene.add(keyLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        fillLight.position.set(-5, 5, -5);
        this.scene.add(fillLight);
        
        console.log('Lights added');
    }
    
    createCube() {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({
            color: 0x5e72e4, // Blue matching the UI
            roughness: 0.2,
            metalness: 0.1
        });
        
        this.cube = new THREE.Mesh(geometry, material);
        this.cube.castShadow = true;
        this.cube.receiveShadow = true;
        this.cube.position.y = 1;
        this.scene.add(this.cube);
        
        console.log('Cube created at position:', this.cube.position);
    }
    
    createGround() {
        const geometry = new THREE.PlaneGeometry(20, 20);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.2
        });
        
        const ground = new THREE.Mesh(geometry, material);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        console.log('Ground created');
    }
    
    onResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (!this.renderer || !this.scene || !this.camera) return;
        
        if (this.controls) {
            this.controls.update();
        }
        
        // Subtle rotation
        if (this.cube) {
            this.cube.rotation.y += 0.005;
            this.cube.rotation.x += 0.001;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

Viewer3D.prototype.loadGraph = function(graphData) {
  if (!this.graphViz) {
    console.error("GraphVisualizer not initialized");
    return;
  }
  this.graphViz.loadGraph(graphData);
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing viewer...');
    
    const placeholder = document.querySelector('.viewer-placeholder');
    if (placeholder) {
        placeholder.remove();
        console.log('Placeholder removed');
    }
    
    // Check if Three.js is loaded
    if (typeof THREE === 'undefined') {
        console.error('Three.js not loaded!');
        return;
    }
    
    if (typeof THREE.OrbitControls === 'undefined') {
        console.error('OrbitControls not loaded!');
        return;
    }
    
    window.viewer3D = new Viewer3D('threejs-container');
});
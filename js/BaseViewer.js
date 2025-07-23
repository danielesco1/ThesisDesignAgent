// BaseViewer.js - Core viewer functionality
export class BaseViewer {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            gridSize: 50,
            gridDivisions: 50,
            backgroundColor: 0x2a2a2a,
            ...options
        };
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.init();
    }
    
    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.options.backgroundColor);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Grid
        this.gridStep = this.options.gridSize / this.options.gridDivisions;
        const grid = new THREE.GridHelper(
            this.options.gridSize, 
            this.options.gridDivisions, 
            0x444444, 
            0x222222
        );
        this.scene.add(grid);
        
        // Lights
        this.setupLights();
        
        // Camera and controls - implemented by subclasses
        this.setupCamera();
        this.setupControls();
        
        // Events
        window.addEventListener('resize', () => this.onResize());
        this.renderer.domElement.addEventListener('mousemove', (e) => this.updateMouse(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
        
        // Start animation loop
        this.animate();
    }
    
    setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        const directional = new THREE.DirectionalLight(0xffffff, 1);
        directional.position.set(5, 10, 5);
        directional.castShadow = true;
        this.scene.add(directional);
    }
    
    // Override in subclasses
    setupCamera() {
        throw new Error('setupCamera must be implemented by subclass');
    }
    
    setupControls() {
        throw new Error('setupControls must be implemented by subclass');
    }
    
    updateMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.onMouseMove(event);
    }
    
    // Override for custom behavior
    onClick(event) {}
    onMouseMove(event) {}
    
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        this.render();
    }
    
    snapToGrid(point) {
        return new THREE.Vector3(
            Math.round(point.x / this.gridStep) * this.gridStep,
            point.y,
            Math.round(point.z / this.gridStep) * this.gridStep
        );
    }
    
    getGroundIntersection() {
        // Create infinite ground plane at y=0
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.raycaster.ray.intersectPlane(plane, intersection);
        return intersection;
    }
}
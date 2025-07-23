// viewer.js - Fixed viewer with properly synced transform controls
import { GraphVisualizer } from "./GraphVisualizer.js";

class Viewer3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.selectedObject = null;
        this.init();
        this.animate();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a2a2a);
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Transform Controls
        this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.size = 1;
        this.transformControls.setMode('translate'); // Set default mode
        
        // Update object matrix when transform controls change
        this.transformControls.addEventListener('change', () => {
            if (this.selectedObject) {
                this.selectedObject.updateMatrixWorld(true);
            }
        });
        
        // Disable orbit controls when using transform controls
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
            // Disable damping during transform to prevent interference
            if (event.value) {
                this.controls.enableDamping = false;
            } else {
                this.controls.enableDamping = true;
            }
        });
        
        // Add transform controls AFTER setting up event listeners
        this.scene.add(this.transformControls);
        
        // Grid
        const grid = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
        this.scene.add(grid);
        
        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        const directional = new THREE.DirectionalLight(0xffffff, 1);
        directional.position.set(5, 10, 5);
        directional.castShadow = true;
        this.scene.add(directional);
        
        // Ground
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(50, 50),
            new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.userData.selectable = false;
        this.scene.add(ground);
        
        // Test objects
        const colors = [0x5e72e4, 0xe74c3c, 0x2ecc71];
        for (let i = 0; i < 3; i++) {
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(2, 2, 2),
                new THREE.MeshStandardMaterial({ color: colors[i] })
            );
            cube.position.set((i - 1) * 4, 1, 0);
            cube.castShadow = true;
            cube.receiveShadow = true;
            this.scene.add(cube);
        }
        
        // Selection
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.renderer.domElement.addEventListener('click', (e) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true)
                .filter(i => i.object.type === 'Mesh' && i.object.userData.selectable !== false);
            
            if (intersects.length > 0) {
                this.selectObject(intersects[0].object);
            } else {
                this.deselectObject();
            }
        });
        
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (!this.selectedObject) return;
            
            switch(e.key.toLowerCase()) {
                case 'w': 
                    this.transformControls.setMode('translate'); 
                    break;
                case 'e': 
                    this.transformControls.setMode('rotate'); 
                    break;
                case 'r': 
                    this.transformControls.setMode('scale'); 
                    break;
                case 'escape': 
                    this.deselectObject();
                    break;
                case 'delete':
                    if (this.selectedObject) {
                        this.scene.remove(this.selectedObject);
                        this.deselectObject();
                    }
                    break;
            }
        });
        
        // Graph visualizer
        this.graphViz = new GraphVisualizer(this.scene);
        
        window.addEventListener('resize', () => this.onResize());
    }
    
    selectObject(object) {
        this.selectedObject = object;
        this.transformControls.attach(object);
    }
    
    deselectObject() {
        this.selectedObject = null;
        this.transformControls.detach();
    }
    
    loadGraph(graphData) {
        this.graphViz?.loadGraph(graphData);
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update orbit controls first
        this.controls.update();
        
        // Update transform controls (this updates the attached object internally)
        this.transformControls.update();
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize
window.viewer3D = new Viewer3D('threejs-container');
// SimpleViewer.js - Toggle between 3D and Top view
export class SimpleViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container ${containerId} not found`);
        
        this.currentView = '3d'; // '3d' or 'top'
        
        this.init();
        this.animate();
    }
    
    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a2a2a);
        
        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        const directional = new THREE.DirectionalLight(0xffffff, 1);
        directional.position.set(5, 10, 5);
        directional.castShadow = true;
        this.scene.add(directional);
        
        // Grid
        const grid = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
        this.scene.add(grid);
        
        // Ground
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(50, 50),
            new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Test cubes
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
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        
        // Set initial view after controls are created
        this.set3DView();
        
        // Transform controls
        this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.scene.add(this.transformControls);
        
        // UI
        this.setupUI();
        
        // Events
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }
    
    setupUI() {
        const button = document.createElement('button');
        button.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            background: #5e72e4;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            z-index: 1000;
        `;
        button.textContent = 'Switch to Top View';
        button.addEventListener('click', () => this.toggleView());
        document.body.appendChild(button);
        this.viewButton = button;
    }
    
    toggleView() {
        if (this.currentView === '3d') {
            this.setTopView();
            this.viewButton.textContent = 'Switch to 3D View';
        } else {
            this.set3DView();
            this.viewButton.textContent = 'Switch to Top View';
        }
    }
    
    set3DView() {
        this.currentView = '3d';
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);
        this.controls.enableRotate = true;
    }
    
    setTopView() {
        this.currentView = 'top';
        this.camera.position.set(0, 30, 0);
        this.camera.lookAt(0, 0, 0);
        this.controls.enableRotate = false;
    }
    
    onClick(event) {
        // Skip if any external tool is active
        if (this._toolActive) return;
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true)
            .filter(i => i.object.type === 'Mesh' && i.object !== this.scene.children[3]); // Exclude ground
        
        if (intersects.length > 0) {
            this.transformControls.attach(intersects[0].object);
        } else {
            this.transformControls.detach();
        }
    }
    
    onKeyDown(event) {
        if (!this.transformControls.object) return;
        
        switch(event.key.toLowerCase()) {
            case 'w': this.transformControls.setMode('translate'); break;
            case 'e': this.transformControls.setMode('rotate'); break;
            case 'r': this.transformControls.setMode('scale'); break;
            case 'escape': this.transformControls.detach(); break;
            case 'delete':
                this.scene.remove(this.transformControls.object);
                this.transformControls.detach();
                break;
        }
    }
    
    onResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
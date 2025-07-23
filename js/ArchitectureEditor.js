// ArchitectureEditor.js - Tools for 3D architecture design
export class ArchitectureEditor {
    constructor(viewer) {
        this.viewer = viewer;
        this.scene = viewer.scene;
        this.camera = viewer.camera;
        this.renderer = viewer.renderer;
        
        // Tools
        this.currentTool = 'select';
        this.snapEnabled = true;
        this.gridSize = 0.5;
        
        this.init();
    }
    
    init() {
        // Transform controls for object manipulation
        this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', (e) => {
            this.viewer.controls.enabled = !e.value;
        });
        this.scene.add(this.transformControls);
        
        // Multiple object selection
        this.selectionBox = new THREE.SelectionBox(this.camera, this.scene);
        this.helper = new THREE.SelectionHelper(this.selectionBox, this.renderer, 'selectBox');
        
        // Measurement tool
        this.measurementLines = [];
        
        // Setup events
        this.setupEvents();
        
        // Add construction helpers
        this.addHelpers();
    }
    
    setupEvents() {
        const canvas = this.renderer.domElement;
        
        // Selection
        canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
        canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
        
        // Keyboard shortcuts
        window.addEventListener('keydown', this.onKeyDown.bind(this));
    }
    
    onKeyDown(event) {
        if (event.ctrlKey || event.metaKey) {
            switch(event.key) {
                case 'c': this.copy(); break;
                case 'v': this.paste(); break;
                case 'd': this.duplicate(); break;
                case 'z': this.undo(); break;
                case 'g': this.group(); break;
            }
        } else {
            switch(event.key) {
                case 'q': this.setTool('select'); break;
                case 'w': this.transformControls.setMode('translate'); break;
                case 'e': this.transformControls.setMode('rotate'); break;
                case 'r': this.transformControls.setMode('scale'); break;
                case 'm': this.setTool('measure'); break;
                case 'Delete': this.deleteSelected(); break;
                case 'g': this.toggleGrid(); break;
                case 's': this.toggleSnap(); break;
            }
        }
    }
    
    // Architecture-specific tools
    createWall(start, end, height = 3, thickness = 0.2) {
        const length = start.distanceTo(end);
        const geometry = new THREE.BoxGeometry(length, height, thickness);
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        
        const wall = new THREE.Mesh(geometry, material);
        wall.position.copy(start).add(end).multiplyScalar(0.5);
        wall.position.y = height / 2;
        
        // Rotate to align with direction
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        wall.lookAt(wall.position.clone().add(direction));
        
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData = { type: 'wall', editable: true };
        
        return wall;
    }
    
    createFloor(width, depth) {
        const geometry = new THREE.BoxGeometry(width, 0.2, depth);
        const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
        
        const floor = new THREE.Mesh(geometry, material);
        floor.position.y = -0.1;
        floor.receiveShadow = true;
        floor.userData = { type: 'floor', editable: true };
        
        return floor;
    }
    
    createDoor(width = 1, height = 2.1) {
        const frame = new THREE.Group();
        
        // Door frame
        const frameGeo = new THREE.BoxGeometry(width, height, 0.1);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
        const doorFrame = new THREE.Mesh(frameGeo, frameMat);
        
        // Door panel
        const doorGeo = new THREE.BoxGeometry(width - 0.1, height - 0.1, 0.05);
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.z = 0.05;
        
        frame.add(doorFrame, door);
        frame.position.y = height / 2;
        frame.userData = { type: 'door', editable: true };
        
        return frame;
    }
    
    createWindow(width = 1.5, height = 1.2) {
        const window = new THREE.Group();
        
        // Window frame
        const frameGeo = new THREE.BoxGeometry(width, height, 0.1);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        
        // Glass
        const glassGeo = new THREE.BoxGeometry(width - 0.1, height - 0.1, 0.02);
        const glassMat = new THREE.MeshStandardMaterial({ 
            color: 0x88ccff,
            transparent: true,
            opacity: 0.3
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        
        window.add(frame, glass);
        window.position.y = 1.5; // Standard window height
        window.userData = { type: 'window', editable: true };
        
        return window;
    }
    
    // Measurement tool
    measure(point1, point2) {
        const distance = point1.distanceTo(point2);
        
        // Create measurement line
        const geometry = new THREE.BufferGeometry().setFromPoints([point1, point2]);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const line = new THREE.Line(geometry, material);
        
        // Add text label
        const midPoint = point1.clone().add(point2).multiplyScalar(0.5);
        const label = this.createTextSprite(`${distance.toFixed(2)}m`, midPoint);
        
        const measurement = new THREE.Group();
        measurement.add(line, label);
        measurement.userData = { type: 'measurement', distance };
        
        this.measurementLines.push(measurement);
        this.scene.add(measurement);
        
        return distance;
    }
    
    createTextSprite(text, position) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'black';
        context.font = '24px Arial';
        context.textAlign = 'center';
        context.fillText(text, canvas.width/2, canvas.height/2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: texture })
        );
        
        sprite.position.copy(position);
        sprite.scale.set(2, 0.5, 1);
        
        return sprite;
    }
    
    // Grid snapping
    snapToGrid(position) {
        if (!this.snapEnabled) return position;
        
        position.x = Math.round(position.x / this.gridSize) * this.gridSize;
        position.z = Math.round(position.z / this.gridSize) * this.gridSize;
        
        return position;
    }
    
    // Helpers
    addHelpers() {
        // Grid
        this.grid = new THREE.GridHelper(50, 100, 0x444444, 0x222222);
        this.scene.add(this.grid);
        
        // Axes
        this.axes = new THREE.AxesHelper(5);
        this.scene.add(this.axes);
        
        // Lights helper (optional)
        // this.scene.traverse(obj => {
        //     if (obj instanceof THREE.Light) {
        //         const helper = new THREE.DirectionalLightHelper(obj, 2);
        //         this.scene.add(helper);
        //     }
        // });
    }
    
    toggleGrid() {
        this.grid.visible = !this.grid.visible;
    }
    
    toggleSnap() {
        this.snapEnabled = !this.snapEnabled;
    }
}
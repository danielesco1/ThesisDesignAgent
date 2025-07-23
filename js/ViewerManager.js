// ViewerManager.js - Manages multiple viewers and editing tools
import { PerspectiveViewer, TopViewer, SideViewer } from './ViewTypes.js';
import { EditingTools } from './EditingTools.js';

export class ViewerManager {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container ${containerId} not found`);
        }
        
        this.options = {
            layout: 'single', // 'single', 'split', 'quad'
            enableEditing: true,
            ...options
        };
        
        this.viewers = {};
        this.editingTools = {};
        this.activeViewer = null;
        this.sharedObjects = [];
        
        this.setupLayout();
        this.setupUI();
        
        // Start animation loop
        this.animate();
    }
    
    setupLayout() {
        // Clear container
        this.container.innerHTML = '';
        this.container.style.position = 'relative';
        
        switch (this.options.layout) {
            case 'single':
                this.setupSingleView();
                break;
            case 'split':
                this.setupSplitView();
                break;
            case 'quad':
                this.setupQuadView();
                break;
        }
    }
    
    setupSingleView() {
        const viewContainer = this.createViewContainer('main', {
            width: '100%',
            height: '100%'
        });
        
        this.viewers.main = new PerspectiveViewer(viewContainer);
        this.activeViewer = this.viewers.main;
        
        if (this.options.enableEditing) {
            this.editingTools.main = new EditingTools(this.viewers.main);
        }
        
        this.addDefaultObjects();
    }
    
    setupSplitView() {
        // Top view
        const topContainer = this.createViewContainer('top', {
            width: '50%',
            height: '100%',
            left: '0'
        });
        this.viewers.top = new TopViewer(topContainer);
        
        // Perspective view
        const perspContainer = this.createViewContainer('perspective', {
            width: '50%',
            height: '100%',
            left: '50%'
        });
        this.viewers.perspective = new PerspectiveViewer(perspContainer);
        
        // Setup editing tools for both
        if (this.options.enableEditing) {
            this.editingTools.top = new EditingTools(this.viewers.top);
            this.editingTools.perspective = new EditingTools(this.viewers.perspective);
        }
        
        this.activeViewer = this.viewers.perspective;
        this.syncScenes();
        this.addDefaultObjects();
    }
    
    addDefaultObjects() {
        // Add ground plane to all viewers
        Object.values(this.viewers).forEach(viewer => {
            const ground = new THREE.Mesh(
                new THREE.PlaneGeometry(viewer.options.gridSize, viewer.options.gridSize),
                new THREE.MeshStandardMaterial({ 
                    color: 0x333333,
                    transparent: true,
                    opacity: 0.8
                })
            );
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            ground.userData.selectable = false;
            viewer.scene.add(ground);
        });
        
        // Add test cubes as shared objects
        const colors = [0x5e72e4, 0xe74c3c, 0x2ecc71];
        for (let i = 0; i < 3; i++) {
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(2, 2, 2),
                new THREE.MeshStandardMaterial({ color: colors[i] })
            );
            cube.position.set((i - 1) * 4, 1, 0);
            cube.castShadow = true;
            cube.receiveShadow = true;
            this.addSharedObject(cube);
        }
    }
    
    setupQuadView() {
        // Top-left: Perspective
        const perspContainer = this.createViewContainer('perspective', {
            width: '50%',
            height: '50%',
            left: '0',
            top: '0'
        });
        this.viewers.perspective = new PerspectiveViewer(perspContainer);
        
        // Top-right: Top view
        const topContainer = this.createViewContainer('top', {
            width: '50%',
            height: '50%',
            left: '50%',
            top: '0'
        });
        this.viewers.top = new TopViewer(topContainer);
        
        // Bottom-left: Side X
        const sideXContainer = this.createViewContainer('sideX', {
            width: '50%',
            height: '50%',
            left: '0',
            top: '50%'
        });
        this.viewers.sideX = new SideViewer(sideXContainer, { axis: 'x' });
        
        // Bottom-right: Side Z
        const sideZContainer = this.createViewContainer('sideZ', {
            width: '50%',
            height: '50%',
            left: '50%',
            top: '50%'
        });
        this.viewers.sideZ = new SideViewer(sideZContainer, { axis: 'z' });
        
        // Setup editing tools for all views
        if (this.options.enableEditing) {
            Object.keys(this.viewers).forEach(key => {
                this.editingTools[key] = new EditingTools(this.viewers[key]);
            });
        }
        
        this.activeViewer = this.viewers.perspective;
        this.syncScenes();
        this.addDefaultObjects();
    }
    
    createViewContainer(id, styles) {
        const container = document.createElement('div');
        container.id = `view-${id}`;
        container.style.cssText = `
            position: absolute;
            ${Object.entries(styles).map(([k, v]) => `${k}: ${v}`).join('; ')}
        `;
        
        // Add label
        const label = document.createElement('div');
        label.style.cssText = `
            position: absolute;
            top: 5px;
            left: 5px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 3px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            z-index: 100;
        `;
        label.textContent = id.charAt(0).toUpperCase() + id.slice(1);
        container.appendChild(label);
        
        this.container.appendChild(container);
        
        // Track active viewer on click
        container.addEventListener('click', () => {
            this.setActiveViewer(id);
        });
        
        return container;
    }
    
    setActiveViewer(viewerId) {
        this.activeViewer = this.viewers[viewerId];
        
        // Update visual indicator
        document.querySelectorAll('[id^="view-"]').forEach(el => {
            el.style.border = '';
        });
        document.getElementById(`view-${viewerId}`).style.border = '2px solid #5e72e4';
    }
    
    setupUI() {
        const ui = document.createElement('div');
        ui.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            padding: 15px;
            border-radius: 5px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 1000;
        `;
        
        ui.innerHTML = `
            <div style="margin-bottom: 10px;">
                <h3 style="margin: 0 0 10px 0;">Layout</h3>
                <button class="layout-btn" data-layout="single">Single</button>
                <button class="layout-btn" data-layout="split">Split</button>
                <button class="layout-btn" data-layout="quad">Quad</button>
            </div>
            ${this.options.enableEditing ? `
            <div style="margin-bottom: 10px;">
                <h3 style="margin: 0 0 10px 0;">Mode</h3>
                <button class="mode-btn" data-mode="select">Select</button>
                <button class="mode-btn" data-mode="draw">Draw</button>
                <button class="mode-btn" data-mode="measure">Measure</button>
            </div>
            <div style="margin-bottom: 10px;">
                <h3 style="margin: 0 0 10px 0;">Tools</h3>
                <button class="tool-btn" id="addCube">Add Cube</button>
                <button class="tool-btn" id="addSphere">Add Sphere</button>
                <button class="tool-btn" id="addRect">Add Rectangle</button>
                <button class="tool-btn" id="addCircle">Add Circle</button>
            </div>
            <div>
                <button id="clearAll" style="background: #e74c3c; width: 100%;">Clear All</button>
            </div>
            ` : ''}
            <style>
                .layout-btn, .mode-btn, .tool-btn {
                    background: #444;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    margin: 2px;
                    cursor: pointer;
                    border-radius: 3px;
                }
                .layout-btn:hover, .mode-btn:hover, .tool-btn:hover {
                    background: #555;
                }
                .layout-btn.active, .mode-btn.active {
                    background: #5e72e4;
                }
            </style>
        `;
        
        document.body.appendChild(ui);
        
        // Layout buttons
        ui.querySelectorAll('.layout-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.options.layout = btn.dataset.layout;
                this.setupLayout();
                this.syncSharedObjects();
                ui.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Set active layout button
        ui.querySelector(`[data-layout="${this.options.layout}"]`).classList.add('active');
        
        if (this.options.enableEditing) {
            // Mode buttons
            ui.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setMode(btn.dataset.mode);
                    ui.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
            
            // Tool buttons
            document.getElementById('addCube').addEventListener('click', () => this.addCube());
            document.getElementById('addSphere').addEventListener('click', () => this.addSphere());
            document.getElementById('addRect').addEventListener('click', () => this.addRectangle());
            document.getElementById('addCircle').addEventListener('click', () => this.addCircle());
            document.getElementById('clearAll').addEventListener('click', () => this.clearAll());
            
            // Set default mode
            ui.querySelector('[data-mode="select"]').classList.add('active');
        }
        
        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (this.options.enableEditing && this.activeViewer) {
                const tools = this.editingTools[this.getViewerId(this.activeViewer)];
                if (!tools) return;
                
                switch(e.key.toLowerCase()) {
                    case 's': this.setMode('select'); break;
                    case 'd': this.setMode('draw'); break;
                    case 'm': this.setMode('measure'); break;
                    case 'w':
                        if (tools.mode === 'select') tools.setTransformMode('translate');
                        break;
                    case 'e':
                        if (tools.mode === 'select') tools.setTransformMode('rotate');
                        break;
                    case 'r':
                        if (tools.mode === 'select') tools.setTransformMode('scale');
                        break;
                }
            }
        });
    }
    
    getViewerId(viewer) {
        return Object.keys(this.viewers).find(key => this.viewers[key] === viewer);
    }
    
    setMode(mode) {
        Object.values(this.editingTools).forEach(tools => {
            tools.setMode(mode);
        });
    }
    
    // Sync scenes for multi-view layouts
    syncScenes() {
        if (Object.keys(this.viewers).length <= 1) return;
        
        // Setup event forwarding
        Object.values(this.viewers).forEach(viewer => {
            viewer.onClick = (event) => this.handleClick(viewer, event);
            viewer.onMouseMove = (event) => this.handleMouseMove(viewer, event);
        });
    }
    
    handleClick(viewer, event) {
        const viewerId = this.getViewerId(viewer);
        const tools = this.editingTools[viewerId];
        if (!tools) return;
        
        if (tools.mode === 'select') {
            viewer.raycaster.setFromCamera(viewer.mouse, viewer.camera);
            const intersects = viewer.raycaster.intersectObjects(viewer.scene.children, true);
            tools.handleSelection(intersects);
        } else if (tools.mode === 'draw') {
            const point = viewer.getGroundIntersection();
            if (point) {
                tools.startDrawingPoint(point);
            }
        } else if (tools.mode === 'measure') {
            const point = viewer.getGroundIntersection();
            if (point) {
                tools.startMeasurement(point);
            }
        }
    }
    
    handleMouseMove(viewer, event) {
        const viewerId = this.getViewerId(viewer);
        const tools = this.editingTools[viewerId];
        if (!tools || tools.mode !== 'draw') return;
        
        const point = viewer.getGroundIntersection();
        if (point) {
            tools.updateTempLine(point);
        }
    }
    
    // Object creation
    addCube() {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ 
            color: Math.random() * 0xffffff 
        });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.y = 1;
        cube.castShadow = true;
        cube.receiveShadow = true;
        
        this.addSharedObject(cube);
    }
    
    addSphere() {
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const material = new THREE.MeshStandardMaterial({ 
            color: Math.random() * 0xffffff 
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.y = 1;
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        
        this.addSharedObject(sphere);
    }
    
    addRectangle() {
        if (this.activeViewer) {
            const viewerId = this.getViewerId(this.activeViewer);
            const tools = this.editingTools[viewerId];
            if (tools) {
                const rect = tools.createRectangle();
                this.sharedObjects.push(rect);
                this.syncSharedObjects();
            }
        }
    }
    
    addCircle() {
        if (this.activeViewer) {
            const viewerId = this.getViewerId(this.activeViewer);
            const tools = this.editingTools[viewerId];
            if (tools) {
                const circle = tools.createCircle();
                this.sharedObjects.push(circle);
                this.syncSharedObjects();
            }
        }
    }
    
    addSharedObject(object) {
        this.sharedObjects.push(object);
        Object.values(this.viewers).forEach(viewer => {
            const clone = object.clone();
            viewer.scene.add(clone);
        });
    }
    
    syncSharedObjects() {
        // Re-add all shared objects to all viewers
        Object.values(this.viewers).forEach(viewer => {
            this.sharedObjects.forEach(obj => {
                const clone = obj.clone();
                viewer.scene.add(clone);
            });
        });
    }
    
    clearAll() {
        Object.values(this.editingTools).forEach(tools => {
            tools.clearAll();
        });
        this.sharedObjects = [];
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Only update editing tools, viewers handle their own rendering
        Object.keys(this.editingTools).forEach(key => {
            if (this.editingTools[key]) {
                this.editingTools[key].update();
            }
        });
    }
}
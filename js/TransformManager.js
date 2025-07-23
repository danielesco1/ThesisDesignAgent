// TransformManager.js - Professional transform controls for architecture
export class TransformManager {
    constructor(viewer) {
        this.viewer = viewer;
        this.scene = viewer.scene;
        this.camera = viewer.camera;
        this.renderer = viewer.renderer;
        this.controls = viewer.controls;
        
        // State
        this.selectedObjects = [];
        this.transformMode = 'translate';
        this.space = 'world'; // 'world' or 'local'
        this.snapEnabled = true;
        this.gridSnap = 0.5; // meters
        this.rotationSnap = 15; // degrees
        
        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        // Tools
        this.transformControls = null;
        this.selectionBox = null;
        this.outlinePass = null;
        
        this.init();
    }
    
    init() {
        // Transform Controls
        this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.setSpace(this.space);
        this.transformControls.setTranslationSnap(this.gridSnap);
        this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(this.rotationSnap));
        
        this.transformControls.addEventListener('change', () => {
            this.viewer.render();
        });
        
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
            if (!event.value) {
                this.saveToHistory();
            }
        });
        
        this.transformControls.addEventListener('objectChange', () => {
            this.updateGizmoSize();
        });
        
        this.scene.add(this.transformControls);
        
        // Selection tools
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Multi-selection box
        this.selectionBox = new THREE.SelectionBox(this.camera, this.scene);
        this.helper = new THREE.SelectionHelper(this.renderer, 'selectBox');
        
        // Outline effect for selected objects
        this.setupOutlinePass();
        
        // Events
        this.setupEvents();
    }
    
    setupOutlinePass() {
        // Create outline pass for selected objects visualization
        if (typeof THREE.OutlinePass !== 'undefined') {
            const size = new THREE.Vector2();
            this.renderer.getSize(size);
            
            this.composer = new THREE.EffectComposer(this.renderer);
            this.renderPass = new THREE.RenderPass(this.scene, this.camera);
            this.composer.addPass(this.renderPass);
            
            this.outlinePass = new THREE.OutlinePass(size, this.scene, this.camera);
            this.outlinePass.edgeStrength = 3;
            this.outlinePass.edgeGlow = 0.5;
            this.outlinePass.edgeThickness = 2;
            this.outlinePass.visibleEdgeColor.set('#ffffff');
            this.composer.addPass(this.outlinePass);
        }
    }
    
    setupEvents() {
        const canvas = this.renderer.domElement;
        
        // Mouse events
        canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
        canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
        canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
        
        // Keyboard
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
        
        // Prevent context menu
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }
    
    onPointerDown(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        if (event.button === 0) { // Left click
            if (!event.ctrlKey && !event.shiftKey) {
                // Single selection
                const object = this.getObjectAtMouse();
                if (object && object.userData.selectable !== false) {
                    this.selectObject(object);
                } else if (!this.transformControls.dragging) {
                    this.clearSelection();
                }
            } else if (event.shiftKey) {
                // Add to selection
                const object = this.getObjectAtMouse();
                if (object && object.userData.selectable !== false) {
                    this.addToSelection(object);
                }
            }
            
            // Start box selection
            if (!this.getObjectAtMouse()) {
                this.helper.onPointerDown(event);
                this.selectionBox.startPoint.set(this.mouse.x, this.mouse.y, 0.5);
            }
        }
    }
    
    onPointerMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        if (this.helper.isDown) {
            this.helper.onPointerMove(event);
            this.selectionBox.endPoint.set(this.mouse.x, this.mouse.y, 0.5);
        }
    }
    
    onPointerUp(event) {
        if (this.helper.isDown) {
            this.helper.onPointerUp();
            
            // Get objects in selection box
            const allSelected = this.selectionBox.select();
            const validSelected = allSelected.filter(obj => 
                obj.userData.selectable !== false && 
                obj.type === 'Mesh'
            );
            
            if (validSelected.length > 0) {
                this.setSelection(validSelected);
            }
        }
    }
    
    onDoubleClick(event) {
        const object = this.getObjectAtMouse();
        if (object) {
            // Focus camera on object
            this.focusOnObject(object);
        }
    }
    
    onKeyDown(event) {
        if (event.target.tagName === 'INPUT') return;
        
        const key = event.key.toLowerCase();
        const ctrl = event.ctrlKey || event.metaKey;
        
        switch(key) {
            // Transform modes
            case 'q': this.setMode('select'); break;
            case 'w': this.setMode('translate'); break;
            case 'e': this.setMode('rotate'); break;
            case 'r': this.setMode('scale'); break;
            
            // Space toggle
            case 'x': this.toggleSpace(); break;
            
            // Snapping
            case 's': 
                if (!ctrl) this.toggleSnap(); 
                break;
            
            // Selection
            case 'a':
                if (ctrl) {
                    event.preventDefault();
                    this.selectAll();
                }
                break;
            
            // Operations
            case 'delete':
            case 'backspace':
                this.deleteSelected();
                break;
            
            case 'escape':
                this.clearSelection();
                break;
            
            // History
            case 'z':
                if (ctrl) {
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                break;
            
            // Duplicate
            case 'd':
                if (ctrl) {
                    event.preventDefault();
                    this.duplicateSelected();
                }
                break;
            
            // Copy/Paste
            case 'c':
                if (ctrl) {
                    event.preventDefault();
                    this.copySelected();
                }
                break;
            
            case 'v':
                if (ctrl) {
                    event.preventDefault();
                    this.pasteObjects();
                }
                break;
            
            // Group
            case 'g':
                if (ctrl) {
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.ungroupSelected();
                    } else {
                        this.groupSelected();
                    }
                }
                break;
        }
    }
    
    onKeyUp(event) {
        // Could be used for modifier keys
    }
    
    // Selection methods
    selectObject(object) {
        this.clearSelection();
        this.selectedObjects = [object];
        this.transformControls.attach(object);
        this.updateOutline();
    }
    
    addToSelection(object) {
        if (!this.selectedObjects.includes(object)) {
            this.selectedObjects.push(object);
            this.updateSelection();
        }
    }
    
    setSelection(objects) {
        this.selectedObjects = [...objects];
        this.updateSelection();
    }
    
    clearSelection() {
        this.selectedObjects = [];
        this.transformControls.detach();
        this.updateOutline();
    }
    
    selectAll() {
        const selectables = this.scene.children.filter(obj => 
            obj.type === 'Mesh' && 
            obj.userData.selectable !== false
        );
        this.setSelection(selectables);
    }
    
    updateSelection() {
        if (this.selectedObjects.length === 1) {
            this.transformControls.attach(this.selectedObjects[0]);
        } else if (this.selectedObjects.length > 1) {
            // Create group for multi-transform
            const group = new THREE.Group();
            const center = this.getSelectionCenter();
            group.position.copy(center);
            
            this.selectedObjects.forEach(obj => {
                group.attach(obj);
            });
            
            this.scene.add(group);
            this.transformControls.attach(group);
            group.userData.isTemporaryGroup = true;
        }
        
        this.updateOutline();
    }
    
    updateOutline() {
        if (this.outlinePass) {
            this.outlinePass.selectedObjects = this.selectedObjects;
        }
    }
    
    // Transform methods
    setMode(mode) {
        this.transformMode = mode;
        if (mode === 'select') {
            this.transformControls.enabled = false;
        } else {
            this.transformControls.enabled = true;
            this.transformControls.setMode(mode);
        }
    }
    
    toggleSpace() {
        this.space = this.space === 'world' ? 'local' : 'world';
        this.transformControls.setSpace(this.space);
    }
    
    toggleSnap() {
        this.snapEnabled = !this.snapEnabled;
        this.transformControls.setTranslationSnap(this.snapEnabled ? this.gridSnap : null);
        this.transformControls.setRotationSnap(this.snapEnabled ? THREE.MathUtils.degToRad(this.rotationSnap) : null);
    }
    
    // Operations
    deleteSelected() {
        this.selectedObjects.forEach(obj => {
            if (obj.parent?.userData.isTemporaryGroup) {
                obj.parent.remove(obj);
            }
            this.scene.remove(obj);
        });
        this.clearSelection();
        this.saveToHistory();
    }
    
    duplicateSelected() {
        const clones = [];
        this.selectedObjects.forEach(obj => {
            const clone = obj.clone();
            clone.position.x += this.gridSnap * 4;
            clone.position.z += this.gridSnap * 4;
            this.scene.add(clone);
            clones.push(clone);
        });
        this.setSelection(clones);
        this.saveToHistory();
    }
    
    groupSelected() {
        if (this.selectedObjects.length < 2) return;
        
        const group = new THREE.Group();
        const center = this.getSelectionCenter();
        group.position.copy(center);
        
        this.selectedObjects.forEach(obj => {
            group.attach(obj);
        });
        
        group.userData.isGroup = true;
        this.scene.add(group);
        this.selectObject(group);
        this.saveToHistory();
    }
    
    ungroupSelected() {
        const toSelect = [];
        this.selectedObjects.forEach(obj => {
            if (obj.userData.isGroup) {
                const children = [...obj.children];
                children.forEach(child => {
                    this.scene.attach(child);
                    toSelect.push(child);
                });
                this.scene.remove(obj);
            }
        });
        if (toSelect.length > 0) {
            this.setSelection(toSelect);
        }
        this.saveToHistory();
    }
    
    // Utilities
    getObjectAtMouse() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        
        for (let intersect of intersects) {
            if (intersect.object.type === 'Mesh' && 
                intersect.object.userData.selectable !== false) {
                return intersect.object;
            }
        }
        return null;
    }
    
    getSelectionCenter() {
        const box = new THREE.Box3();
        this.selectedObjects.forEach(obj => {
            box.expandByObject(obj);
        });
        const center = new THREE.Vector3();
        box.getCenter(center);
        return center;
    }
    
    focusOnObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;
        
        const direction = new THREE.Vector3()
            .subVectors(this.camera.position, center)
            .normalize();
        
        this.camera.position.copy(center).add(direction.multiplyScalar(distance));
        this.controls.target.copy(center);
        this.controls.update();
    }
    
    updateGizmoSize() {
        // Scale gizmo based on camera distance
        const distance = this.camera.position.distanceTo(this.transformControls.object.position);
        this.transformControls.setSize(Math.min(1, distance / 10));
    }
    
    // History
    saveToHistory() {
        // Save current state
        const state = {
            objects: this.scene.children.map(obj => ({
                uuid: obj.uuid,
                position: obj.position.clone(),
                rotation: obj.rotation.clone(),
                scale: obj.scale.clone()
            }))
        };
        
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(state);
        
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }
    
    restoreState(state) {
        // Restore object transforms
        state.objects.forEach(saved => {
            const obj = this.scene.getObjectByProperty('uuid', saved.uuid);
            if (obj) {
                obj.position.copy(saved.position);
                obj.rotation.copy(saved.rotation);
                obj.scale.copy(saved.scale);
            }
        });
    }
    
    // Copy/Paste
    copySelected() {
        this.clipboard = this.selectedObjects.map(obj => ({
            geometry: obj.geometry.clone(),
            material: obj.material.clone(),
            position: obj.position.clone(),
            rotation: obj.rotation.clone(),
            scale: obj.scale.clone(),
            userData: { ...obj.userData }
        }));
    }
    
    pasteObjects() {
        if (!this.clipboard) return;
        
        const pasted = [];
        this.clipboard.forEach(data => {
            const mesh = new THREE.Mesh(data.geometry, data.material);
            mesh.position.copy(data.position).add(new THREE.Vector3(2, 0, 2));
            mesh.rotation.copy(data.rotation);
            mesh.scale.copy(data.scale);
            mesh.userData = { ...data.userData };
            this.scene.add(mesh);
            pasted.push(mesh);
        });
        
        this.setSelection(pasted);
        this.saveToHistory();
    }
}

// Usage in viewer.js:
// this.transformManager = new TransformManager(this);
// Then all transform operations are handled through this manager
// EditingTools.js - Modular editing tools
export class EditingTools {
    constructor(viewer) {
        this.viewer = viewer;
        this.scene = viewer.scene;
        
        this.mode = 'select';
        this.selectedObject = null;
        
        // Drawing
        this.drawingPoints = [];
        this.tempLine = null;
        this.drawingGroup = new THREE.Group();
        this.drawingGroup.position.y = 0.01;
        this.scene.add(this.drawingGroup);
        
        // Transform controls
        this.transformControls = null;
        this.setupTransformControls();
        
        // Measurements
        this.measurements = [];
        this.measureStart = null;
        
        this.shapes = [];
    }
    
    setupTransformControls() {
        this.transformControls = new THREE.TransformControls(
            this.viewer.camera, 
            this.viewer.renderer.domElement
        );
        this.transformControls.size = 1;
        this.transformControls.setMode('translate');
        
        this.transformControls.addEventListener('dragging-changed', (event) => {
            if (this.viewer.controls) {
                this.viewer.controls.enabled = !event.value;
            }
        });
        
        this.scene.add(this.transformControls);
    }
    
    setMode(mode) {
        this.mode = mode;
        this.cancelDrawing();
        
        if (mode !== 'select') {
            this.deselectObject();
        }
        
        return mode;
    }
    
    // Selection
    handleSelection(intersects) {
        const selectables = intersects.filter(i => 
            i.object.type === 'Mesh' && 
            i.object.userData.selectable !== false
        );
        
        if (selectables.length > 0) {
            this.selectObject(selectables[0].object);
        } else {
            this.deselectObject();
        }
    }
    
    selectObject(object) {
        this.selectedObject = object;
        this.transformControls.attach(object);
    }
    
    deselectObject() {
        this.selectedObject = null;
        this.transformControls.detach();
    }
    
    setTransformMode(mode) {
        this.transformControls.setMode(mode);
    }
    
    // Drawing
    startDrawingPoint(point) {
        const snapped = this.viewer.snapToGrid(point);
        this.drawingPoints.push(snapped);
        
        // Add marker
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.1),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        marker.position.copy(snapped);
        marker.userData.drawingMarker = true;
        this.drawingGroup.add(marker);
        
        // Create line segment
        if (this.drawingPoints.length > 1) {
            const points = this.drawingPoints.slice(-2);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(
                geometry,
                new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
            );
            line.userData.drawingLine = true;
            this.drawingGroup.add(line);
        }
    }
    
    updateTempLine(currentPoint) {
        if (this.drawingPoints.length === 0) return;
        
        const snapped = this.viewer.snapToGrid(currentPoint);
        
        if (this.tempLine) {
            this.drawingGroup.remove(this.tempLine);
        }
        
        const points = [this.drawingPoints[this.drawingPoints.length - 1], snapped];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.tempLine = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({ 
                color: 0x00ff00, 
                linewidth: 2,
                opacity: 0.5,
                transparent: true
            })
        );
        this.drawingGroup.add(this.tempLine);
    }
    
    completeShape() {
        if (this.drawingPoints.length < 3) return null;
        
        // Create shape
        const shape = new THREE.Shape();
        shape.moveTo(this.drawingPoints[0].x, this.drawingPoints[0].z);
        for (let i = 1; i < this.drawingPoints.length; i++) {
            shape.lineTo(this.drawingPoints[i].x, this.drawingPoints[i].z);
        }
        shape.closePath();
        
        // Create mesh
        const geometry = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ 
                color: 0x4444ff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3
            })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.01;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        this.scene.add(mesh);
        this.shapes.push(mesh);
        
        // Create outline
        const edges = new THREE.EdgesGeometry(geometry);
        const outline = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 })
        );
        outline.rotation.x = -Math.PI / 2;
        outline.position.y = 0.02;
        mesh.userData.outline = outline;
        this.scene.add(outline);
        
        this.cancelDrawing();
        return mesh;
    }
    
    cancelDrawing() {
        this.drawingPoints = [];
        if (this.tempLine) {
            this.drawingGroup.remove(this.tempLine);
            this.tempLine = null;
        }
        
        // Clear temporary elements
        const toRemove = [];
        this.drawingGroup.children.forEach(child => {
            if (child.userData.drawingMarker || child.userData.drawingLine) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(child => this.drawingGroup.remove(child));
    }
    
    // Measurements
    startMeasurement(point) {
        const snapped = this.viewer.snapToGrid(point);
        
        if (this.measureStart) {
            // Complete measurement
            const distance = this.measureStart.distanceTo(snapped);
            this.addMeasurement(this.measureStart, snapped, distance);
            this.measureStart = null;
            return distance;
        } else {
            // Start measurement
            this.measureStart = snapped;
            return null;
        }
    }
    
    addMeasurement(start, end, distance) {
        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
        );
        
        // Create text sprite
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        context.fillStyle = 'rgba(0,0,0,0.7)';
        context.fillRect(0, 0, 256, 64);
        context.fillStyle = 'white';
        context.font = '24px Arial';
        context.textAlign = 'center';
        context.fillText(`${distance.toFixed(2)}m`, 128, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        const midPoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
        sprite.position.copy(midPoint);
        sprite.position.y = 2;
        sprite.scale.set(4, 1, 1);
        
        const measureGroup = new THREE.Group();
        measureGroup.add(line);
        measureGroup.add(sprite);
        this.scene.add(measureGroup);
        this.measurements.push(measureGroup);
    }
    
    // Primitive shapes
    createRectangle(center = new THREE.Vector3(0, 0, 0), width = 5, depth = 5) {
        const shape = new THREE.Shape();
        shape.moveTo(-width/2, -depth/2);
        shape.lineTo(width/2, -depth/2);
        shape.lineTo(width/2, depth/2);
        shape.lineTo(-width/2, depth/2);
        shape.closePath();
        
        const geometry = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ 
                color: 0x44ff44,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3
            })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(center);
        mesh.position.y = 0.01;
        
        this.scene.add(mesh);
        this.shapes.push(mesh);
        return mesh;
    }
    
    createCircle(center = new THREE.Vector3(0, 0, 0), radius = 3) {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
        
        const geometry = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ 
                color: 0xff4444,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3
            })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(center);
        mesh.position.y = 0.01;
        
        this.scene.add(mesh);
        this.shapes.push(mesh);
        return mesh;
    }
    
    // Cleanup
    clearShapes() {
        this.shapes.forEach(shape => {
            if (shape.userData.outline) {
                this.scene.remove(shape.userData.outline);
            }
            this.scene.remove(shape);
        });
        this.shapes = [];
    }
    
    clearMeasurements() {
        this.measurements.forEach(m => this.scene.remove(m));
        this.measurements = [];
    }
    
    clearAll() {
        this.clearShapes();
        this.clearMeasurements();
        this.cancelDrawing();
        this.deselectObject();
    }
    
    update() {
        if (this.transformControls) {
            this.transformControls.update();
        }
    }
    
    dispose() {
        this.clearAll();
        if (this.transformControls) {
            this.scene.remove(this.transformControls);
            this.transformControls.dispose();
        }
        this.scene.remove(this.drawingGroup);
    }
}
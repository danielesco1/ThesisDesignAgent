// BoundaryDrawer.js - Enhanced architectural site boundary tool
export class BoundaryDrawer {
    constructor(viewer) {
        this.viewer = viewer;
        this.scene = viewer.scene;
        this.camera = viewer.camera;
        this.renderer = viewer.renderer;
        
        this.active = false;
        this.editMode = false;
        this.points = [];
        this.tempLine = null;
        this.group = new THREE.Group();
        this.boundaries = [];
        this.gridSnap = true;
        this.gridSize = 1; // 1 meter grid
        this.angleSnap = true;
        this.angleIncrement = 15; // degrees
        this.selectedBoundary = null;
        this.editHandles = [];
        this.draggedHandle = null;
        
        this.scene.add(this.group);
        
        this.setupUI();
        this.setupEvents();
    }
    
    setupUI() {
        // Main container
        const container = document.createElement('div');
        container.style.cssText = `
            position: absolute;
            top: 70px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 15px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 1000;
            min-width: 200px;
        `;
        
        container.innerHTML = `
            <h3 style="margin: 0 0 10px 0; font-size: 16px;">Site Boundary</h3>
            <button id="drawBoundaryBtn" style="
                width: 100%;
                padding: 10px;
                background: #2ecc71;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                margin-bottom: 10px;
            ">Draw Boundary</button>
            
            <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                <button id="editBoundaryBtn" style="
                    flex: 1;
                    padding: 8px;
                    background: #3498db;
                    color: white;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                ">Edit</button>
                <button id="clearAllBtn" style="
                    flex: 1;
                    padding: 8px;
                    background: #e74c3c;
                    color: white;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                ">Clear All</button>
            </div>
            
            <div style="margin: 10px 0;">
                <label>
                    <input type="checkbox" id="gridSnapCheck" checked> 
                    Snap to Grid (${this.gridSize}m)
                </label>
            </div>
            
            <div style="margin: 10px 0;">
                <label>
                    <input type="checkbox" id="angleSnapCheck" checked> 
                    Snap to Angle (${this.angleIncrement}°)
                </label>
            </div>
            
            <div id="drawingInfo" style="display: none; margin: 10px 0; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 3px;">
                <div>Distance: <span id="distanceDisplay">0.00</span> m</div>
                <div>Angle: <span id="angleDisplay">0</span>°</div>
            </div>
            
            <div id="boundaryInfo" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #555;">
                <div>Points: <span id="pointCount">0</span></div>
                <div>Area: <span id="areaDisplay">0</span> m²</div>
                <div>Perimeter: <span id="perimeterDisplay">0</span> m</div>
            </div>
            
            <div id="boundaryList" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #555;">
                <h4 style="margin: 0 0 5px 0; font-size: 14px;">Boundaries:</h4>
                <div id="boundaries"></div>
            </div>
        `;
        
        document.body.appendChild(container);
        this.container = container;
        
        // Button events
        container.querySelector('#drawBoundaryBtn').addEventListener('click', () => this.toggle());
        container.querySelector('#editBoundaryBtn').addEventListener('click', () => this.toggleEdit());
        container.querySelector('#clearAllBtn').addEventListener('click', () => this.clearAll());
        container.querySelector('#gridSnapCheck').addEventListener('change', (e) => {
            this.gridSnap = e.target.checked;
        });
        container.querySelector('#angleSnapCheck').addEventListener('change', (e) => {
            this.angleSnap = e.target.checked;
        });
        
        // Instructions
        this.instructions = document.createElement('div');
        this.instructions.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 15px 25px;
            border-radius: 5px;
            font-size: 14px;
            display: none;
            text-align: center;
        `;
        this.instructions.innerHTML = `
            Click to add points • Right-click or Enter to complete<br>
            <span style="color: #aaa; font-size: 12px;">Escape to cancel • Minimum 3 points required</span>
        `;
        document.body.appendChild(this.instructions);
    }
    
    setupEvents() {
        this.onClick = (e) => this.handleClick(e);
        this.onMouseMove = (e) => this.handleMouseMove(e);
        this.onMouseDown = (e) => this.handleMouseDown(e);
        this.onMouseUp = (e) => this.handleMouseUp(e);
        this.onContextMenu = (e) => this.handleRightClick(e);
        this.onKeyDown = (e) => this.handleKeyDown(e);
    }
    
    toggle() {
        this.active = !this.active;
        
        if (this.active) {
            this.start();
        } else {
            this.cancel();
        }
    }
    
    start() {
        const btn = this.container.querySelector('#drawBoundaryBtn');
        btn.textContent = 'Cancel Drawing';
        btn.style.background = '#e74c3c';
        this.instructions.style.display = 'block';
        this.container.querySelector('#boundaryInfo').style.display = 'block';
        this.container.querySelector('#drawingInfo').style.display = 'block';
        
        if (this.viewer.transformControls) {
            this.viewer.transformControls.detach();
        }
        this.viewer._toolActive = true;
        
        this.renderer.domElement.addEventListener('click', this.onClick);
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove);
        this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
        window.addEventListener('keydown', this.onKeyDown);
        
        this.clear();
        this.updateInfo();
    }
    
    cancel() {
        this.active = false;
        const btn = this.container.querySelector('#drawBoundaryBtn');
        btn.textContent = 'Draw Boundary';
        btn.style.background = '#2ecc71';
        this.instructions.style.display = 'none';
        this.container.querySelector('#boundaryInfo').style.display = 'none';
        this.container.querySelector('#drawingInfo').style.display = 'none';
        
        this.viewer._toolActive = false;
        
        this.renderer.domElement.removeEventListener('click', this.onClick);
        this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove);
        this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
        window.removeEventListener('keydown', this.onKeyDown);
        
        this.clear();
    }
    
    handleClick(event) {
        if (this.editMode) return;
        
        const point = this.getGroundPoint(event);
        if (!point) return;
        
        if (this.gridSnap) {
            point.x = Math.round(point.x / this.gridSize) * this.gridSize;
            point.z = Math.round(point.z / this.gridSize) * this.gridSize;
        }
        
        this.addPoint(point);
    }
    
    handleMouseMove(event) {
        if (this.editMode && this.draggedHandle) {
            const point = this.getGroundPoint(event);
            if (!point) return;
            
            if (this.gridSnap) {
                point.x = Math.round(point.x / this.gridSize) * this.gridSize;
                point.z = Math.round(point.z / this.gridSize) * this.gridSize;
            }
            
            // Update handle position
            this.draggedHandle.position.x = point.x;
            this.draggedHandle.position.z = point.z;
            
            // Update boundary point
            const index = this.draggedHandle.userData.pointIndex;
            this.selectedBoundary.points[index].x = point.x;
            this.selectedBoundary.points[index].z = point.z;
            
            // Update boundary mesh in real-time
            this.updateBoundaryMesh(this.selectedBoundary);
            return;
        }
        
        if (this.points.length === 0 || !this.active) return;
        
        let point = this.getGroundPoint(event);
        if (!point) return;
        
        const lastPoint = this.points[this.points.length - 1];
        let distance = lastPoint.distanceTo(point);
        let angle = Math.atan2(point.z - lastPoint.z, point.x - lastPoint.x) * 180 / Math.PI;
        
        // Apply angle snap first if enabled
        if (this.angleSnap && this.points.length > 0) {
            const snappedAngle = Math.round(angle / this.angleIncrement) * this.angleIncrement;
            const radians = snappedAngle * Math.PI / 180;
            point.x = lastPoint.x + distance * Math.cos(radians);
            point.z = lastPoint.z + distance * Math.sin(radians);
            angle = snappedAngle;
        }
        
        // Then apply grid snap if enabled
        if (this.gridSnap) {
            point.x = Math.round(point.x / this.gridSize) * this.gridSize;
            point.z = Math.round(point.z / this.gridSize) * this.gridSize;
            // Recalculate distance after grid snap
            distance = lastPoint.distanceTo(point);
        }
        
        // Update drawing info
        document.getElementById('distanceDisplay').textContent = distance.toFixed(2);
        document.getElementById('angleDisplay').textContent = Math.round(angle);
        
        this.updateTempLine(point);
        this.updateInfo(point);
    }
    
    handleMouseDown(event) {
        if (!this.editMode) return;
        
        const handle = this.getHandleAtMouse(event);
        if (handle) {
            this.draggedHandle = handle;
            this.viewer._toolActive = true;
        }
    }
    
    handleMouseUp(event) {
        if (this.editMode && this.draggedHandle) {
            this.draggedHandle = null;
            this.updateBoundaryList();
        }
    }
    
    getHandleAtMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObjects(this.editHandles);
        
        return intersects.length > 0 ? intersects[0].object : null;
    }
    
    handleRightClick(event) {
        event.preventDefault();
        if (!this.editMode) {
            this.complete();
        }
    }
    
    handleKeyDown(event) {
        if (event.key === 'Enter' && this.points.length >= 3 && !this.editMode) {
            this.complete();
        } else if (event.key === 'Escape') {
            if (this.editMode) {
                this.toggleEdit();
            } else if (this.active) {
                this.cancel();
            }
        }
    }
    
    getGroundPoint(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersection);
        
        return intersection;
    }
    
    addPoint(point) {
        // Ensure point is at ground level
        point.y = 0;
        
        // Add marker
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.2),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        marker.position.copy(point);
        marker.position.y = 0.1;
        this.group.add(marker);
        
        // Add point label
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        context.fillStyle = 'white';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(this.points.length + 1, 32, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
        sprite.position.copy(point);
        sprite.position.y = 1;
        sprite.scale.set(0.5, 0.5, 0.5);
        this.group.add(sprite);
        
        this.points.push(point);
        
        // Create line at ground level
        if (this.points.length > 1) {
            const linePoints = this.points.slice(-2).map(p => {
                const lp = p.clone();
                lp.y = 0.01; // Slightly above ground to match final surface
                return lp;
            });
            const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
            const line = new THREE.Line(
                geometry,
                new THREE.LineBasicMaterial({ 
                    color: 0x00ff00, 
                    linewidth: 3 
                })
            );
            this.group.add(line);
        }
        
        this.updateInfo();
    }
    
    updateTempLine(currentPoint) {
        if (this.tempLine) {
            this.group.remove(this.tempLine);
        }
        
        const lastPoint = this.points[this.points.length - 1].clone();
        lastPoint.y = 0.01;
        currentPoint = currentPoint.clone();
        currentPoint.y = 0.01;
        
        const points = [lastPoint, currentPoint];
        
        // Show closing line preview when near first point
        if (this.points.length > 2) {
            const firstPoint = this.points[0];
            const distance = currentPoint.distanceTo(new THREE.Vector3(firstPoint.x, 0.01, firstPoint.z));
            if (distance < 2) { // Within 2 meters of start
                points.push(new THREE.Vector3(firstPoint.x, 0.01, firstPoint.z));
            }
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.tempLine = new THREE.Line(
            geometry,
            new THREE.LineDashedMaterial({ 
                color: 0x00ff00, 
                dashSize: 0.5,
                gapSize: 0.5,
                opacity: 0.7,
                transparent: true
            })
        );
        this.tempLine.computeLineDistances();
        this.group.add(this.tempLine);
    }
    
    updateInfo(tempPoint = null) {
        const points = tempPoint ? [...this.points, tempPoint] : this.points;
        
        document.getElementById('pointCount').textContent = this.points.length;
        
        if (points.length >= 3) {
            const area = this.calculateArea(points);
            const perimeter = this.calculatePerimeter(points, true);
            
            document.getElementById('areaDisplay').textContent = area.toFixed(2);
            document.getElementById('perimeterDisplay').textContent = perimeter.toFixed(2);
        }
    }
    
    calculateArea(points) {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].x * points[j].z;
            area -= points[j].x * points[i].z;
        }
        return Math.abs(area / 2);
    }
    
    calculatePerimeter(points, closed = false) {
        let perimeter = 0;
        for (let i = 0; i < points.length - 1; i++) {
            perimeter += points[i].distanceTo(points[i + 1]);
        }
        if (closed && points.length > 2) {
            perimeter += points[points.length - 1].distanceTo(points[0]);
        }
        return perimeter;
    }
    
    complete() {
        if (this.points.length < 3) {
            alert('Need at least 3 points to create a boundary');
            return;
        }
        
        // Clear any existing boundaries first to avoid overlaps
        this.boundaries.forEach(b => {
            this.scene.remove(b.mesh);
            this.scene.remove(b.outline);
            if (b.drawingLines) {
                b.drawingLines.forEach(line => this.scene.remove(line));
            }
        });
        this.boundaries = [];
        
        if (this.tempLine) {
            this.group.remove(this.tempLine);
            this.tempLine = null;
        }
        
        // Add closing line
        const closingPoints = [
            new THREE.Vector3(this.points[this.points.length - 1].x, 0.01, this.points[this.points.length - 1].z),
            new THREE.Vector3(this.points[0].x, 0.01, this.points[0].z)
        ];
        
        const closingLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(closingPoints),
            new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 })
        );
        this.group.add(closingLine);
        
        // Create boundary using custom geometry in XZ plane
        const vertices = [];
        const indices = [];
        
        // Center point for triangulation
        let centerX = 0, centerZ = 0;
        this.points.forEach(p => {
            centerX += p.x;
            centerZ += p.z;
        });
        centerX /= this.points.length;
        centerZ /= this.points.length;
        
        // Add vertices: center first, then boundary points
        vertices.push(centerX, 0.01, centerZ); // center at index 0
        this.points.forEach(p => {
            vertices.push(p.x, 0.01, p.z);
        });
        
        // Create triangles from center to edges
        for (let i = 0; i < this.points.length; i++) {
            const next = (i + 1) % this.points.length;
            indices.push(0, i + 1, next + 1);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const boundary = new THREE.Mesh(geometry, material);
        
        // Create outline
        const outlinePoints = [];
        for (let i = 0; i <= this.points.length; i++) {
            const p = this.points[i % this.points.length];
            outlinePoints.push(new THREE.Vector3(p.x, 0.02, p.z));
        }
        const outline = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(outlinePoints),
            new THREE.LineBasicMaterial({ color: 0x2E7D32, linewidth: 2 })
        );
        
        // Store data
        const boundaryData = {
            mesh: boundary,
            outline: outline,
            points: [...this.points],
            area: this.calculateArea(this.points),
            perimeter: this.calculatePerimeter(this.points, true),
            drawingLines: [],
            properties: {
                name: `Site 1`,
                zoning: 'Residential',
                buildable: true,
                notes: ''
            }
        };
        
        boundary.userData = boundaryData;
        this.boundaries.push(boundaryData);
        
        this.scene.add(boundary);
        this.scene.add(outline);
        
        // Move drawing lines to scene
        while(this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if (child.type === 'Line' && child.material.color.getHex() === 0x00ff00) {
                child.material.opacity = 0.5;
                child.material.transparent = true;
                this.scene.add(child);
                boundaryData.drawingLines.push(child);
            }
        }
        
        this.updateBoundaryList();
        this.cancel();
    }
    
    toggleEdit() {
        this.editMode = !this.editMode;
        const btn = this.container.querySelector('#editBoundaryBtn');
        
        if (this.editMode) {
            btn.style.background = '#e67e22';
            btn.textContent = 'Stop Edit';
            this.enableEditMode();
        } else {
            btn.style.background = '#3498db';
            btn.textContent = 'Edit';
            this.disableEditMode();
        }
    }
    
    enableEditMode() {
        if (this.boundaries.length === 0) {
            alert('No boundaries to edit');
            this.toggleEdit();
            return;
        }
        
        // Cancel drawing if active
        if (this.active) {
            this.cancel();
        }
        
        // Use the last boundary for editing
        this.selectedBoundary = this.boundaries[this.boundaries.length - 1];
        
        // Create edit handles for each point
        this.selectedBoundary.points.forEach((point, index) => {
            const handle = new THREE.Mesh(
                new THREE.SphereGeometry(0.5),
                new THREE.MeshBasicMaterial({ 
                    color: 0xff9900,
                    depthTest: false,
                    transparent: true,
                    opacity: 0.8
                })
            );
            handle.position.copy(point);
            handle.position.y = 0.5;
            handle.userData = { 
                pointIndex: index, 
                boundary: this.selectedBoundary,
                isEditHandle: true 
            };
            this.editHandles.push(handle);
            this.scene.add(handle);
        });
        
        // Add event listeners for edit mode
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
        this.renderer.domElement.addEventListener('mouseup', this.onMouseUp);
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove);
        
        this.viewer._toolActive = true;
    }
    
    disableEditMode() {
        // Remove edit handles
        this.editHandles.forEach(handle => this.scene.remove(handle));
        this.editHandles = [];
        
        // Remove edit event listeners
        this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.renderer.domElement.removeEventListener('mouseup', this.onMouseUp);
        this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove);
        
        // Update the selected boundary if it exists
        if (this.selectedBoundary) {
            this.updateBoundaryMesh(this.selectedBoundary);
        }
        
        this.selectedBoundary = null;
        this.viewer._toolActive = false;
    }
    
    updateBoundaryMesh(boundaryData) {
        // Remove old mesh and outline
        this.scene.remove(boundaryData.mesh);
        this.scene.remove(boundaryData.outline);
        
        // Create boundary using custom geometry in XZ plane
        const vertices = [];
        const indices = [];
        
        // Center point for triangulation
        let centerX = 0, centerZ = 0;
        boundaryData.points.forEach(p => {
            centerX += p.x;
            centerZ += p.z;
        });
        centerX /= boundaryData.points.length;
        centerZ /= boundaryData.points.length;
        
        // Add vertices: center first, then boundary points
        vertices.push(centerX, 0.01, centerZ);
        boundaryData.points.forEach(p => {
            vertices.push(p.x, 0.01, p.z);
        });
        
        // Create triangles
        for (let i = 0; i < boundaryData.points.length; i++) {
            const next = (i + 1) % boundaryData.points.length;
            indices.push(0, i + 1, next + 1);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const boundary = new THREE.Mesh(geometry, material);
        
        // Create new outline from points
        const outlinePoints = [...boundaryData.points, boundaryData.points[0]].map(p => 
            new THREE.Vector3(p.x, 0.02, p.z)
        );
        const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
        const outline = new THREE.Line(
            outlineGeometry,
            new THREE.LineBasicMaterial({ color: 0x2E7D32, linewidth: 2 })
        );
        
        // Update data
        boundaryData.mesh = boundary;
        boundaryData.outline = outline;
        boundaryData.area = this.calculateArea(boundaryData.points);
        boundaryData.perimeter = this.calculatePerimeter(boundaryData.points, true);
        boundary.userData = boundaryData;
        
        this.scene.add(boundary);
        this.scene.add(outline);
        
        this.updateBoundaryList();
    }
    
    clearAll() {
        if (confirm('Clear all boundaries?')) {
            // Exit edit mode if active
            if (this.editMode) {
                this.toggleEdit();
            }
            
            // Remove all boundary meshes, outlines, and drawing lines
            this.boundaries.forEach(b => {
                this.scene.remove(b.mesh);
                this.scene.remove(b.outline);
                if (b.drawingLines) {
                    b.drawingLines.forEach(line => this.scene.remove(line));
                }
            });
            this.boundaries = [];
            
            // Clear current drawing
            this.clear();
            
            // Update UI
            this.updateBoundaryList();
        }
    }
    
    updateBoundaryList() {
        const list = this.container.querySelector('#boundaries');
        list.innerHTML = this.boundaries.map((b, i) => `
            <div style="padding: 5px 0; border-bottom: 1px solid #333;">
                <strong>${b.properties.name}</strong><br>
                <span style="font-size: 12px; color: #aaa;">
                    ${b.area.toFixed(2)} m² • ${b.perimeter.toFixed(2)} m
                </span>
            </div>
        `).join('');
    }
    
    clear() {
        while(this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
        this.points = [];
        this.tempLine = null;
    }
    
    dispose() {
        this.cancel();
        if (this.editMode) {
            this.disableEditMode();
        }
        this.scene.remove(this.group);
        document.body.removeChild(this.container);
        document.body.removeChild(this.instructions);
    }
}
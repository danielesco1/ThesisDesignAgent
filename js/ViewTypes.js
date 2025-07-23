// ViewTypes.js - Different camera view implementations
import { BaseViewer } from './BaseViewer.js';

export class PerspectiveViewer extends BaseViewer {
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
    }
}

export class TopViewer extends BaseViewer {
    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        const size = this.options.gridSize / 2;
        
        this.camera = new THREE.OrthographicCamera(
            -size * aspect, size * aspect,
            size, -size,
            0.1, 1000
        );
        this.camera.position.set(0, 50, 0);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        
        // Zoom limits
        this.controls.minZoom = 0.5;
        this.controls.maxZoom = 5;
    }
    
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const aspect = width / height;
        const size = this.options.gridSize / 2;
        
        this.camera.left = -size * aspect;
        this.camera.right = size * aspect;
        this.camera.top = size;
        this.camera.bottom = -size;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}

export class SideViewer extends BaseViewer {
    constructor(container, options = {}) {
        super(container, {
            axis: 'x', // 'x' for X-axis side view, 'z' for Z-axis side view
            ...options
        });
    }
    
    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        const size = this.options.gridSize / 2;
        
        this.camera = new THREE.OrthographicCamera(
            -size * aspect, size * aspect,
            size, -size,
            0.1, 1000
        );
        
        if (this.options.axis === 'x') {
            this.camera.position.set(50, 0, 0);
            this.camera.lookAt(0, 0, 0);
        } else {
            this.camera.position.set(0, 0, 50);
            this.camera.lookAt(0, 0, 0);
        }
    }
    
    setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        
        // Lock panning to appropriate axes
        if (this.options.axis === 'x') {
            // For X-side view, allow panning in Y and Z
            this.controls.enablePan = true;
        } else {
            // For Z-side view, allow panning in X and Y
            this.controls.enablePan = true;
        }
        
        this.controls.minZoom = 0.5;
        this.controls.maxZoom = 5;
    }
    
    setupLights() {
        // Override for flatter lighting in orthographic views
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambient);
        
        const directional = new THREE.DirectionalLight(0xffffff, 0.5);
        if (this.options.axis === 'x') {
            directional.position.set(10, 5, 0);
        } else {
            directional.position.set(0, 5, 10);
        }
        this.scene.add(directional);
    }
    
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const aspect = width / height;
        const size = this.options.gridSize / 2;
        
        this.camera.left = -size * aspect;
        this.camera.right = size * aspect;
        this.camera.top = size;
        this.camera.bottom = -size;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}
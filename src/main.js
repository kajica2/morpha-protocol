import * as THREE from 'three';

console.log("MORPHA Implementation Initialized");

// Placeholder for the ritual controller
class RitualController {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    this.init();
    this.animate();
  }

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('app').appendChild(this.renderer.domElement);
    
    // A simple breathing dot as a placeholder
    const geometry = new THREE.CircleGeometry(0.05, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xe6e6e6 });
    this.dot = new THREE.Mesh(geometry, material);
    this.scene.add(this.dot);

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate(time) {
    requestAnimationFrame(this.animate.bind(this));
    
    const scale = 1 + Math.sin(time * 0.001) * 0.1;
    if (this.dot) {
      this.dot.scale.set(scale, scale, 1);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const entryRitual = document.getElementById('entry-ritual');
entryRitual.addEventListener('click', () => {
  entryRitual.style.display = 'none';
  new RitualController();
}, { once: true });

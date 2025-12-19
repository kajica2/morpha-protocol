import * as THREE from 'three';
import vertexShader from '../../shaders/glyph.vert.glsl?raw';
import fragmentShader from '../../shaders/glyph.frag.glsl?raw';

export class Renderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    this.uniforms = {
      uMorph:   { value: 0 },
      uTime:    { value: 0 },
      uAudio:   { value: 0 },
      uBreath:  { value: 0.4 },
      uWarp:    { value: 0.3 },
      uOpacity: { value: 1.0 },
      uColorA:  { value: new THREE.Color(0xffffff) }, // Default white
      uColorB:  { value: new THREE.Color(0x000000) }, // Default black
      uEmotion: { value: 0 } // Neutral emotion
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // Or NormalBlending based on desired effect
      uniforms: this.uniforms
    });

    this.glyphMeshes = []; // Array to hold multiple glyph meshes

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  onWindowResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // This method now adds a new glyph mesh to the scene
  addGlyphMesh(glyphFromGeometry, glyphToGeometry, initialOpacity = 0, initialMorph = 0) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("positionFrom", new THREE.BufferAttribute(glyphFromGeometry, 2));
    geometry.setAttribute("positionTo", new THREE.BufferAttribute(glyphToGeometry, 2));

    // Create a new material instance for each glyph to control its uniforms independently
    const glyphMaterial = this.material.clone();
    glyphMaterial.uniforms.uOpacity.value = initialOpacity;
    glyphMaterial.uniforms.uMorph.value = initialMorph;

    const mesh = new THREE.Points(geometry, glyphMaterial);
    this.scene.add(mesh);
    this.glyphMeshes.push(mesh);
    return mesh; // Return the mesh so Glyph instance can hold a reference
  }

  removeGlyphMesh(mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.glyphMeshes = this.glyphMeshes.filter(m => m !== mesh);
  }

  update(deltaTime, audioData, globalTime, userFingerprint) {
    // Update global uniforms that apply to all glyphs
    this.uniforms.uTime.value = globalTime;
    this.uniforms.uAudio.value = audioData.amp;
    this.uniforms.uWarp.value = audioData.mid * 0.8; // Example mapping
    this.uniforms.uBreath.value = userFingerprint.breath || 0.4; // Example user fingerprint
    this.uniforms.uColorA.value.set(userFingerprint.colorA || 0xffffff);
    this.uniforms.uColorB.value.set(userFingerprint.colorB || 0x000000);

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }
}
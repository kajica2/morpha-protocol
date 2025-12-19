// MORPHA Scene
// Scene management for MORPHA rendering

import * as THREE from 'three';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0e0e);  // Dark background
  return scene;
}

export function addToScene(scene, object) {
  scene.add(object);
}

export function removeFromScene(scene, object) {
  scene.remove(object);
}

export function clearScene(scene) {
  while(scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }
}

export default {
  createScene,
  addToScene,
  removeFromScene,
  clearScene
};

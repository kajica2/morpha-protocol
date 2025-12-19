// MORPHA Camera
// Simple orthographic camera for 2D glyph rendering

import * as THREE from 'three';

export function createOrthographicCamera() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 1;
  return camera;
}

export function updateCameraAspect(camera, width, height) {
  const aspect = width / height;

  if (aspect > 1) {
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
  } else {
    camera.left = -1;
    camera.right = 1;
    camera.top = 1 / aspect;
    camera.bottom = -1 / aspect;
  }

  camera.updateProjectionMatrix();
}

export default {
  createOrthographicCamera,
  updateCameraAspect
};

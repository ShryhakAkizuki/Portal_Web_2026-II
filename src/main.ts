import * as THREE from 'three';
import { Renderer } from './systems/Renderer';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Canvas #game no encontrado en index.html');
}

const renderer = new Renderer(canvas);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.6, metalness: 0.1 }),
);
cube.position.set(0, 0.3, 0);
renderer.scene.add(cube);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
renderer.scene.add(floor);

renderer.camera.position.set(0, 1.5, 3);
renderer.camera.lookAt(0, 0.3, 0);

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

const ROTS_PER_SECOND = Math.PI / 2;
let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  cube.rotation.y += ROTS_PER_SECOND * dt;
  renderer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

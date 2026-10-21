import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const statusEl = document.getElementById('status');


const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101014);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 1.5, 4);
camera.lookAt(0, 1, 0);

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(3, 5, 4);
scene.add(sun, new THREE.AmbientLight(0xffffff, 0.4));

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x7ec8ff }),
);
cube.position.set(0, 1, 0);
scene.add(cube);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
const animate = (now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  cube.rotation.x += dt;
  cube.rotation.y += dt * 1.3;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};
requestAnimationFrame(animate);
console.log('OK: Three.js inicializado, cubo renderizando.');


try {
  await RAPIER.init();
  console.log('OK: Rapier WASM inicializado.', RAPIER.__wasm ? '' : '');
  statusEl.textContent = 'OK: Three.js + Rapier listos';
  statusEl.style.color = '#8f8';
} catch (err) {
  console.error('ERROR: no se pudo inicializar el WASM de Rapier.', err);
  statusEl.textContent = 'ERROR: Rapier no pudo inicializarse';
  statusEl.style.color = '#f88';
}

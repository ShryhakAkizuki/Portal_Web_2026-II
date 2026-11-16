import * as THREE from 'three';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Canvas #game no encontrado en index.html');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202428);

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
camera.position.set(0, 1.5, 3);
camera.lookAt(0, 0.3, 0);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.6, metalness: 0.1 }),
);
cube.position.set(0, 0.3, 0);
scene.add(cube);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const ROTS_PER_SECOND = Math.PI / 2;
let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  cube.rotation.y += ROTS_PER_SECOND * dt;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

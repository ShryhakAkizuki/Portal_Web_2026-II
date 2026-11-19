import { Game } from './core/Game';
import { EventBus } from './core/EventBus';
import { SceneManager } from './core/SceneManager';
import { Renderer } from './systems/Renderer';
import { PhysicsWorld } from './systems/PhysicsWorld';
import { InputManager } from './systems/InputManager';
import { Level } from './levels/Level';
import { registerAll } from './levels/registerAll';
import testRoom from './levels/data/test-room.json';
import type { IPlayer, LevelData } from './types/contracts';

const LEVEL_DATA = testRoom as unknown as LevelData;

async function main(): Promise<void> {
  const el = document.getElementById('game');
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error('Canvas #game no encontrado en index.html');
  }
  const canvas = el;
  const renderer = new Renderer(canvas);
  const physics = await PhysicsWorld.create();
  const input = new InputManager({ target: window, canvas, doc: document });
  const bus = new EventBus();
  const scenes = new SceneManager();

  registerAll();
  const level = new Level({ physics, renderer, bus, input }, LEVEL_DATA);

  await scenes.change(level);

  const game = new Game({
    update: (dt) => scenes.update(dt),
    render: (alpha) => scenes.render(alpha),
  });
  game.start();

  canvas.addEventListener('click', () => input.lockPointer());

  function resize(): void {
    renderer.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  if (new URLSearchParams(window.location.search).has('debug')) {
    const hud = document.createElement('div');
    hud.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:10;font:13px/1.4 monospace;' +
      'color:#e6e6e6;background:rgba(0,0,0,0.6);padding:6px 8px;border-radius:4px;pointer-events:none;';
    document.body.appendChild(hud);
    let fps = 0;
    let frames = 0;
    let last = performance.now();
    const tick = (): void => {
      frames += 1;
      const now = performance.now();
      if (now - last >= 500) {
        fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;

        const p = level.getEntity('player') as IPlayer | undefined;
        if (p) {
          const pos = physics.getPose(p.body!).position;
          hud.textContent =
            `fps: ${fps}\npos: ${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)}\n` +
            `grounded: ${p.grounded}`;
        } else {
          hud.textContent = `fps: ${fps}`;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

void main();

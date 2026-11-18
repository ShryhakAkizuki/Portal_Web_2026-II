import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/systems/InputManager';
import type { InputHost } from '../../src/systems/InputManager';

function makeHost() {
  const target = new EventTarget();
  const doc: EventTarget & { pointerLockElement: unknown } = Object.assign(new EventTarget(), {
    pointerLockElement: null,
  });
  let lockCalls = 0;
  const canvas: EventTarget & { requestPointerLock(): void } = Object.assign(new EventTarget(), {
    requestPointerLock(): void {
      lockCalls += 1;
      doc.pointerLockElement = canvas;
    },
  });
  const host: InputHost = { target, canvas, doc };
  return { host, target, doc, canvas, lockCalls: () => lockCalls };
}

function key(type: string, code: string, repeat = false): Event {
  return Object.assign(new Event(type), { code, repeat });
}

function mouse(type: string, button: number, movementX = 0, movementY = 0): Event {
  return Object.assign(new Event(type), { button, movementX, movementY });
}

describe('InputManager', () => {
  it('un keydown marca isDown y wasPressed (flanco de subida); el keyup limpia isDown', () => {
    const { host, target } = makeHost();
    const im = new InputManager(host);
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(im.isDown('forward')).toBe(true);
    expect(im.wasPressed('forward')).toBe(true);
    target.dispatchEvent(key('keyup', 'KeyW'));
    expect(im.isDown('forward')).toBe(false);
    expect(im.wasPressed('forward')).toBe(true);
  });

  it('las flechas equivalen a las teclas WASD', () => {
    const { host, target } = makeHost();
    const im = new InputManager(host);
    target.dispatchEvent(key('keydown', 'ArrowUp'));
    expect(im.isDown('forward')).toBe(true);
    target.dispatchEvent(key('keydown', 'ArrowLeft'));
    expect(im.isDown('left')).toBe(true);
    target.dispatchEvent(key('keydown', 'ArrowDown'));
    expect(im.isDown('back')).toBe(true);
    target.dispatchEvent(key('keydown', 'ArrowRight'));
    expect(im.isDown('right')).toBe(true);
  });

  it('un keydown repetido (event.repeat) no cuenta como pulsación nueva', () => {
    const { host, target } = makeHost();
    const im = new InputManager(host);
    target.dispatchEvent(key('keydown', 'KeyS'));
    im.endStep();
    target.dispatchEvent(key('keydown', 'KeyS', true));
    expect(im.isDown('back')).toBe(true);
    expect(im.wasPressed('back')).toBe(false);
  });

  it('una tecla sin mapear no afecta el estado', () => {
    const { host, target } = makeHost();
    const im = new InputManager(host);
    target.dispatchEvent(key('keydown', 'KeyF'));
    expect(im.isDown('forward')).toBe(false);
    expect(im.wasPressed('forward')).toBe(false);
  });

  it('wasPressed se limpia con endStep', () => {
    const { host, target } = makeHost();
    const im = new InputManager(host);
    target.dispatchEvent(key('keydown', 'Space'));
    expect(im.wasPressed('jump')).toBe(true);
    im.endStep();
    expect(im.wasPressed('jump')).toBe(false);
  });

  describe('getMoveAxis', () => {
    it('sin teclas devuelve (0, 0)', () => {
      const { host } = makeHost();
      const im = new InputManager(host);
      expect(im.getMoveAxis()).toEqual({ x: 0, y: 0 });
    });

    it('cada dirección por separado', () => {
      const { host, target } = makeHost();
      const im = new InputManager(host);
      target.dispatchEvent(key('keydown', 'KeyW'));
      expect(im.getMoveAxis()).toEqual({ x: 0, y: 1 });
      target.dispatchEvent(key('keyup', 'KeyW'));
      target.dispatchEvent(key('keydown', 'KeyD'));
      expect(im.getMoveAxis()).toEqual({ x: 1, y: 0 });
      target.dispatchEvent(key('keyup', 'KeyD'));
      target.dispatchEvent(key('keydown', 'KeyS'));
      expect(im.getMoveAxis()).toEqual({ x: 0, y: -1 });
      target.dispatchEvent(key('keyup', 'KeyS'));
      target.dispatchEvent(key('keydown', 'KeyA'));
      expect(im.getMoveAxis()).toEqual({ x: -1, y: 0 });
    });

    it('la diagonal se normaliza a longitud 1', () => {
      const { host, target } = makeHost();
      const im = new InputManager(host);
      target.dispatchEvent(key('keydown', 'KeyW'));
      target.dispatchEvent(key('keydown', 'KeyD'));
      const { x, y } = im.getMoveAxis();
      expect(x).toBeCloseTo(1 / Math.SQRT2);
      expect(y).toBeCloseTo(1 / Math.SQRT2);
      expect(Math.hypot(x, y)).toBeCloseTo(1);
    });

    it('direcciones opuestas se anulan', () => {
      const { host, target } = makeHost();
      const im = new InputManager(host);
      target.dispatchEvent(key('keydown', 'KeyW'));
      target.dispatchEvent(key('keydown', 'KeyS'));
      expect(im.getMoveAxis()).toEqual({ x: 0, y: 0 });
    });
  });

  describe('mirada', () => {
    it('sin bloqueo los mousemove no acumulan nada', () => {
      const { host, target } = makeHost();
      const im = new InputManager(host);
      target.dispatchEvent(mouse('mousemove', 0, 5, 2));
      expect(im.consumeLook()).toEqual({ dx: 0, dy: 0 });
    });

    it('con bloqueo acumula movementX/Y; consumeLook devuelve y reinicia', () => {
      const { host, target, doc, canvas } = makeHost();
      const im = new InputManager(host);
      doc.pointerLockElement = canvas;
      target.dispatchEvent(mouse('mousemove', 0, 3, -2));
      target.dispatchEvent(mouse('mousemove', 0, 1, 4));
      expect(im.consumeLook()).toEqual({ dx: 4, dy: 2 });
      expect(im.consumeLook()).toEqual({ dx: 0, dy: 0 });
    });
  });

  describe('ratón', () => {
    it('el clic se ignora sin bloqueo', () => {
      const { host, target } = makeHost();
      const im = new InputManager(host);
      target.dispatchEvent(mouse('mousedown', 0));
      expect(im.isDown('firePrimary')).toBe(false);
      expect(im.wasPressed('firePrimary')).toBe(false);
      target.dispatchEvent(mouse('mousedown', 2));
      expect(im.isDown('fireSecondary')).toBe(false);
    });

    it('con bloqueo: botón 0 → firePrimary, botón 2 → fireSecondary', () => {
      const { host, target, doc, canvas } = makeHost();
      const im = new InputManager(host);
      doc.pointerLockElement = canvas;
      target.dispatchEvent(mouse('mousedown', 0));
      expect(im.isDown('firePrimary')).toBe(true);
      expect(im.wasPressed('firePrimary')).toBe(true);
      target.dispatchEvent(mouse('mouseup', 0));
      expect(im.isDown('firePrimary')).toBe(false);
      expect(im.wasPressed('firePrimary')).toBe(true);
      target.dispatchEvent(mouse('mousedown', 2));
      expect(im.isDown('fireSecondary')).toBe(true);
      expect(im.wasPressed('fireSecondary')).toBe(true);
    });

    it('contextmenu en el canvas hace preventDefault', () => {
      const { host, canvas } = makeHost();
      new InputManager(host);
      const ev = new Event('contextmenu', { cancelable: true });
      canvas.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    });
  });

  describe('pointer lock', () => {
    it('isLocked refleja pointerLockElement === canvas', () => {
      const { host, doc, canvas } = makeHost();
      const im = new InputManager(host);
      expect(im.isLocked).toBe(false);
      doc.pointerLockElement = canvas;
      expect(im.isLocked).toBe(true);
      doc.pointerLockElement = null;
      expect(im.isLocked).toBe(false);
    });

    it('lockPointer llama a canvas.requestPointerLock()', () => {
      const { host, doc, canvas, lockCalls } = makeHost();
      const im = new InputManager(host);
      im.lockPointer();
      expect(lockCalls()).toBe(1);
      expect(doc.pointerLockElement).toBe(canvas);
    });

    it('al desbloquear marca pause y limpia teclas, botones y mirada', () => {
      const { host, target, doc, canvas } = makeHost();
      const im = new InputManager(host);
      doc.pointerLockElement = canvas;
      target.dispatchEvent(key('keydown', 'KeyW'));
      target.dispatchEvent(mouse('mousedown', 0));
      target.dispatchEvent(mouse('mousemove', 0, 7, 3));
      doc.pointerLockElement = null;
      doc.dispatchEvent(new Event('pointerlockchange'));
      expect(im.wasPressed('pause')).toBe(true);
      expect(im.isDown('forward')).toBe(false);
      expect(im.isDown('firePrimary')).toBe(false);
      expect(im.consumeLook()).toEqual({ dx: 0, dy: 0 });
    });
  });

  it('blur limpia todas las teclas', () => {
    const { host, target } = makeHost();
    const im = new InputManager(host);
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(key('keydown', 'Space'));
    target.dispatchEvent(new Event('blur'));
    expect(im.isDown('forward')).toBe(false);
    expect(im.isDown('jump')).toBe(false);
  });

  it('dispose retira los listeners: emitir después no cambia el estado', () => {
    const { host, target, doc } = makeHost();
    const im = new InputManager(host);
    im.dispose();
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(mouse('mousemove', 0, 4, 1));
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(im.isDown('forward')).toBe(false);
    expect(im.wasPressed('forward')).toBe(false);
    expect(im.wasPressed('pause')).toBe(false);
    expect(im.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });
});

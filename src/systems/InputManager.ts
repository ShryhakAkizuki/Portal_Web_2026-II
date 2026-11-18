import type { Action, IInput } from '../types/contracts';

export interface InputHost {
  target: EventTarget; // window
  canvas: EventTarget & { requestPointerLock(): void };
  doc: EventTarget & { pointerLockElement: unknown }; // document
}

type KeyAction = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'interact';
type MouseAction = 'firePrimary' | 'fireSecondary';

const KEY_MAP: { [code: string]: KeyAction | undefined } = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  KeyE: 'interact',
};

const MOUSE_MAP: { [button: number]: MouseAction | undefined } = {
  0: 'firePrimary',
  2: 'fireSecondary',
};

const KEY_ACTIONS: readonly KeyAction[] = ['forward', 'back', 'left', 'right', 'jump', 'interact'];

export class InputManager implements IInput {
  private readonly host: InputHost;
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];
  private readonly down = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private lookX = 0;
  private lookY = 0;

  constructor(host: InputHost) {
    this.host = host;
    this.add(host.target, 'keydown', this.onKeyDown);
    this.add(host.target, 'keyup', this.onKeyUp);
    this.add(host.target, 'mousedown', this.onMouseDown);
    this.add(host.target, 'mouseup', this.onMouseUp);
    this.add(host.target, 'mousemove', this.onMouseMove);
    this.add(host.target, 'blur', this.onBlur);
    this.add(host.canvas, 'contextmenu', this.onContextMenu);
    this.add(host.doc, 'pointerlockchange', this.onPointerLockChange);
  }

  get isLocked(): boolean {
    return this.host.doc.pointerLockElement === this.host.canvas;
  }

  isDown(a: Action): boolean {
    return this.down.has(a);
  }

  wasPressed(a: Action): boolean {
    return this.pressed.has(a);
  }

  getMoveAxis(): { x: number; y: number } {
    const x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    const y = (this.down.has('forward') ? 1 : 0) - (this.down.has('back') ? 1 : 0);
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  consumeLook(): { dx: number; dy: number } {
    const dx = this.lookX;
    const dy = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    return { dx, dy };
  }

  lockPointer(): void {
    this.host.canvas.requestPointerLock();
  }

  endStep(): void {
    this.pressed.clear();
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners) {
      target.removeEventListener(type, fn);
    }
    this.listeners.length = 0;
  }

  // ---------- Listeners ----------

  private add(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private onKeyDown = (event: Event): void => {
    const ev = event as KeyboardEvent;
    const action = KEY_MAP[ev.code];
    if (!action) return;
    this.down.add(action);
    if (!ev.repeat) this.pressed.add(action);
  };

  private onKeyUp = (event: Event): void => {
    const action = KEY_MAP[(event as KeyboardEvent).code];
    if (action) this.down.delete(action);
  };

  private onMouseDown = (event: Event): void => {
    if (!this.isLocked) return;
    const action = MOUSE_MAP[(event as MouseEvent).button];
    if (!action) return;
    this.down.add(action);
    this.pressed.add(action);
  };

  private onMouseUp = (event: Event): void => {
    const action = MOUSE_MAP[(event as MouseEvent).button];
    if (action) this.down.delete(action);
  };

  private onMouseMove = (event: Event): void => {
    if (!this.isLocked) return;
    const ev = event as MouseEvent;
    this.lookX += ev.movementX;
    this.lookY += ev.movementY;
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onPointerLockChange = (): void => {
    if (this.isLocked) return;
    this.pressed.add('pause');
    this.down.clear();
    this.lookX = 0;
    this.lookY = 0;
  };

  private onBlur = (): void => {
    for (const action of KEY_ACTIONS) this.down.delete(action);
  };
}

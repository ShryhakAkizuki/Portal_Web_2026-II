import type { ISceneManager, Scene } from '../types/contracts';

export class SceneManager implements ISceneManager {
  private token = 0;
  private currentScene: Scene | null = null;

  get current(): Scene | null {
    return this.currentScene;
  }

  async change(next: Scene): Promise<void> {
    const myToken = ++this.token;

    if (this.currentScene) {
      this.currentScene.exit();
    }
    this.currentScene = null;

    try {
      await next.enter();
    } catch (err) {
      next.exit();
      throw err;
    }

    if (this.token !== myToken) {
      next.exit();
      return;
    }

    this.currentScene = next;
  }

  update(dt: number): void {
    if (this.currentScene) {
      this.currentScene.update(dt);
    }
  }

  render(alpha: number): void {
    if (this.currentScene) {
      this.currentScene.render(alpha);
    }
  }
}

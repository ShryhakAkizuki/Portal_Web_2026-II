import { describe, expect, it, vi } from 'vitest';
import { Color, MeshBasicMaterial, PerspectiveCamera, ShaderMaterial } from 'three';
import type { Material } from 'three';
import { PORTAL_ASPECT, PortalViews, clipFrame, virtualCameraWorld } from '../../src/systems/portalViews';
import { makePortalFrame, obliqueNearProjection } from '../../src/math/portalMath';
import { PORTAL_OFFSET } from '../../src/config';
import {
  F_A,
  F_B,
  M_A,
  M_B,
  cameraAt,
  setupPortalScene,
  surfaceOf,
} from '../utils/portalTestFakes';
import type { PortalColor } from '../../src/types/contracts';

function mk() {
  const { scene, visual, gl, calls, renderer } = setupPortalScene();
  const views = new PortalViews(renderer, visual);
  const camera = cameraAt([0, 0, 3], [0, 0, 0]);
  return { scene, visual, gl, calls, views, camera };
}

const renderLinked = (views: PortalViews, camera: Parameters<PortalViews['render']>[0]) =>
  views.render(camera, M_A, M_B, F_B, F_A);

interface SurfaceApp {
  color: PortalColor;
  tex: unknown;
}

function spySurfaces(visual: ReturnType<typeof setupPortalScene>['visual']): SurfaceApp[] {
  const seq: SurfaceApp[] = [];
  const original = visual.setSurfaceMaterial.bind(visual);
  vi.spyOn(visual, 'setSurfaceMaterial').mockImplementation((c: PortalColor, m: Material) => {
    seq.push({ color: c, tex: (m as ShaderMaterial).uniforms.map.value });
    original(c, m);
  });
  return seq;
}

describe('PortalViews (T23 · T25 · sin WebGL)', () => {
  it('sin enlace: no llama a renderTo, no toca gl y restaura el color oscuro', () => {
    const { visual, gl, calls, views, camera } = mk();
    const surface = surfaceOf(visual, 'blue');
    const marker = new MeshBasicMaterial({ color: 0xffffff });
    visual.setSurfaceMaterial('blue', marker);

    views.render(camera, M_A, null, F_B, F_A);

    expect(calls).toHaveLength(0);
    expect(gl.accesses).toBe(0);
    expect(surface.material).not.toBe(marker);
    expect((surface.material as MeshBasicMaterial).color.getHex()).toBe(new Color(0x0a0a12).getHex());
    marker.dispose();
  });

  it('enlazado: 2 pasadas, 4 renderTo en buffers distintos y superficie con el RT final', () => {
    const { gl, calls, views, camera, visual } = mk();
    renderLinked(views, camera);

    expect(gl.accesses).toBe(1);
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((c) => c.target)).size).toBe(4);
    expect(calls[0].target).not.toBe(calls[2].target);
    expect(calls[1].target).not.toBe(calls[3].target);

    const matBlue = surfaceOf(visual, 'blue').material as ShaderMaterial;
    const matOrange = surfaceOf(visual, 'orange').material as ShaderMaterial;
    expect(matBlue).toBeInstanceOf(ShaderMaterial);
    expect(matBlue.uniforms.map.value).toBe(calls[2].target.texture);
    expect(matOrange.uniforms.map.value).toBe(calls[3].target.texture);
  });

  it('durante cada pasada, las superficies muestran la textura de la pasada anterior', () => {
    const { visual, calls, views, camera } = mk();
    const seq = spySurfaces(visual);

    renderLinked(views, camera);

    expect(seq).toHaveLength(4);
    expect(seq[0]).toEqual({ color: 'blue', tex: calls[0].target.texture });
    expect(seq[1]).toEqual({ color: 'orange', tex: calls[1].target.texture });
    expect(seq[2]).toEqual({ color: 'blue', tex: calls[2].target.texture });
    expect(seq[3]).toEqual({ color: 'orange', tex: calls[3].target.texture });
  });

  it('la primera pasada parte del color oscuro (reset) y las siguientes no lo repiten', () => {
    const { visual, views, camera } = mk();
    const resets = vi.spyOn(visual, 'resetSurfaceMaterial');

    renderLinked(views, camera);
    expect(resets).toHaveBeenCalledTimes(2);

    resets.mockClear();
    views.render(camera, M_A, M_B, F_B, F_A, 3);
    expect(resets).toHaveBeenCalledTimes(2);
  });

  it('con 3 pasadas: 6 renderTo y la superficie alterna el buffer de lectura', () => {
    const { visual, calls, views, camera } = mk();
    const seq = spySurfaces(visual);

    views.render(camera, M_A, M_B, F_B, F_A, 3);

    expect(calls).toHaveLength(6);
    expect(new Set(calls.map((c) => c.target)).size).toBe(4);
    for (let i = 0; i < 6; i++) {
      expect(seq[i].tex).toBe(calls[i].target.texture);
    }
    expect((surfaceOf(visual, 'blue').material as ShaderMaterial).uniforms.map.value).toBe(
      calls[4].target.texture,
    );
    expect((surfaceOf(visual, 'orange').material as ShaderMaterial).uniforms.map.value).toBe(
      calls[5].target.texture,
    );
  });

  it('con 1 pasada: solo una pasada (sin realimentación)', () => {
    const { visual, calls, views, camera } = mk();
    const seq = spySurfaces(visual);

    views.render(camera, M_A, M_B, F_B, F_A, 1);

    expect(calls).toHaveLength(2);
    expect(seq).toHaveLength(2);
    expect((surfaceOf(visual, 'blue').material as ShaderMaterial).uniforms.map.value).toBe(
      calls[0].target.texture,
    );
    expect((surfaceOf(visual, 'orange').material as ShaderMaterial).uniforms.map.value).toBe(
      calls[1].target.texture,
    );
  });

  it('cámaras virtuales: reutilizadas entre pasadas y renders, correctas y con recorte oblicuo (T24)', () => {
    const { calls, views, camera } = mk();
    renderLinked(views, camera);
    const cam1 = calls[0].cam;
    expect(calls[2].cam).toBe(cam1);
    renderLinked(views, camera);
    expect(calls[4].cam).toBe(cam1);
    expect(cam1.matrixAutoUpdate).toBe(false);
    expect(cam1.matrixWorldAutoUpdate).toBe(false);
    expect(cam1.fov).toBe(camera.fov);
    expect(cam1.aspect).toBe(PORTAL_ASPECT);

    const expectedBlue = virtualCameraWorld(M_A, M_B, camera.matrixWorld);
    expect(cam1.matrixWorld.elements).toEqual(expectedBlue.elements);
    const inv = cam1.matrixWorld.clone().invert();
    inv.elements.forEach((v, i) =>
      expect(cam1.matrixWorldInverse.elements[i]).toBeCloseTo(v, 12),
    );

    const base = new PerspectiveCamera(camera.fov, PORTAL_ASPECT, camera.near, camera.far);
    base.updateProjectionMatrix();
    const expectedBlueProj = obliqueNearProjection(
      base.projectionMatrix,
      cam1.matrixWorldInverse,
      clipFrame(F_B),
    );
    expect(cam1.projectionMatrix.elements).toEqual(expectedBlueProj.elements);
    const cam2 = calls[1].cam;
    const expectedOrangeProj = obliqueNearProjection(
      base.projectionMatrix,
      cam2.matrixWorldInverse,
      clipFrame(F_A),
    );
    expect(cam2.projectionMatrix.elements).toEqual(expectedOrangeProj.elements);
  });

  it('clipFrame sesga el plano de recorte hacia la pared (sin tocar el original)', () => {
    const f = makePortalFrame([0, 0, 10], [0, 0, -1], [0, 1, 0]);
    const c = clipFrame(f);
    expect(c).not.toBe(f);
    expect(c.normal).toEqual(f.normal);
    expect(c.up).toEqual(f.up);
    expect(c.right).toEqual(f.right);
    expect(c.position.z).toBeCloseTo(10 + PORTAL_OFFSET / 2, 12);
    expect(f.position.z).toBe(10);
  });

  it('si cambia el buffer, redimensiona los 4 targets sin re-crearlos', () => {
    const { gl, calls, views, camera } = mk();
    renderLinked(views, camera);
    const bluePair = [calls[0].target, calls[2].target];
    const orangePair = [calls[1].target, calls[3].target];
    gl.setBuffer(1024, 512);
    renderLinked(views, camera);
    const bluePair2 = [calls[4].target, calls[6].target];
    const orangePair2 = [calls[5].target, calls[7].target];
    expect(bluePair2).toEqual(bluePair);
    expect(orangePair2).toEqual(orangePair);
    for (const rt of [...bluePair, ...orangePair]) {
      expect([rt.width, rt.height]).toEqual([512, 1024]);
    }
  });

  it('perder y recuperar el enlace reutiliza el mismo material de superficie', () => {
    const { visual, calls, views, camera } = mk();
    renderLinked(views, camera);
    const mat1 = surfaceOf(visual, 'blue').material;

    views.render(camera, M_A, null, F_B, F_A);
    expect(surfaceOf(visual, 'blue').material).not.toBe(mat1);
    expect((surfaceOf(visual, 'blue').material as MeshBasicMaterial).color.getHex()).toBe(
      new Color(0x0a0a12).getHex(),
    );

    renderLinked(views, camera);
    expect(surfaceOf(visual, 'blue').material).toBe(mat1);
    expect(calls).toHaveLength(8);
  });

  it('dispose libera los 4 targets y los 2 materiales', () => {
    const { visual, calls, views, camera } = mk();
    renderLinked(views, camera);
    const rtSpies = calls.map((c) => vi.spyOn(c.target, 'dispose'));
    const matSpy = vi.spyOn(surfaceOf(visual, 'blue').material as ShaderMaterial, 'dispose');

    views.dispose();

    for (const s of rtSpies) expect(s).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });
});

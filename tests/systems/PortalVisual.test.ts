import { describe, expect, it, vi } from 'vitest';
import { Color, Group, MeshBasicMaterial, Scene, Vector3 } from 'three';
import { CircleGeometry, RingGeometry } from 'three';
import type { Mesh } from 'three';
import { PortalVisual } from '../../src/systems/PortalVisual';
import { frameMatrix, makePortalFrame } from '../../src/math/portalMath';
import { PORTAL_HEIGHT, PORTAL_WIDTH } from '../../src/config';
import type { PortalColor, PortalState, Vec3 } from '../../src/types/contracts';

const stateOf = (color: PortalColor, position: Vec3, normal: Vec3, up: Vec3): PortalState => ({
  color,
  position,
  normal,
  up,
  right: [
    up[1] * normal[2] - up[2] * normal[1],
    up[2] * normal[0] - up[0] * normal[2],
    up[0] * normal[1] - up[1] * normal[0],
  ],
  hostBody: null,
});

const WALL: PortalState = stateOf('blue', [0, 0, 3], [0, 0, 1], [0, 1, 0]);

describe('PortalVisual (T22 · sin WebGL: solo grafo de escena)', () => {
  it('show añade el grupo a la escena con matrix = frameMatrix y los hijos esperados', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(WALL);

    expect(scene.children).toHaveLength(1);
    const group = scene.children[0] as Group;
    expect(group.matrixAutoUpdate).toBe(false);
    const expected = frameMatrix(makePortalFrame(WALL.position, WALL.normal, WALL.up));
    expect(group.matrix.elements).toEqual(expected.elements);

    const surface = visual.getSurface('blue') as Mesh;
    expect(surface).toBe(group.children[0]);
    expect(surface.geometry).toBeInstanceOf(CircleGeometry);
    expect([surface.scale.x, surface.scale.y, surface.scale.z]).toEqual([
      PORTAL_WIDTH,
      PORTAL_HEIGHT,
      1,
    ]);
    expect((surface.material as MeshBasicMaterial).color.getHex()).toBe(new Color(0x0a0a12).getHex());

    const border = group.children[1] as Mesh;
    expect(border.geometry).toBeInstanceOf(RingGeometry);
    expect([border.scale.x, border.scale.y, border.scale.z]).toEqual([
      PORTAL_WIDTH,
      PORTAL_HEIGHT,
      1,
    ]);
    expect(border.position.z).toBeCloseTo(0.001, 6);
    expect((border.material as MeshBasicMaterial).color.getHex()).toBe(new Color(0x2d7ff9).getHex());
  });

  it('show de orange usa el borde naranja', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(stateOf('orange', [0, 0, 3], [0, 0, 1], [0, 1, 0]));
    const group = scene.children[0] as Group;
    const border = group.children[1] as Mesh;
    expect((border.material as MeshBasicMaterial).color.getHex()).toBe(new Color(0xff8a1f).getHex());
    expect(visual.getSurface('orange')).not.toBeNull();
  });

  it('la normal mundial del círculo (+Z transformada) coincide con state.normal', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(WALL);
    const group = scene.children[0] as Group;
    const n = new Vector3().setFromMatrixColumn(group.matrix, 2);
    expect(n.distanceTo(new Vector3(WALL.normal[0], WALL.normal[1], WALL.normal[2]))).toBeLessThan(1e-9);
  });

  it('normal no alineada a los ejes: el grupo queda orientado al marco', () => {
    const normal: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const st = stateOf('orange', [1, 2, 3], normal, [0, 1, 0]);
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(st);
    const group = scene.children[0] as Group;
    const expected = frameMatrix(makePortalFrame(st.position, st.normal, st.up));
    expect(group.matrix.elements).toEqual(expected.elements);
    const n = new Vector3().setFromMatrixColumn(group.matrix, 2);
    expect(n.distanceTo(new Vector3(normal[0], normal[1], normal[2]))).toBeLessThan(1e-9);
  });

  it('hide lo retira de la escena; el siguiente show reutiliza el grupo sin duplicar', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(WALL);
    const group = scene.children[0] as Group;

    visual.hide('blue');
    expect(scene.children).toHaveLength(0);

    visual.show(WALL);
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]).toBe(group);
  });

  it('show dos veces no duplica y actualiza la matriz a la última', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(WALL);
    const st2 = stateOf('blue', [0, 0, 5], [0, 0, 1], [0, 1, 0]);
    visual.show(st2);
    expect(scene.children).toHaveLength(1);
    const group = scene.children[0] as Group;
    const expected = frameMatrix(makePortalFrame(st2.position, st2.normal, st2.up));
    expect(group.matrix.elements).toEqual(expected.elements);
  });

  it('dispose quita todo de la escena y llama a dispose de geometrías (espía)', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(WALL);
    visual.show(stateOf('orange', [5, 0, 3], [0, 0, 1], [0, 1, 0]));
    expect(scene.children).toHaveLength(2);

    const surfaceBlue = visual.getSurface('blue') as Mesh;
    const surfaceOrange = visual.getSurface('orange') as Mesh;
    const groupBlue = surfaceBlue.parent as Group;
    const borderBlue = groupBlue.children.find((c) => c !== surfaceBlue) as Mesh;
    const spyBlue = vi.spyOn(surfaceBlue.geometry, 'dispose');
    const spyBorderBlue = vi.spyOn(borderBlue.geometry, 'dispose');
    const spyOrange = vi.spyOn(surfaceOrange.geometry, 'dispose');

    visual.dispose();

    expect(spyBlue).toHaveBeenCalledTimes(1);
    expect(spyBorderBlue).toHaveBeenCalledTimes(1);
    expect(spyOrange).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
    expect(visual.getSurface('blue')).toBeNull();
    expect(visual.getSurface('orange')).toBeNull();
  });

  it('setSurfaceMaterial sustituye el material de la superficie (lo usará T23)', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(WALL);
    const replacement = new MeshBasicMaterial();
    visual.setSurfaceMaterial('blue', replacement);
    expect(visual.getSurface('blue')?.material).toBe(replacement);
    replacement.dispose();
  });

  it('setVisible cambia la visibilidad; sin show no lanza', () => {
    const scene = new Scene();
    const visual = new PortalVisual(scene);
    visual.show(WALL);
    const group = scene.children[0] as Group;
    visual.setVisible('blue', false);
    expect(group.visible).toBe(false);
    visual.setVisible('blue', true);
    expect(group.visible).toBe(true);
    visual.setVisible('orange', false);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/systems/PhysicsWorld';

describe('PhysicsWorld.queryOverlaps (T31)', () => {
  let pw: PhysicsWorld;

  beforeEach(async () => {
    pw = await PhysicsWorld.create();
  });

  const makeSensor = () =>
    pw.createBody({
      type: 'fixed',
      position: [0, 0.2, 0],
      shape: { kind: 'box', halfExtents: [0.4, 0.15, 0.4] },
      sensor: true,
      userData: { kind: 'sensor' },
    });

  const makeCube = (position: [number, number, number] = [0, 0.15, 0]) =>
    pw.createBody({
      type: 'dynamic',
      position,
      shape: { kind: 'box', halfExtents: [0.2, 0.2, 0.2] },
      userData: { kind: 'prop' },
    });

  const makePlayer = (position: [number, number, number] = [0, 0.7, 0]) =>
    pw.createBody({
      type: 'kinematic',
      position,
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      userData: { kind: 'player' },
    });

  it('devuelve el cubo dinámico dentro del sensor y lo identifica por userData', () => {
    const sensor = makeSensor();
    const cube = makeCube();
    pw.step(1 / 60);

    const hits = pw.queryOverlaps(sensor);
    expect(hits).toContain(cube);
    expect(hits.find((b) => b === cube)?.userData.kind).toBe('prop');

    pw.removeBody(cube);
    pw.removeBody(sensor);
  });

  it('sin cubo dentro devuelve []', () => {
    const sensor = makeSensor();
    pw.step(1 / 60);

    expect(pw.queryOverlaps(sensor)).toEqual([]);

    pw.removeBody(sensor);
  });

  it('con el cuerpo cinemático del jugador dentro lo devuelve', () => {
    const sensor = makeSensor();
    const player = makePlayer();
    pw.step(1 / 60);

    const hits = pw.queryOverlaps(sensor);
    expect(hits).toContain(player);
    expect(hits.find((b) => b === player)?.userData.kind).toBe('player');

    pw.removeBody(player);
    pw.removeBody(sensor);
  });

  it('nunca devuelve al propio sensor y sin duplicados (cubo + player a la vez)', () => {
    const sensor = makeSensor();
    const cube = makeCube();
    const player = makePlayer();
    pw.step(1 / 60);

    const hits = pw.queryOverlaps(sensor);
    expect(hits).not.toContain(sensor);
    expect(hits).toContain(cube);
    expect(hits).toContain(player);
    expect(new Set(hits).size).toBe(hits.length);

    pw.removeBody(player);
    pw.removeBody(cube);
    pw.removeBody(sensor);
  });

  it('al retirar los cuerpos el resultado vuelve a [] (broad-phase tras step)', () => {
    const sensor = makeSensor();
    const cube = makeCube();
    const player = makePlayer();
    pw.step(1 / 60);
    expect(pw.queryOverlaps(sensor)).toHaveLength(2);

    pw.setPose(cube, [5, 5, 5]);
    pw.setPose(player, [5, 5, 5]);
    pw.step(1 / 60);
    expect(pw.queryOverlaps(sensor)).toEqual([]);

    pw.removeBody(player);
    pw.removeBody(cube);
    pw.removeBody(sensor);
  });
});

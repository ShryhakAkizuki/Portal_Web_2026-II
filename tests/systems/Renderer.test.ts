import { describe, expect, it } from 'vitest';
import { clampPixelRatio } from '../../src/systems/Renderer';

describe('clampPixelRatio', () => {
  it('recorta valores por encima del máximo (2) por defecto', () => {
    expect(clampPixelRatio(3)).toBe(2);
  });

  it('eleva valores por debajo del mínimo (1)', () => {
    expect(clampPixelRatio(0.5)).toBe(1);
  });

  it('deja intactos los valores dentro de [1, 2]', () => {
    expect(clampPixelRatio(1.5)).toBe(1.5);
  });

  it('respeta el parámetro `max` opcional', () => {
    expect(clampPixelRatio(1.5, 1.25)).toBe(1.25);
    expect(clampPixelRatio(0.75, 1.25)).toBe(1);
  });
});

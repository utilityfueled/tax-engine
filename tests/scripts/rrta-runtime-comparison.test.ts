import { describe, expect, it } from 'vitest';
import { pairedImprovement } from '../../scripts/rrta-runtime-comparison.mts';

function attempts() {
  return Array.from({ length: 13 }, (_, block) =>
    [0, 1, 1, 0].map(interpreter => ({
      interpreter,
      block,
      elapsedUs: block === 0 ? 100 : interpreter === 0 ? 100 : 80,
      accepted: true,
    })),
  ).flat();
}

describe('retained RRTA Linux timing comparison', () => {
  it('reports the median paired improvement after the complete warm-up block', () => {
    expect(pairedImprovement(attempts())).toBe(20);
  });

  it('returns no comparison for any rejected output, including a warm-up timeout', () => {
    const rows = attempts();
    rows[0].accepted = false;
    expect(pairedImprovement(rows)).toBeNull();
    expect(pairedImprovement(attempts().slice(1))).toBeNull();
  });

  it('returns no comparison when the paired order or timing provenance changes', () => {
    const rows = attempts();
    [rows[1], rows[7]] = [rows[7], rows[1]];
    expect(pairedImprovement(rows)).toBeNull();
    const invalid = attempts();
    invalid[4].elapsedUs = Infinity;
    expect(pairedImprovement(invalid)).toBeNull();
  });
});

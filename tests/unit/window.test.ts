import { describe, it, expect } from 'vitest';
import { computeWindow, windowKeySuffix } from '../../src/wcl/window.js';

const fight = { startTime: 3587007, endTime: 4168380 }; // 581.373s

describe('computeWindow', () => {
  it('returns the whole fight when no bounds are given', () => {
    const w = computeWindow(fight);
    expect(w).toMatchObject({ startTime: 3587007, endTime: 4168380, isPartial: false });
  });

  it('converts seconds since the pull to absolute timestamps', () => {
    const w = computeWindow(fight, 0, 60);
    expect(w).toMatchObject({ startTime: 3587007, endTime: 3647007, isPartial: true });
  });

  it('accepts a start bound alone', () => {
    const w = computeWindow(fight, 120);
    expect(w).toMatchObject({ startTime: 3707007, endTime: 4168380, isPartial: true });
  });

  it('accepts an end bound alone', () => {
    const w = computeWindow(fight, undefined, 30);
    expect(w).toMatchObject({ startTime: 3587007, endTime: 3617007, isPartial: true });
  });

  it('clamps a window that runs past the end of the fight', () => {
    const w = computeWindow(fight, 0, 9999);
    expect(w).toMatchObject({ endTime: 4168380 });
  });

  it('clamps a negative start to the pull', () => {
    const w = computeWindow(fight, -30);
    expect(w).toMatchObject({ startTime: 3587007 });
  });

  it('rejects an inverted window', () => {
    const w = computeWindow(fight, 60, 30);
    expect(w).toMatchObject({ error: 'invalid_window' });
  });

  it('always reports the pull timestamp', () => {
    expect(computeWindow(fight, 10, 20)).toMatchObject({ pullTimestamp: 3587007 });
  });
});

describe('windowKeySuffix', () => {
  it('is empty for a full fight so existing cache keys are unchanged', () => {
    expect(windowKeySuffix()).toBe('');
  });

  it('distinguishes different windows', () => {
    expect(windowKeySuffix(0, 60)).not.toBe(windowKeySuffix(60, 120));
  });

  it('distinguishes an open-ended window from a full fight', () => {
    expect(windowKeySuffix(60)).not.toBe('');
  });
});

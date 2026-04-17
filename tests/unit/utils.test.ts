import { describe, it, expect } from 'vitest';
import { realmToSlug, realmToDisplay } from '../../src/utils/realm.js';
import { normalizeRegion } from '../../src/utils/region.js';

describe('realmToSlug', () => {
  it('converts spaces to hyphens and lowercases', () => {
    expect(realmToSlug('Area 52')).toBe('area-52');
    expect(realmToSlug('Bleeding Hollow')).toBe('bleeding-hollow');
  });

  it('handles already-slugified input', () => {
    expect(realmToSlug('area-52')).toBe('area-52');
  });

  it('removes special characters', () => {
    expect(realmToSlug("Mal'Ganis")).toBe('malganis');
  });

  it('trims whitespace', () => {
    expect(realmToSlug('  Illidan  ')).toBe('illidan');
  });
});

describe('realmToDisplay', () => {
  it('converts slug to title case', () => {
    expect(realmToDisplay('area-52')).toBe('Area 52');
    expect(realmToDisplay('bleeding-hollow')).toBe('Bleeding Hollow');
  });
});

describe('normalizeRegion', () => {
  it('passes valid regions through', () => {
    expect(normalizeRegion('us')).toBe('us');
    expect(normalizeRegion('EU')).toBe('eu');
  });

  it('maps aliases', () => {
    expect(normalizeRegion('na')).toBe('us');
    expect(normalizeRegion('america')).toBe('us');
    expect(normalizeRegion('europe')).toBe('eu');
  });

  it('throws on invalid region', () => {
    expect(() => normalizeRegion('oceanic')).toThrow('Invalid region');
  });
});

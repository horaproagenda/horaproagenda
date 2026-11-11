import { describe, it, expect } from 'vitest';
import { findMissingLinks } from './productLinkVerification';
describe('findMissingLinks', () => {
  it('returns nothing when all links were saved', () => {
    expect(findMissingLinks(['a', 'b'], ['b', 'a'])).toEqual([]);
  });
  it('returns the targets the database did not confirm', () => {
    expect(findMissingLinks(['a', 'b', 'c'], ['a', null])).toEqual(['b', 'c']);
  });
});

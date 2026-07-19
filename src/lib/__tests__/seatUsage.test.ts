import { describe, it, expect } from 'vitest';
import { shouldSuggestUpgrade, isSeatCapacityReached } from '../seatUsage';

describe('shouldSuggestUpgrade', () => {
  it('returns null when usage is missing', () => {
    expect(shouldSuggestUpgrade(null)).toBeNull();
    expect(shouldSuggestUpgrade(undefined)).toBeNull();
  });

  it('returns null for grandfathered accounts', () => {
    expect(shouldSuggestUpgrade({ used: 999, seat_limit: 1, available: 0, is_grandfathered: true })).toBeNull();
  });

  it('returns null when user is within seat_limit (paid, 1/1)', () => {
    expect(shouldSuggestUpgrade({ used: 1, seat_limit: 1, available: 0, is_grandfathered: false })).toBeNull();
  });

  it('returns null when user is under seat_limit (2/3)', () => {
    expect(shouldSuggestUpgrade({ used: 2, seat_limit: 3, available: 1, is_grandfathered: false })).toBeNull();
  });

  it('returns null when user is exactly at seat_limit (3/3)', () => {
    expect(shouldSuggestUpgrade({ used: 3, seat_limit: 3, available: 0, is_grandfathered: false })).toBeNull();
  });

  it('returns "over" when downgrade left user above limit (4/3)', () => {
    expect(shouldSuggestUpgrade({ used: 4, seat_limit: 3, available: 0, is_grandfathered: false })).toBe('over');
  });

  it('returns null when seat_limit is 0 (unpaid/pending)', () => {
    expect(shouldSuggestUpgrade({ used: 1, seat_limit: 0, available: 0, is_grandfathered: false })).toBeNull();
  });
});

describe('isSeatCapacityReached', () => {
  it('is false for grandfathered accounts', () => {
    expect(isSeatCapacityReached({ used: 10, seat_limit: 1, available: 0, is_grandfathered: true })).toBe(false);
  });

  it('is true when available is 0', () => {
    expect(isSeatCapacityReached({ used: 1, seat_limit: 1, available: 0, is_grandfathered: false })).toBe(true);
  });

  it('is false when there are seats available', () => {
    expect(isSeatCapacityReached({ used: 1, seat_limit: 3, available: 2, is_grandfathered: false })).toBe(false);
  });
});

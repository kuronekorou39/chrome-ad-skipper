import { describe, it, expect } from 'vitest';
import { parseRemainingSeconds, rateForRemaining } from './ad-timing';

describe('parseRemainingSeconds', () => {
  it('parses M:SS format', () => {
    expect(parseRemainingSeconds('1:30')).toBe(90);
  });

  it('parses 0:SS format', () => {
    expect(parseRemainingSeconds('0:05')).toBe(5);
  });

  it('parses double-digit minutes', () => {
    expect(parseRemainingSeconds('12:00')).toBe(720);
  });

  it('parses H:MM:SS format', () => {
    expect(parseRemainingSeconds('1:02:30')).toBe(3750);
  });

  it('returns Infinity for empty string', () => {
    expect(parseRemainingSeconds('')).toBe(Infinity);
  });

  it('returns Infinity for non-time text', () => {
    expect(parseRemainingSeconds('広告')).toBe(Infinity);
    expect(parseRemainingSeconds('Ad will end soon')).toBe(Infinity);
  });

  it('extracts time from surrounding text', () => {
    expect(parseRemainingSeconds('広告 0:15')).toBe(15);
    expect(parseRemainingSeconds('Ad 1:30 remaining')).toBe(90);
  });

  it('handles edge case 0:00', () => {
    expect(parseRemainingSeconds('0:00')).toBe(0);
  });
});

describe('rateForRemaining', () => {
  it('returns 1x for last 2 seconds (no overshoot)', () => {
    expect(rateForRemaining(0)).toBe(1);
    expect(rateForRemaining(1)).toBe(1);
    expect(rateForRemaining(2)).toBe(1);
  });

  it('returns 2x for 3-5 seconds remaining', () => {
    expect(rateForRemaining(3)).toBe(2);
    expect(rateForRemaining(4)).toBe(2);
    expect(rateForRemaining(5)).toBe(2);
  });

  it('returns 4x for 6-10 seconds remaining', () => {
    expect(rateForRemaining(6)).toBe(4);
    expect(rateForRemaining(10)).toBe(4);
  });

  it('returns maxRate for more than 10 seconds', () => {
    expect(rateForRemaining(11)).toBe(16);
    expect(rateForRemaining(60)).toBe(16);
    expect(rateForRemaining(300)).toBe(16);
  });

  it('accepts custom maxRate', () => {
    expect(rateForRemaining(30, 8)).toBe(8);
    expect(rateForRemaining(30, 4)).toBe(4);
  });

  it('ignores maxRate when ramping down', () => {
    expect(rateForRemaining(2, 8)).toBe(1);
    expect(rateForRemaining(5, 8)).toBe(2);
    expect(rateForRemaining(10, 8)).toBe(4);
  });

  it('handles Infinity (unparseable timer)', () => {
    expect(rateForRemaining(Infinity)).toBe(16);
  });
});

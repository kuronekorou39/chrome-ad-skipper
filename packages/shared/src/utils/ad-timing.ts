/**
 * Parse a "M:SS" or "H:MM:SS" ad timer string into total seconds.
 * Returns Infinity if the text cannot be parsed.
 *
 * @example
 * parseRemainingSeconds('1:30') // 90
 * parseRemainingSeconds('0:05') // 5
 * parseRemainingSeconds('1:02:30') // 3750
 * parseRemainingSeconds('invalid') // Infinity
 */
export function parseRemainingSeconds(text: string): number {
  // Match H:MM:SS or M:SS
  const hms = text.match(/(\d+):(\d{2}):(\d{2})/);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }

  const ms = text.match(/(\d+):(\d{2})/);
  if (ms) {
    return parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);
  }

  return Infinity;
}

/**
 * Calculate the appropriate playback rate based on remaining ad time.
 * Ramps down speed near the end to avoid overshooting into content.
 *
 * @param remainingSeconds Seconds remaining in the ad (use parseRemainingSeconds)
 * @param maxRate Maximum playback rate for the bulk of the ad
 * @returns Playback rate multiplier (1 = normal speed)
 */
export function rateForRemaining(remainingSeconds: number, maxRate = 16): number {
  if (remainingSeconds <= 2) return 1; // last 2s: normal speed, no overshoot
  if (remainingSeconds <= 5) return 2;
  if (remainingSeconds <= 10) return 4;
  return maxRate;
}

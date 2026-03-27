/**
 * Shared Twitch ad-break detection logic.
 * Used by StreamSwapper (PbyP swap) and LiveAdHandler (mute+speedup fallback).
 */

export function isAdBreakActive(): boolean {
  // Ad banner text ("right after this ad break")
  if (document.querySelector('[data-test-selector="ad-banner-default-text"]')) return true;
  if (document.querySelector('span.tw-c-text-overlay')) return true;
  // ax-overlay with active ad content (childElementCount > 2)
  const ax = document.querySelector('[data-a-target="ax-overlay"]');
  if (ax && ax.parentNode instanceof HTMLElement && ax.parentNode.childElementCount > 2) return true;
  return false;
}

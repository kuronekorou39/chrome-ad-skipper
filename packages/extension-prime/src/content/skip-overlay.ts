/**
 * Dark overlay shown while an ad is being fast-forwarded.
 * Covers the video area with a black screen + "広告スキップ中" text,
 * making the skip feel like a brief dark transition.
 *
 * Two modes:
 *  - Fullscreen: covers the entire viewport.
 *  - Targeted: covers only a specific element (e.g. video player).
 */

const OVERLAY_ID = 'ad-skipper-overlay';

let currentOpacity = 0.85;
let overlay: HTMLDivElement | null = null;
let timerEl: HTMLDivElement | null = null;
let targetElement: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;

function positionOverTarget(): void {
  if (!overlay || !targetElement) return;
  const rect = targetElement.getBoundingClientRect();
  Object.assign(overlay.style, {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function ensureOverlay(target?: HTMLElement): HTMLDivElement {
  if (overlay && overlay.isConnected) {
    // Update target if changed
    if (target && target !== targetElement) {
      targetElement = target;
      applyPositionMode();
    }
    return overlay;
  }

  targetElement = target ?? null;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '2147483647',
    background: `rgba(0, 0, 0, ${currentOpacity})`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: '0',
    transition: 'opacity 0.5s ease-in-out',
    pointerEvents: 'none',
  });

  applyPositionMode();

  const text = document.createElement('div');
  Object.assign(text.style, {
    color: '#888',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '18px',
    letterSpacing: '0.1em',
    userSelect: 'none',
  });
  text.textContent = '広告スキップ中';

  // Timer display (e.g. "広告 0:52")
  timerEl = document.createElement('div');
  Object.assign(timerEl.style, {
    color: '#aaa',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    marginTop: '16px',
    userSelect: 'none',
    fontVariantNumeric: 'tabular-nums',
  });

  const dots = document.createElement('div');
  dots.className = 'ad-skipper-dots';
  Object.assign(dots.style, {
    marginTop: '12px',
    display: 'flex',
    gap: '6px',
  });
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#555',
      animation: `ad-skipper-pulse 1s ease-in-out ${i * 0.2}s infinite`,
    });
    dots.appendChild(dot);
  }

  overlay.appendChild(text);
  overlay.appendChild(timerEl);
  overlay.appendChild(dots);

  // Inject animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ad-skipper-pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
  `;
  overlay.appendChild(style);

  (document.body || document.documentElement).appendChild(overlay);

  // If targeting a specific element, track its size/position changes
  if (targetElement) {
    resizeObserver = new ResizeObserver(() => positionOverTarget());
    resizeObserver.observe(targetElement);
    window.addEventListener('resize', positionOverTarget);
  }

  return overlay;
}

function applyPositionMode(): void {
  if (!overlay) return;
  if (targetElement) {
    positionOverTarget();
  } else {
    Object.assign(overlay.style, {
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
    });
  }
}

/**
 * @param target Optional element to cover. If omitted, covers the full viewport.
 */
export function showSkipOverlay(target?: HTMLElement): void {
  const el = ensureOverlay(target);
  // Force reflow then fade in
  el.style.display = 'flex';
  el.offsetHeight; // force layout
  el.style.opacity = '1';
}

export function updateSkipOverlayTimer(text: string): void {
  if (timerEl) timerEl.textContent = text;
}

export function hideSkipOverlay(): void {
  if (!overlay) return;
  overlay.style.opacity = '0';
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('resize', positionOverTarget);
  targetElement = null;
  setTimeout(() => {
    if (overlay) overlay.style.display = 'none';
  }, 500);
}

export function setOverlayOpacity(percent: number): void {
  currentOpacity = Math.max(0, Math.min(100, percent)) / 100;
  if (overlay) {
    overlay.style.background = `rgba(0, 0, 0, ${currentOpacity})`;
  }
}

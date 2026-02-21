/**
 * Full-screen dark overlay shown while an ad is being fast-forwarded.
 * Covers the video with a black screen + "広告スキップ中" text,
 * making the skip feel like a brief dark transition.
 */

const OVERLAY_ID = 'ad-skipper-overlay';

let overlay: HTMLDivElement | null = null;
let timerEl: HTMLDivElement | null = null;

function ensureOverlay(): HTMLDivElement {
  if (overlay && overlay.isConnected) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483647',
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: '0',
    transition: 'opacity 0.15s ease-in',
    pointerEvents: 'none',
  });

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
  return overlay;
}

export function showSkipOverlay(): void {
  const el = ensureOverlay();
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
  setTimeout(() => {
    if (overlay) overlay.style.display = 'none';
  }, 150);
}

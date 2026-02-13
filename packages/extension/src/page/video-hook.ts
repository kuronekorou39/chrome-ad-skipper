import { MESSAGE_SOURCE } from '@twitch-swap/shared';

/** Whether a stream swap is currently active */
let swapActive = false;

/** The sub-stream video element (Video #1) that should stay unmuted during swap */
let swapTargetVideo: HTMLVideoElement | null = null;

/** Original property descriptors, saved for cleanup */
let originalMutedDescriptor: PropertyDescriptor | undefined;
let originalVolumeDescriptor: PropertyDescriptor | undefined;

/**
 * Hook HTMLVideoElement to observe src changes and key events.
 */
export function setupVideoHook(): void {
  // Hook the src setter
  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (srcDescriptor?.set) {
    const originalSet = srcDescriptor.set;
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      ...srcDescriptor,
      set(value: string) {
        postVideoEvent('src-set', value, this);
        originalSet.call(this, value);
      },
    });
  }

  // Hook the srcObject setter
  const srcObjectDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  if (srcObjectDescriptor?.set) {
    const originalSet = srcObjectDescriptor.set;
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      ...srcObjectDescriptor,
      set(value: MediaProvider | null) {
        const url = value ? `[${value.constructor.name}]` : 'null';
        postVideoEvent('srcObject-set', url, this);
        originalSet.call(this, value);
      },
    });
  }

  // Hook play()
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (): Promise<void> {
    postVideoEvent('play', this.src || '[srcObject]', this);
    return originalPlay.call(this);
  };

  // Save original muted/volume descriptors for swap override
  originalMutedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
  originalVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');

  // Listen for swap activate/deactivate from content script
  window.addEventListener('message', handleSwapMessage);

  console.log('[VideoHook] Installed');
}

function handleSwapMessage(event: MessageEvent): void {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== MESSAGE_SOURCE.CONTENT) return;

  if (data.type === 'swap-activate') {
    activateSwapOverrides();
  } else if (data.type === 'swap-deactivate') {
    deactivateSwapOverrides();
  }
}

function activateSwapOverrides(): void {
  // Find all video elements — Video #1 is the sub-stream
  const videos = document.querySelectorAll<HTMLVideoElement>('video');
  if (videos.length < 2) return;

  swapTargetVideo = videos[1];
  swapActive = true;

  console.log('[VideoHook] Swap overrides activated');

  // Override muted setter: block Twitch from re-muting the sub-stream
  if (originalMutedDescriptor?.set) {
    const origSet = originalMutedDescriptor.set;
    const origGet = originalMutedDescriptor.get;
    Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
      configurable: true,
      enumerable: true,
      get: origGet ? function (this: HTMLMediaElement) { return origGet.call(this); } : undefined,
      set(this: HTMLMediaElement, value: boolean) {
        if (swapActive && this === swapTargetVideo && value === true) {
          // Block muting the sub-stream during swap
          return;
        }
        origSet.call(this, value);
      },
    });
  }

  // Override volume setter: block Twitch from setting volume to 0 on sub-stream
  if (originalVolumeDescriptor?.set) {
    const origSet = originalVolumeDescriptor.set;
    const origGet = originalVolumeDescriptor.get;
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      enumerable: true,
      get: origGet ? function (this: HTMLMediaElement) { return origGet.call(this); } : undefined,
      set(this: HTMLMediaElement, value: number) {
        if (swapActive && this === swapTargetVideo && value === 0) {
          // Block zeroing volume on the sub-stream during swap
          return;
        }
        origSet.call(this, value);
      },
    });
  }
}

function deactivateSwapOverrides(): void {
  swapActive = false;
  swapTargetVideo = null;

  console.log('[VideoHook] Swap overrides deactivated');

  // Restore original muted descriptor
  if (originalMutedDescriptor) {
    Object.defineProperty(HTMLMediaElement.prototype, 'muted', originalMutedDescriptor);
  }

  // Restore original volume descriptor
  if (originalVolumeDescriptor) {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', originalVolumeDescriptor);
  }
}

function postVideoEvent(event: string, src: string, el: HTMLMediaElement): void {
  window.postMessage(
    {
      source: MESSAGE_SOURCE.PAGE,
      type: 'video-event',
      data: {
        event,
        src,
        currentTime: el.currentTime,
        timestamp: Date.now(),
      },
    },
    '*'
  );
}

import { MESSAGE_SOURCE } from '@twitch-swap/shared';

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

  console.log('[VideoHook] Installed');
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

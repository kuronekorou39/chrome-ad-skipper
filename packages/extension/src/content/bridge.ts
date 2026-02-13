import { MESSAGE_SOURCE } from '@twitch-swap/shared';
import type { PageMessage } from '@twitch-swap/shared';

type MessageCallback = (msg: PageMessage) => void;

/**
 * Bridge between MAIN world page script and ISOLATED content script.
 * Uses window.postMessage for cross-world communication.
 */
export class Bridge {
  private callbacks: MessageCallback[] = [];

  constructor() {
    window.addEventListener('message', this.handleMessage);
  }

  onMessage(cb: MessageCallback): void {
    this.callbacks.push(cb);
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.callbacks = [];
  }

  private handleMessage = (event: MessageEvent): void => {
    // Only accept messages from the same window
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE.PAGE) return;

    for (const cb of this.callbacks) {
      cb(data as PageMessage);
    }
  };
}

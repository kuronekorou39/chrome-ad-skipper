import { MESSAGE_SOURCE, HLS_EXTENSIONS } from '@ad-skipper/shared';

/**
 * Hook fetch() to observe HLS-related requests made by the Twitch player.
 */
export function setupFetchHook(): void {
  const originalFetch = window.fetch;

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Only report HLS-related fetches
    if (isHlsRelated(url)) {
      window.postMessage(
        {
          source: MESSAGE_SOURCE.PAGE,
          type: 'fetch-intercept',
          data: {
            url,
            method: init?.method ?? 'GET',
            timestamp: Date.now(),
          },
        },
        '*',
      );
    }

    return originalFetch.call(this, input, init);
  };
}

function isHlsRelated(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes(HLS_EXTENSIONS.PLAYLIST) ||
    lower.includes(HLS_EXTENSIONS.SEGMENT) ||
    lower.includes('ttvnw.net') ||
    lower.includes('usher.ttvnw.net')
  );
}

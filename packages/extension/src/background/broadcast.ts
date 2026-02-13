/**
 * Manages DevTools panel connections and broadcasting.
 * Separated to avoid circular dependencies.
 */

const devToolsPorts = new Map<number, chrome.runtime.Port>();

export function registerDevToolsPort(tabId: number, port: chrome.runtime.Port): void {
  devToolsPorts.set(tabId, port);
}

export function unregisterDevToolsPort(tabId: number): void {
  devToolsPorts.delete(tabId);
}

export function broadcastToDevTools(tabId: number, message: unknown): void {
  const port = devToolsPorts.get(tabId);
  if (!port) return;
  try {
    port.postMessage(message);
  } catch (err) {
    console.error('[Broadcast] postMessage failed for', (message as { type?: string })?.type, err);
    devToolsPorts.delete(tabId);
  }
}

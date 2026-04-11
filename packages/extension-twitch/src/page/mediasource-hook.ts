import { MESSAGE_SOURCE } from '@ad-skipper/shared';
import type { MediaSourceEvent } from '@ad-skipper/shared';

function postEvent(event: MediaSourceEvent): void {
  window.postMessage(
    { source: MESSAGE_SOURCE.PAGE, type: 'mediasource-event', data: event },
    '*'
  );
}

/**
 * Hook MediaSource API to observe how Twitch uses SourceBuffers.
 */
export function setupMediaSourceHook(): void {
  const OriginalMediaSource = window.MediaSource;
  if (!OriginalMediaSource) return;

  // Hook constructor
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj: Blob | MediaSource): string {
    const url = originalCreateObjectURL.call(this, obj);
    if (obj instanceof OriginalMediaSource) {
      postEvent({
        type: 'create',
        timestamp: Date.now(),
        objectUrl: url,
        readyState: obj.readyState,
      });
    }
    return url;
  };

  // Hook addSourceBuffer
  const originalAddSourceBuffer = OriginalMediaSource.prototype.addSourceBuffer;
  OriginalMediaSource.prototype.addSourceBuffer = function (mimeType: string): SourceBuffer {
    const sb = originalAddSourceBuffer.call(this, mimeType);

    postEvent({
      type: 'addSourceBuffer',
      timestamp: Date.now(),
      mimeType,
      sourceBufferCount: this.sourceBuffers.length,
      readyState: this.readyState,
    });

    // Hook appendBuffer on the returned SourceBuffer
    const originalAppendBuffer = sb.appendBuffer.bind(sb);
    sb.appendBuffer = function (data: BufferSource): void {
      const size = data instanceof ArrayBuffer ? data.byteLength : (data as ArrayBufferView).byteLength;
      postEvent({
        type: 'appendBuffer',
        timestamp: Date.now(),
        bufferSize: size,
        readyState: (sb as unknown as { parentMediaSource?: MediaSource }).parentMediaSource?.readyState ?? 'unknown',
      });
      return originalAppendBuffer(data);
    };

    return sb;
  };

  // Hook removeSourceBuffer
  const originalRemoveSourceBuffer = OriginalMediaSource.prototype.removeSourceBuffer;
  OriginalMediaSource.prototype.removeSourceBuffer = function (sb: SourceBuffer): void {
    postEvent({
      type: 'removeSourceBuffer',
      timestamp: Date.now(),
      sourceBufferCount: this.sourceBuffers.length - 1,
      readyState: this.readyState,
    });
    return originalRemoveSourceBuffer.call(this, sb);
  };

  // Hook endOfStream
  const originalEndOfStream = OriginalMediaSource.prototype.endOfStream;
  OriginalMediaSource.prototype.endOfStream = function (error?: EndOfStreamError): void {
    postEvent({
      type: 'endOfStream',
      timestamp: Date.now(),
      readyState: this.readyState,
    });
    return originalEndOfStream.call(this, error);
  };

}

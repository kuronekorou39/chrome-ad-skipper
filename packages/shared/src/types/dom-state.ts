/** State snapshot of a <video> element */
export interface VideoElementState {
  /** Index/identifier for this video element */
  index: number;
  /** CSS selector path to this element */
  selector: string;
  /** Current src attribute */
  src: string;
  /** Whether using MediaSource (srcObject) */
  hasSrcObject: boolean;
  /** Current playback time in seconds */
  currentTime: number;
  /** Duration (Infinity for live) */
  duration: number;
  /** Whether the video is paused */
  paused: boolean;
  /** Whether the video is muted */
  muted: boolean;
  /** Current volume (0-1) */
  volume: number;
  /** Video intrinsic width */
  videoWidth: number;
  /** Video intrinsic height */
  videoHeight: number;
  /** Ready state (0-4) */
  readyState: number;
  /** Network state (0-3) */
  networkState: number;
  /** CSS display value */
  display: string;
  /** CSS visibility value */
  visibility: string;
  /** Element bounding rect */
  boundingRect: { x: number; y: number; width: number; height: number };
  /** Timestamp of this snapshot */
  timestamp: number;
}

/** A MediaSource-related event captured by the page script */
export interface MediaSourceEvent {
  /** Event type */
  type:
    | 'create'
    | 'addSourceBuffer'
    | 'removeSourceBuffer'
    | 'appendBuffer'
    | 'remove'
    | 'endOfStream'
    | 'sourceopen'
    | 'sourceclose';
  /** Timestamp */
  timestamp: number;
  /** MediaSource object URL (if available) */
  objectUrl?: string;
  /** MIME type (for addSourceBuffer) */
  mimeType?: string;
  /** Buffer size in bytes (for appendBuffer) */
  bufferSize?: number;
  /** Active source buffers count */
  sourceBufferCount?: number;
  /** MediaSource readyState */
  readyState?: string;
}

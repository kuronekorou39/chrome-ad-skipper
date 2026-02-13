/** Type of HLS-related request */
export type HlsRequestType = 'master-playlist' | 'media-playlist' | 'segment' | 'unknown';

/** A single network log entry for an HLS-related request */
export interface NetworkLogEntry {
  /** Unique ID for this entry */
  id: string;
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Detected request type */
  type: HlsRequestType;
  /** HTTP status code (0 if pending) */
  statusCode: number;
  /** Response content type */
  contentType?: string;
  /** Response size in bytes (if known) */
  responseSize?: number;
  /** Timestamp when request started */
  startTime: number;
  /** Timestamp when response completed */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Tab ID this request originated from */
  tabId: number;
  /** Whether this request was for an ad-related resource */
  isAd?: boolean;
  /** The Chrome webRequest request ID */
  requestId: string;
}

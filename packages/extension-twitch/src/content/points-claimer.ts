const SELECTOR = '.claimable-bonus__icon';
const CHECK_INTERVAL = 1000;

export interface PointsClaimerStatus {
  claimCount: number;
  log: string[];
}

const MAX_LOG_ENTRIES = 20;

/**
 * Automatically clicks the Twitch channel points "Claim Bonus" button
 * when it appears in the DOM.
 */
export class PointsClaimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private claimCount = 0;
  private eventLog: string[] = [];

  getStatus(): PointsClaimerStatus {
    return {
      claimCount: this.claimCount,
      log: [...this.eventLog],
    };
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.log('Auto-claim started');
    this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private check(): void {
    const icon = document.querySelector(SELECTOR);
    if (!icon) return;

    const button = icon.closest('button');
    if (!button) return;

    button.click();
    this.claimCount++;
    this.log(`Claimed bonus (#${this.claimCount})`);
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const entry = `[${time}] ${msg}`;
    this.eventLog.push(entry);
    if (this.eventLog.length > MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
    console.log(`[PointsClaimer] ${msg}`);
  }
}

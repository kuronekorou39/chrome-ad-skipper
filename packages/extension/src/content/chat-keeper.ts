/**
 * Keeps the chat panel always open in Twitch's internal state,
 * even when the user visually "collapses" it.
 *
 * This ensures the Picture-by-Picture (PbyP) player component
 * stays mounted, enabling stream swap during ads regardless
 * of the chat panel's visual state.
 *
 * When the user clicks the collapse button:
 *   - We intercept the click (capture phase) to prevent Twitch from handling it
 *   - We hide the right column with CSS (width: 0, overflow: hidden)
 *   - CSS var --tss-sidebar-w drives the correct player width/height
 *   - We show a floating expand button for the user to re-expand
 *
 * In theater mode, this is not needed (PbyP works regardless of chat state).
 */

const TOGGLE_BTN_SELECTOR = '[data-a-target="right-column__toggle-collapse-btn"]';
const RIGHT_COL_SELECTOR = '.right-column';
const SIDEBAR_SELECTOR = '.side-nav';

const EXPAND_SVG = `<svg viewBox="0 0 24 24" width="20" height="20">
  <path d="M21 5h-2v14h2V5Z"></path>
  <path fill-rule="evenodd" d="M8.707 5.293 2 12l6.707 6.707 1.414-1.414L5.828 13h11.586v-2H5.828l4.293-4.293-1.414-1.414Z" clip-rule="evenodd"></path>
</svg>`;

const MAX_LOG_ENTRIES = 30;

export interface ChatKeeperStatus {
  log: string[];
}

export class ChatKeeper {
  private isFakeCollapsed = false;
  private bypassIntercept = false;
  private floatingButton: HTMLElement | null = null;
  private resizeHandler: (() => void) | null = null;
  private sidebarObserver: ResizeObserver | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private eventLog: string[] = [];

  getStatus(): ChatKeeperStatus {
    return { log: [...this.eventLog] };
  }

  start(): void {
    this.injectStyles();
    this.setupClickInterceptor();
    this.waitForReady();
    this.log('Started');
  }

  stop(): void {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.sidebarObserver?.disconnect();
    this.floatingButton?.remove();
    this.styleElement?.remove();
    document.body.classList.remove('tss-chat-hidden');
    document.documentElement.style.removeProperty('--tss-sidebar-w');
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    this.eventLog.push(`[${time}] ${msg}`);
    if (this.eventLog.length > MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
    console.log(`[ChatKeeper] ${msg}`);
  }

  private isTheaterMode(): boolean {
    return document.querySelector('.right-column--theatre') !== null;
  }

  // ---------------------------------------------------------------------------
  // CSS injection — all layout is driven by the --tss-sidebar-w variable
  // ---------------------------------------------------------------------------

  private injectStyles(): void {
    this.styleElement = document.createElement('style');
    this.styleElement.id = 'tss-chat-keeper';
    this.styleElement.textContent = `
      /* Hide right column when fake-collapsed (not in theater mode) */
      body.tss-chat-hidden .right-column:not(.right-column--theatre) {
        width: 0px !important;
        min-width: 0px !important;
        max-width: 0px !important;
        padding: 0 !important;
        overflow: hidden !important;
        border: none !important;
      }

      /* Player fills viewport minus sidebar */
      body.tss-chat-hidden .persistent-player {
        width: calc(100vw - var(--tss-sidebar-w, 0px)) !important;
        height: calc((100vw - var(--tss-sidebar-w, 0px)) * 9 / 16) !important;
      }

      /* Info section margin matches player height */
      body.tss-chat-hidden .channel-root__info--with-chat,
      body.tss-chat-hidden .channel-root__info {
        margin-top: calc((100vw - var(--tss-sidebar-w, 0px)) * 9 / 16) !important;
      }

      /* Floating expand button — top-right, below Twitch nav */
      #tss-expand-chat {
        position: fixed;
        right: 0;
        top: 5rem;
        z-index: 5000;
        background: var(--color-background-base, #18181b);
        border: 1px solid var(--color-border-base, #2f2f35);
        border-right: none;
        border-radius: 0.4rem 0 0 0.4rem;
        padding: 0.8rem 0.4rem;
        cursor: pointer;
        color: var(--color-text-alt, #adadb8);
        transition: color 0.15s, background 0.15s;
        display: flex;
        align-items: center;
      }
      #tss-expand-chat:hover {
        color: var(--color-text-base, #efeff1);
        background: var(--color-background-alt, #26262c);
      }
      #tss-expand-chat svg {
        display: block;
        fill: currentColor;
      }
    `;
    (document.head || document.documentElement).appendChild(this.styleElement);
  }

  // ---------------------------------------------------------------------------
  // Sidebar width tracking — updates the CSS variable
  // ---------------------------------------------------------------------------

  private updateSidebarVar(): void {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR) as HTMLElement;
    const w = sidebar ? sidebar.getBoundingClientRect().width : 0;
    document.documentElement.style.setProperty('--tss-sidebar-w', `${w}px`);
  }

  private watchSidebar(): void {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR) as HTMLElement;
    if (!sidebar || this.sidebarObserver) return;
    this.sidebarObserver = new ResizeObserver(() => this.updateSidebarVar());
    this.sidebarObserver.observe(sidebar);
  }

  // ---------------------------------------------------------------------------
  // Click interception (capture phase on document)
  // ---------------------------------------------------------------------------

  private setupClickInterceptor(): void {
    document.addEventListener(
      'click',
      (e) => {
        if (this.bypassIntercept) return;

        const target = e.target as Element;
        if (!target?.closest) return;

        const btn = target.closest(TOGGLE_BTN_SELECTOR);
        if (!btn) return;

        // Don't intercept in theater mode — PbyP works there regardless
        if (this.isTheaterMode()) return;

        e.stopPropagation();
        e.preventDefault();

        if (this.isFakeCollapsed) {
          this.unfakeCollapse();
        } else {
          this.fakeCollapse();
        }
      },
      true, // capture phase — fires before React's delegated handler
    );
  }

  // ---------------------------------------------------------------------------
  // Initial state handling
  // ---------------------------------------------------------------------------

  private waitForReady(): void {
    let collapsedCount = 0;
    const REQUIRED_HITS = 3;

    const check = () => {
      const rightCol = document.querySelector(RIGHT_COL_SELECTOR);
      if (!rightCol) {
        collapsedCount = 0;
        setTimeout(check, 500);
        return;
      }

      // Skip in theater mode
      if (this.isTheaterMode()) {
        this.log('Theater mode detected — ChatKeeper inactive');
        return;
      }

      // If chat starts collapsed, confirm it's stable (not a React hydration flicker)
      if (rightCol.classList.contains('right-column--collapsed')) {
        collapsedCount++;
        if (collapsedCount < REQUIRED_HITS) {
          setTimeout(check, 300);
          return;
        }
        this.log('Chat starts collapsed (confirmed stable) — expanding and fake-collapsing');
        this.expandAndFakeCollapse();
        return;
      }

      // Set up handlers for future fake-collapses
      this.setupResizeHandler();
      this.watchSidebar();
    };
    setTimeout(check, 1000);
  }

  /**
   * When the page loads with chat already collapsed:
   * 1. Click the expand button to let Twitch open chat (creates PbyP)
   * 2. Poll until Twitch finishes expanding (right-column--collapsed removed)
   * 3. Then apply our CSS hide
   */
  private expandAndFakeCollapse(): void {
    const btn = document.querySelector(TOGGLE_BTN_SELECTOR) as HTMLElement;
    if (btn) {
      this.bypassIntercept = true;
      btn.click();
      this.bypassIntercept = false;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 30;
    const waitForExpanded = () => {
      attempts++;
      const rightCol = document.querySelector(RIGHT_COL_SELECTOR);
      const isExpanded = rightCol && !rightCol.classList.contains('right-column--collapsed');

      if (isExpanded || attempts >= MAX_ATTEMPTS) {
        this.applyFakeCollapse();
        this.setupResizeHandler();
        this.watchSidebar();
        if (attempts >= MAX_ATTEMPTS) {
          this.log('expandAndFakeCollapse: max attempts reached, proceeding anyway');
        }
      } else {
        setTimeout(waitForExpanded, 100);
      }
    };
    setTimeout(waitForExpanded, 100);
  }

  // ---------------------------------------------------------------------------
  // Fake collapse / expand
  // ---------------------------------------------------------------------------

  private fakeCollapse(): void {
    this.applyFakeCollapse();
    this.log('Fake-collapsed');
  }

  private unfakeCollapse(): void {
    // Just remove the class — all CSS overrides disappear cleanly,
    // Twitch's original inline styles take effect immediately.
    document.body.classList.remove('tss-chat-hidden');
    this.isFakeCollapsed = false;
    this.hideFloatingButton();

    // Trigger Twitch layout recalculation
    window.dispatchEvent(new Event('resize'));
    this.log('Fake-collapse removed — chat visible again');
  }

  private applyFakeCollapse(): void {
    this.updateSidebarVar();
    document.body.classList.add('tss-chat-hidden');
    this.isFakeCollapsed = true;
    this.showFloatingButton();
  }

  // ---------------------------------------------------------------------------
  // Resize handler — re-sync sidebar var on window resize
  // ---------------------------------------------------------------------------

  private setupResizeHandler(): void {
    if (this.resizeHandler) return;
    this.resizeHandler = () => {
      if (this.isFakeCollapsed) {
        this.updateSidebarVar();
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  // ---------------------------------------------------------------------------
  // Floating expand button
  // ---------------------------------------------------------------------------

  private showFloatingButton(): void {
    if (this.floatingButton) return;

    this.floatingButton = document.createElement('button');
    this.floatingButton.id = 'tss-expand-chat';
    this.floatingButton.setAttribute('aria-label', 'チャットを展開');
    this.floatingButton.title = 'チャットを展開';
    this.floatingButton.innerHTML = EXPAND_SVG;
    this.floatingButton.addEventListener('click', () => this.unfakeCollapse());
    document.body.appendChild(this.floatingButton);
  }

  private hideFloatingButton(): void {
    this.floatingButton?.remove();
    this.floatingButton = null;
  }
}

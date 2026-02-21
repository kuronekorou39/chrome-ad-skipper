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
 *   - We expand the persistent-player to fill the freed space
 *   - We show a floating expand button for the user to re-expand
 *
 * In theater mode, this is not needed (PbyP works regardless of chat state).
 */

const TOGGLE_BTN_SELECTOR = '[data-a-target="right-column__toggle-collapse-btn"]';
const RIGHT_COL_SELECTOR = '.right-column';
const PLAYER_SELECTOR = '.persistent-player';
const INFO_SELECTOR = '.channel-root__info--with-chat, .channel-root__info';

const EXPAND_SVG = `<svg viewBox="0 0 24 24" width="20" height="20">
  <path d="M21 5h-2v14h2V5Z"></path>
  <path fill-rule="evenodd" d="M8.707 5.293 2 12l6.707 6.707 1.414-1.414L5.828 13h11.586v-2H5.828l4.293-4.293-1.414-1.414Z" clip-rule="evenodd"></path>
</svg>`;

export class ChatKeeper {
  private isFakeCollapsed = false;
  private bypassIntercept = false;
  private savedRightColWidth = 0;
  private floatingButton: HTMLElement | null = null;
  private widthObserver: MutationObserver | null = null;
  private resizeHandler: (() => void) | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isAdjustingWidth = false;

  start(): void {
    this.injectStyles();
    this.setupClickInterceptor();
    this.waitForReady();
    console.log('[ChatKeeper] Started');
  }

  stop(): void {
    this.widthObserver?.disconnect();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.floatingButton?.remove();
    this.styleElement?.remove();
    document.body.classList.remove('tss-chat-hidden');
  }

  private log(msg: string): void {
    console.log(`[ChatKeeper] ${msg}`);
  }

  private isTheaterMode(): boolean {
    return document.querySelector('.right-column--theatre') !== null;
  }

  // ---------------------------------------------------------------------------
  // CSS injection
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

      /* Floating expand button */
      #tss-expand-chat {
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
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
    const check = () => {
      const rightCol = document.querySelector(RIGHT_COL_SELECTOR);
      if (!rightCol) {
        setTimeout(check, 500);
        return;
      }

      // Skip in theater mode
      if (this.isTheaterMode()) {
        this.log('Theater mode detected — ChatKeeper inactive');
        return;
      }

      // If chat starts collapsed, expand it then fake-collapse
      if (rightCol.classList.contains('right-column--collapsed')) {
        this.log('Chat starts collapsed — expanding and fake-collapsing');
        this.expandAndFakeCollapse();
      }

      this.setupWidthWatcher();
    };
    setTimeout(check, 1000);
  }

  /**
   * When the page loads with chat already collapsed:
   * 1. Pre-apply our hide CSS so the user doesn't see a flash
   * 2. Click the expand button to let Twitch open chat (creates PbyP)
   * 3. After Twitch finishes, adjust the player width
   */
  private expandAndFakeCollapse(): void {
    document.body.classList.add('tss-chat-hidden');
    this.isFakeCollapsed = true;

    const btn = document.querySelector(TOGGLE_BTN_SELECTOR) as HTMLElement;
    if (btn) {
      this.bypassIntercept = true;
      btn.click();
      this.bypassIntercept = false;
    }

    // Wait for Twitch to expand and render the PbyP player, then adjust layout
    setTimeout(() => {
      this.saveRightColWidth();
      this.adjustPlayerWidth();
      this.showFloatingButton();
    }, 600);
  }

  // ---------------------------------------------------------------------------
  // Fake collapse / expand
  // ---------------------------------------------------------------------------

  private fakeCollapse(): void {
    this.saveRightColWidth();
    document.body.classList.add('tss-chat-hidden');
    this.isFakeCollapsed = true;
    this.adjustPlayerWidth();
    this.showFloatingButton();
    this.log(`Fake-collapsed (saved rightCol width: ${this.savedRightColWidth}px)`);
  }

  private unfakeCollapse(): void {
    document.body.classList.remove('tss-chat-hidden');
    this.isFakeCollapsed = false;
    this.restorePlayerWidth();
    this.restoreInfoMargin();
    this.hideFloatingButton();
    this.log('Fake-collapse removed — chat visible again');
  }

  // ---------------------------------------------------------------------------
  // Player width management
  // ---------------------------------------------------------------------------

  private saveRightColWidth(): void {
    const rightCol = document.querySelector(RIGHT_COL_SELECTOR) as HTMLElement;
    if (rightCol) {
      const w = rightCol.getBoundingClientRect().width;
      if (w > 0) this.savedRightColWidth = w;
    }
  }

  /**
   * Twitch sets persistent-player width based on its internal state
   * ("chat open" → narrower width). We override to add back the
   * space freed by hiding the right column.
   */
  private adjustPlayerWidth(): void {
    if (this.isAdjustingWidth || this.savedRightColWidth <= 0) return;
    this.isAdjustingWidth = true;

    const player = document.querySelector(PLAYER_SELECTOR) as HTMLElement;
    if (!player) {
      this.isAdjustingWidth = false;
      return;
    }

    // Temporarily disconnect observer to prevent loops
    this.widthObserver?.disconnect();

    const twitchWidth =
      parseFloat(player.style.width) || player.getBoundingClientRect().width;
    const fullWidth = twitchWidth + this.savedRightColWidth;

    player.style.setProperty('width', `${fullWidth}px`, 'important');
    player.style.setProperty('transform-origin', 'center top', 'important');

    // Reconnect observer and adjust info after a frame
    requestAnimationFrame(() => {
      this.adjustInfoMargin();
      if (this.isFakeCollapsed) {
        this.reconnectWidthObserver(player);
      }
      this.isAdjustingWidth = false;
    });
  }

  private restorePlayerWidth(): void {
    const player = document.querySelector(PLAYER_SELECTOR) as HTMLElement;
    if (player) {
      player.style.removeProperty('width');
      player.style.removeProperty('transform-origin');
    }
  }

  /**
   * The info section below the player has margin-top matching the
   * player height. When we expand the player, we need to update this.
   */
  private adjustInfoMargin(): void {
    const player = document.querySelector(PLAYER_SELECTOR) as HTMLElement;
    const info = document.querySelector(INFO_SELECTOR) as HTMLElement;
    if (player && info) {
      const playerHeight = player.getBoundingClientRect().height;
      if (playerHeight > 0) {
        info.style.setProperty('margin-top', `${playerHeight}px`, 'important');
      }
    }
  }

  private restoreInfoMargin(): void {
    const info = document.querySelector(INFO_SELECTOR) as HTMLElement;
    if (info) {
      info.style.removeProperty('margin-top');
    }
  }

  // ---------------------------------------------------------------------------
  // Width watcher — re-apply our override when Twitch resets the width
  // ---------------------------------------------------------------------------

  private setupWidthWatcher(): void {
    const player = document.querySelector(PLAYER_SELECTOR) as HTMLElement;
    if (!player) return;

    this.reconnectWidthObserver(player);

    // Also handle window resize
    this.resizeHandler = () => {
      if (this.isFakeCollapsed) {
        // Twitch recalculates player width on resize; wait for it, then re-adjust
        setTimeout(() => this.adjustPlayerWidth(), 150);
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  private reconnectWidthObserver(player: HTMLElement): void {
    this.widthObserver?.disconnect();
    this.widthObserver = new MutationObserver(() => {
      if (this.isFakeCollapsed && !this.isAdjustingWidth) {
        this.adjustPlayerWidth();
      }
    });
    this.widthObserver.observe(player, {
      attributes: true,
      attributeFilter: ['style'],
    });
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

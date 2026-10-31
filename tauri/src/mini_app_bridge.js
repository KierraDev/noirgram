(() => {
  if (window.__noirgramMiniApp || window.top !== window) return;
  window.__noirgramMiniApp = true;

  const BAR_HEIGHT = 64;
  const STABLE_VIEWPORT_DELAY = 200;
  const ICON_BACK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';

  const state = {
    main: undefined,
    secondary: undefined,
    isBackVisible: false,
    barColor: undefined,
    themeBarColor: '#0b0c10',
    themeButtonColor: '#87a6df',
    themeButtonTextColor: '#0b0c10',
  };

  let ui;
  let stableViewportTimeout;

  function invoke(cmd, args) {
    const internals = window.__TAURI_INTERNALS__;
    if (!internals) return;
    internals.invoke(cmd, args).catch(() => undefined);
  }

  function receiveEvent(eventType, eventData) {
    if (eventType === 'theme_changed' && eventData && eventData.theme_params) {
      const params = eventData.theme_params;
      state.themeBarColor = params.secondary_bg_color || params.bg_color || state.themeBarColor;
      state.themeButtonColor = params.button_color || state.themeButtonColor;
      state.themeButtonTextColor = params.button_text_color || state.themeButtonTextColor;
      render();
    }

    const webView = window.Telegram && window.Telegram.WebView;
    if (webView && typeof webView.receiveEvent === 'function') {
      webView.receiveEvent(eventType, eventData);
    } else if (window.TelegramGameProxy && typeof window.TelegramGameProxy.receiveEvent === 'function') {
      window.TelegramGameProxy.receiveEvent(eventType, eventData);
    }
  }

  window.__noirgramReceiveEvent = receiveEvent;

  function isButtonShown(button) {
    return Boolean(button && button.is_visible && (String(button.text || '').trim() || button.icon_custom_emoji_id));
  }

  function getBarHeight() {
    return isButtonShown(state.main) || isButtonShown(state.secondary) ? BAR_HEIGHT : 0;
  }

  function sendViewport(isStable) {
    receiveEvent('viewport_changed', {
      width: window.innerWidth,
      height: window.innerHeight - getBarHeight(),
      is_expanded: true,
      is_state_stable: isStable,
    });
  }

  function sendSafeArea() {
    const insets = { top: 0, bottom: 0, left: 0, right: 0 };
    receiveEvent('safe_area_changed', insets);
    receiveEvent('content_safe_area_changed', insets);
  }

  function createUi() {
    if (ui) return ui;
    if (!document.documentElement) return undefined;

    const host = document.createElement('noirgram-mini-app-ui');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .bar {
          position: fixed; left: 0; right: 0; bottom: 0; height: ${BAR_HEIGHT}px;
          display: flex; gap: 8px; padding: 10px 12px;
          pointer-events: auto;
          font: 600 15px/1 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
          transform: translateY(105%);
          transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1), background-color 200ms ease-out;
        }
        .bar.shown { transform: none; }
        button {
          all: unset; flex: 1 1 0; display: none; align-items: center; justify-content: center;
          min-width: 0; padding: 0 12px; border-radius: 14px; cursor: pointer;
          overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
          transition: transform 140ms ease-out, filter 140ms ease-out, opacity 140ms ease-out;
        }
        button.shown { display: flex; }
        button:hover { filter: brightness(1.08); }
        button:active { transform: scale(0.97); }
        button:focus-visible { outline: 2px solid #87a6df; outline-offset: 2px; }
        button.disabled { opacity: 0.5; cursor: default; }
        button.loading { color: transparent !important; position: relative; }
        button.loading::after {
          content: ""; position: absolute; width: 20px; height: 20px; border-radius: 50%;
          border: 2px solid currentColor; border-color: rgba(255, 255, 255, 0.9) transparent transparent;
          animation: spin 700ms linear infinite;
        }
        .back {
          position: fixed; top: 10px; left: 10px; width: 36px; height: 36px; border-radius: 50%;
          display: grid; place-items: center; color: #f2f3f5; cursor: pointer;
          background: rgba(18, 19, 25, 0.72);
          backdrop-filter: blur(16px) saturate(180%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 6px 20px -6px rgba(0, 0, 0, 0.5);
          opacity: 0; transform: scale(0.8); pointer-events: none;
          transition: opacity 160ms ease-out, transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .back.shown { opacity: 1; transform: none; pointer-events: auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .bar, .back, button { transition-duration: 0s; }
        }
      </style>
      <div class="back" role="button" aria-label="Back" tabindex="0">${ICON_BACK}</div>
      <div class="bar"><button class="secondary" type="button"></button><button class="main" type="button"></button></div>
    `;

    const back = root.querySelector('.back');
    const bar = root.querySelector('.bar');
    const mainButton = root.querySelector('.main');
    const secondaryButton = root.querySelector('.secondary');

    back.addEventListener('click', () => receiveEvent('back_button_pressed'));
    mainButton.addEventListener('click', () => {
      if (state.main && state.main.is_active !== false) receiveEvent('main_button_pressed');
    });
    secondaryButton.addEventListener('click', () => {
      if (state.secondary && state.secondary.is_active !== false) receiveEvent('secondary_button_pressed');
    });

    document.documentElement.appendChild(host);
    ui = { back, bar, mainButton, secondaryButton };
    return ui;
  }

  function renderButton(element, params, isMain) {
    const isShown = isButtonShown(params);
    element.classList.toggle('shown', isShown);
    if (!isShown) return;

    element.textContent = String(params.text || '');
    element.classList.toggle('disabled', params.is_active === false);
    element.classList.toggle('loading', Boolean(params.is_progress_visible));
    element.style.backgroundColor = params.color || (isMain ? state.themeButtonColor : 'rgba(255, 255, 255, 0.08)');
    element.style.color = params.text_color || (isMain ? state.themeButtonTextColor : state.themeButtonColor);
  }

  function render() {
    const elements = createUi();
    if (!elements) return;

    elements.back.classList.toggle('shown', state.isBackVisible);
    renderButton(elements.mainButton, state.main, true);
    renderButton(elements.secondaryButton, state.secondary, false);

    const isReversed = state.secondary && state.secondary.position === 'right';
    elements.bar.style.flexDirection = isReversed ? 'row-reverse' : 'row';
    elements.bar.style.backgroundColor = state.barColor || state.themeBarColor;
    elements.bar.classList.toggle('shown', getBarHeight() > 0);
  }

  function parseData(eventData) {
    if (!eventData) return undefined;
    try {
      return JSON.parse(eventData);
    } catch (err) {
      return undefined;
    }
  }

  function handleLocally(eventType, data) {
    switch (eventType) {
      case 'web_app_setup_main_button':
        state.main = data;
        render();
        sendViewport(true);
        return false;
      case 'web_app_setup_secondary_button':
        state.secondary = data;
        render();
        sendViewport(true);
        return false;
      case 'web_app_setup_back_button':
        state.isBackVisible = Boolean(data && data.is_visible);
        render();
        return false;
      case 'web_app_set_bottom_bar_color':
        state.barColor = data && data.color;
        render();
        return false;
      case 'web_app_request_viewport':
        sendViewport(true);
        return true;
      case 'web_app_request_safe_area':
      case 'web_app_request_content_safe_area':
        sendSafeArea();
        return true;
      case 'web_app_expand':
        return true;
      default:
        return false;
    }
  }

  window.TelegramWebviewProxy = {
    postEvent(eventType, eventData) {
      const data = parseData(eventData);
      if (handleLocally(eventType, data)) return;
      invoke('mini_app_post_event', { eventType, eventData: eventData || '' });
    },
  };

  window.addEventListener('resize', () => {
    sendViewport(false);
    clearTimeout(stableViewportTimeout);
    stableViewportTimeout = setTimeout(() => sendViewport(true), STABLE_VIEWPORT_DELAY);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.isBackVisible) {
      event.preventDefault();
      receiveEvent('back_button_pressed');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();

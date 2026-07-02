function s(t = {}) {
  const { buttonText: o = "Fix Issue", buttonStyles: r = {} } = t;
  return {
    name: "vite-plugin-error-overlay",
    transformIndexHtml(e, n) {
      if (!(n.server !== void 0))
        return e;
      const a = `
<!-- OptiDev Error Overlay Enhancement -->
<script type="module">
(function() {
  // Only run in iframe (preview context)
  if (window.self === window.parent) {
    return;
  }

  const BUTTON_TEXT = ${JSON.stringify(o)};
  const CUSTOM_STYLES = ${JSON.stringify(r)};

  // Pulse animation keyframes (will be injected into shadow DOM)
  const pulseKeyframes = \`
    @keyframes optidev-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
        background-color: #3b82f6;
      }
      50% {
        box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
        background-color: #2563eb;
      }
    }
  \`;

  // Default button styles
  const defaultStyles = {
    padding: '12px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    width: '100%',
    transition: 'background-color 0.2s',
    animation: 'optidev-pulse 2s ease-in-out infinite',
  };

  // Merge custom styles
  const buttonStyles = { ...defaultStyles, ...CUSTOM_STYLES };

  /**
   * Extract error information from Vite's error overlay
   */
  function extractErrorInfo(overlay) {
    const shadowRoot = overlay.shadowRoot;
    if (!shadowRoot) return null;

    // Vite's error overlay structure
    const messageEl = shadowRoot.querySelector('.message-body');
    const fileEl = shadowRoot.querySelector('.file');
    const frameEl = shadowRoot.querySelector('.frame');
    const stackEl = shadowRoot.querySelector('.stack');
    const tipEl = shadowRoot.querySelector('.tip');

    // Get the plugin info if available
    const pluginEl = shadowRoot.querySelector('.plugin');

    return {
      message: messageEl?.textContent?.trim() || 'Unknown error',
      file: fileEl?.textContent?.trim() || null,
      frame: frameEl?.textContent?.trim() || null,
      stack: stackEl?.textContent?.trim() || null,
      tip: tipEl?.textContent?.trim() || null,
      plugin: pluginEl?.textContent?.trim() || null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format error for display and sending
   */
  function formatErrorMessage(errorInfo) {
    let formatted = '';

    if (errorInfo.plugin) {
      formatted += '[' + errorInfo.plugin + '] ';
    }

    formatted += errorInfo.message;

    if (errorInfo.file) {
      formatted += '\\n\\nFile: ' + errorInfo.file;
    }

    if (errorInfo.frame) {
      formatted += '\\n\\nCode:\\n' + errorInfo.frame;
    }

    if (errorInfo.tip) {
      formatted += '\\n\\nTip: ' + errorInfo.tip;
    }

    return formatted;
  }

  /**
   * Send error to parent window for fixing
   */
  function sendFixRequest(errorInfo) {
    const message = {
      type: 'OPTIDEV_FIX_ERROR',
      error: errorInfo,
      formattedMessage: formatErrorMessage(errorInfo),
    };

    try {
      window.parent.postMessage(message, '*');
      console.log('[ErrorOverlay] Sent fix request to parent:', errorInfo.message);
    } catch (e) {
      console.error('[ErrorOverlay] Failed to send fix request:', e);
    }
  }

  /**
   * Create the Fix Issue button
   */
  function createFixButton(errorInfo) {
    const button = document.createElement('button');
    button.textContent = BUTTON_TEXT;
    button.className = 'optidev-fix-button';

    // Apply styles
    Object.assign(button.style, buttonStyles);

    // Hover effect - stop animation and go deeper blue
    button.addEventListener('mouseenter', () => {
      button.style.animation = 'none';
      button.style.backgroundColor = '#1d4ed8';
    });
    button.addEventListener('mouseleave', () => {
      button.style.animation = 'optidev-pulse 2s ease-in-out infinite';
      button.style.backgroundColor = buttonStyles.backgroundColor || '#3b82f6';
    });

    // Click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Visual feedback
      const originalText = button.textContent;
      button.textContent = 'Sending...';
      button.disabled = true;
      button.style.animation = 'none';

      sendFixRequest(errorInfo);

      // Show "Sent to AI" state, re-enable after 10 seconds
      setTimeout(() => {
        button.textContent = 'Sent to AI';
        button.style.backgroundColor = '#10b981';

        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
          button.style.backgroundColor = buttonStyles.backgroundColor || '#3b82f6';
          button.style.animation = 'optidev-pulse 2s ease-in-out infinite';
        }, 10000);
      }, 300);
    });

    return button;
  }

  /**
   * Create a container for buttons at bottom of overlay
   */
  function createButtonContainer() {
    const container = document.createElement('div');
    container.className = 'optidev-button-container';
    container.style.cssText = \`
      display: flex;
      flex-direction: column;
      padding: 16px 0 0 0;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      margin-top: 16px;
    \`;
    return container;
  }

  /**
   * Enhance Vite error overlay with Fix button
   */
  function enhanceErrorOverlay(overlay) {
    const shadowRoot = overlay.shadowRoot;
    if (!shadowRoot) return;

    // Check if already enhanced
    if (shadowRoot.querySelector('.optidev-fix-button')) {
      return;
    }

    // Inject keyframes into shadow DOM
    const styleEl = document.createElement('style');
    styleEl.textContent = pulseKeyframes;
    shadowRoot.appendChild(styleEl);

    // Extract error info
    const errorInfo = extractErrorInfo(overlay);
    if (!errorInfo) return;

    // Find the window element (main container in Vite overlay)
    const windowEl = shadowRoot.querySelector('.window');
    if (!windowEl) return;

    // Create button container
    const container = createButtonContainer();

    // Create Fix button
    const fixButton = createFixButton(errorInfo);
    container.appendChild(fixButton);

    // Add container to overlay
    windowEl.appendChild(container);

    console.log('[ErrorOverlay] Enhanced error overlay with Fix button');
  }

  /**
   * Watch for Vite error overlay to appear
   */
  function watchForOverlay() {
    // MutationObserver to detect when vite-error-overlay is added
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'VITE-ERROR-OVERLAY') {
            // Wait a bit for shadow DOM to be ready
            setTimeout(() => {
              enhanceErrorOverlay(node);
            }, 100);
          }
        }
      }
    });

    // Observe document body for added nodes
    observer.observe(document.body, {
      childList: true,
      subtree: false
    });

    // Also check if overlay already exists
    const existingOverlay = document.querySelector('vite-error-overlay');
    if (existingOverlay) {
      setTimeout(() => {
        enhanceErrorOverlay(existingOverlay);
      }, 100);
    }

    console.log('[ErrorOverlay] Watching for Vite error overlay');
  }

  // Start watching when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForOverlay);
  } else {
    watchForOverlay();
  }
})();
<\/script>`;
      return e.replace("</head>", `${a}
</head>`);
    }
  };
}
export {
  s as default,
  s as errorOverlayPlugin
};

(function (global) {
  async function refreshLabels() {
    try {
      const result = await browser.runtime.sendMessage({ type: 'get-ticket-labels' });
      global.FaveoLabels.TicketLabels.render(result?.ticketLabels || {});
    } catch (error) {
      console.error('No se pudieron actualizar las etiquetas de Faveo:', error);
    }
  }

  function observeTicketList() {
    if (!document.body) return;
    let refreshTimer = null;
    const observer = new MutationObserver(() => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshLabels(), 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function registerMessages() {
    browser.runtime.onMessage.addListener(message => {
      if (message?.type === 'labels-updated') {
        void refreshLabels();
        return null;
      }
      if (message?.type === 'get-current-ticket') return global.FaveoLabels.TicketDom.getCurrentTicketNumber();
      return null;
    });
  }

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.ticketLabels || changes.ticketLabelsEncrypted)) void refreshLabels();
  });

  registerMessages();
  browser.runtime.sendMessage({ type: 'inject-label-css' }).catch(() => {});
  observeTicketList();
  void refreshLabels();
})(globalThis);

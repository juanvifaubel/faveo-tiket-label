(function (global) {
  async function refreshLabels() {
    const { ticketLabels = {} } = await browser.storage.local.get('ticketLabels');
    global.FaveoLabels.TicketLabels.render(global.FaveoLabels.Core.normalizeLabels(ticketLabels));
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
    if (areaName === 'local' && changes.ticketLabels) void refreshLabels();
  });

  registerMessages();
  browser.runtime.sendMessage({ type: 'inject-label-css' }).catch(() => {});
  observeTicketList();
  void refreshLabels();
})(globalThis);

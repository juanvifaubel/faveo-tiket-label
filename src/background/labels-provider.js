(function () {
  async function getTicketLabels(sender) {
    try {
      const { calendarSettings = {} } = await browser.storage.local.get('calendarSettings');
      if (sender.tab?.id === undefined
        || globalThis.FaveoLabels.Core.normalizeBaseUrl(sender.url) !== calendarSettings.faveoUrl) {
        return { ticketLabels: {} };
      }
      const { ticketLabels = {}, ticketLabelsEncrypted } = await browser.storage.local.get([
        'ticketLabels',
        'ticketLabelsEncrypted'
      ]);
      if (!ticketLabelsEncrypted) {
        return { ticketLabels: globalThis.FaveoLabels.Core.normalizeLabels(ticketLabels) };
      }
      if (!(await globalThis.FaveoLabels.SecureStore.isUnlocked())) {
        return { ticketLabels: {} };
      }
      const decrypted = await globalThis.FaveoLabels.SecureStore.decryptData(ticketLabelsEncrypted);
      return { ticketLabels: globalThis.FaveoLabels.Core.normalizeLabels(decrypted) };
    } catch (error) {
      console.error('No se pudieron descifrar las etiquetas para Faveo:', error);
      return { ticketLabels: {} };
    }
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'get-ticket-labels') return undefined;
    return getTicketLabels(sender);
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session' || !changes.calendarSecretsKey) return;
    void browser.runtime.sendMessage({ type: 'labels-updated' }).catch(error => {
      if (!/Receiving end does not exist|Could not establish connection/.test(error.message)) {
        console.error('No se pudo actualizar el estado cifrado en Faveo:', error);
      }
    });
  });
})();

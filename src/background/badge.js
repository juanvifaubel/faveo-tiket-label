(function () {
  const badgeColor = '#d52b00';
  const oneDayMs = 24 * 60 * 60 * 1000;

  async function updateBadge() {
    const { ticketLabels = {}, ticketLabelsEncrypted } = await browser.storage.local.get([
      'ticketLabels',
      'ticketLabelsEncrypted'
    ]);
    let labels = ticketLabels;
    if (ticketLabelsEncrypted) {
      labels = await globalThis.FaveoLabels.SecureStore.isUnlocked()
        ? await globalThis.FaveoLabels.SecureStore.decryptData(ticketLabelsEncrypted)
        : {};
    }
    const now = Date.now();
    const upcomingCount = Object.values(globalThis.FaveoLabels.Core.normalizeLabels(labels)).flat().filter(appointment => {
      const timestamp = new Date(appointment.appointmentAt).getTime();
      return timestamp >= now && timestamp <= now + oneDayMs;
    }).length;

    await browser.action.setBadgeText({ text: upcomingCount ? String(upcomingCount) : '' });
    await browser.action.setBadgeBackgroundColor({ color: badgeColor });
  }

  function reportBadgeError(error) {
    console.error('No se pudo actualizar el contador de citas:', error);
  }

  browser.runtime.onStartup.addListener(() => void updateBadge().catch(reportBadgeError));
  browser.runtime.onInstalled.addListener(() => void updateBadge().catch(reportBadgeError));
  browser.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName === 'local' && (changes.ticketLabels || changes.ticketLabelsEncrypted))
      || (areaName === 'session' && changes.calendarSecretsKey)) {
      void updateBadge().catch(reportBadgeError);
    }
  });

  void updateBadge().catch(reportBadgeError);
})();

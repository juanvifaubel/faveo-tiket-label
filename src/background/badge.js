(function () {
  const badgeColor = '#d52b00';
  const oneDayMs = 24 * 60 * 60 * 1000;

  async function updateBadge() {
    const { ticketLabels = {} } = await browser.storage.local.get('ticketLabels');
    const now = Date.now();
    const upcomingCount = Object.values(globalThis.FaveoLabels.Core.normalizeLabels(ticketLabels)).flat().filter(appointment => {
      const timestamp = new Date(appointment.appointmentAt).getTime();
      return timestamp >= now && timestamp <= now + oneDayMs;
    }).length;

    await browser.action.setBadgeText({ text: upcomingCount ? String(upcomingCount) : '' });
    await browser.action.setBadgeBackgroundColor({ color: badgeColor });
  }

  browser.runtime.onStartup.addListener(() => void updateBadge());
  browser.runtime.onInstalled.addListener(() => void updateBadge());
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.ticketLabels) void updateBadge();
  });

  void updateBadge();
})();

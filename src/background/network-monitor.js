(function () {
  const alarmName = 'faveo-network-monitor';
  const statusKey = 'faveoNetworkOnline';
  const healthCheckUrl = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

  async function checkConnection() {
    const { calendarSettings = {} } = await browser.storage.local.get('calendarSettings');
    if (calendarSettings.mode !== 'api') {
      await browser.storage.session.remove(statusKey);
      return;
    }
    const storedStatus = await browser.storage.session.get(statusKey);
    const lastOnlineState = typeof storedStatus[statusKey] === 'boolean' ? storedStatus[statusKey] : null;

    let online = false;
    try {
      await fetch(healthCheckUrl, { method: 'GET', cache: 'no-store' });
      online = true;
    } catch {
      online = false;
    }

    if (lastOnlineState === false && online) {
      await browser.notifications.create({
        type: 'basic',
        title: 'Faveo: conexión recuperada',
        message: 'Vuelve a abrir la extensión para sincronizar las citas pendientes.',
        iconUrl: browser.runtime.getURL('icons/icon-48.png')
      }).catch(error => console.error('No se pudo notificar la recuperación de red:', error));
    } else if (lastOnlineState === true && !online) {
      await browser.notifications.create({
        type: 'basic',
        title: 'Faveo: sin conexión',
        message: 'Las citas nuevas se conservarán localmente y se sincronizarán al recuperar la conexión.',
        iconUrl: browser.runtime.getURL('icons/icon-48.png')
      }).catch(error => console.error('No se pudo notificar la pérdida de red:', error));
    }
    await browser.storage.session.set({ [statusKey]: online });
  }

  async function startMonitoring() {
    const { calendarSettings = {} } = await browser.storage.local.get('calendarSettings');
    if (calendarSettings.mode !== 'api') {
      await browser.storage.session.remove(statusKey);
      await browser.alarms.clear(alarmName);
      return;
    }
    await browser.alarms.create(alarmName, { delayInMinutes: 1, periodInMinutes: 1 });
    await checkConnection();
  }

  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === alarmName) {
      void checkConnection().catch(error => console.error('Falló la comprobación de red:', error));
    }
  });
  browser.runtime.onStartup.addListener(() => {
    void startMonitoring().catch(error => console.error('No se pudo iniciar el monitor de red:', error));
  });
  browser.runtime.onInstalled.addListener(() => {
    void startMonitoring().catch(error => console.error('No se pudo iniciar el monitor de red:', error));
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.calendarSettings) return;
    if (changes.calendarSettings.newValue?.mode === 'api') {
      void startMonitoring().catch(error => console.error('No se pudo iniciar el monitor de red:', error));
      return;
    }
    void Promise.all([
      browser.storage.session.remove(statusKey),
      browser.alarms.clear(alarmName)
    ]).catch(error => console.error('No se pudo detener el monitor de red:', error));
  });
  void startMonitoring().catch(error => console.error('No se pudo iniciar el monitor de red:', error));
})();

(function () {
  async function registerContentScripts() {
    try {
      const { calendarSettings = {} } = await browser.storage.local.get('calendarSettings');
      await globalThis.FaveoLabels.ContentRegistration.sync(calendarSettings.faveoUrl);
    } catch (error) {
      console.error('No se pudieron registrar los scripts de Faveo:', error);
    }
  }

  // Firefox no siempre aplica el CSS de los scripts registrados dinámicamente, así que se inyecta de forma explícita.
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'inject-label-css' || !sender.tab) return undefined;
    return browser.scripting.insertCSS({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] },
      files: ['src/content/labels.css']
    });
  });

  browser.runtime.onStartup.addListener(() => void registerContentScripts());
  browser.runtime.onInstalled.addListener(() => void registerContentScripts());
  void registerContentScripts();
})();

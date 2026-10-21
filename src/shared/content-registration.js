(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const scriptId = 'faveo-content';

  // Registra los scripts de contenido solo en el origen de Faveo elegido por el usuario.
  async function sync(baseUrl) {
    const origin = extension.Core.normalizeBaseUrl(baseUrl);
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [scriptId] });
    if (existing.length) await browser.scripting.unregisterContentScripts({ ids: [scriptId] });
    if (!origin) return false;
    if (!await browser.permissions.contains({ origins: [`${origin}/*`] })) return false;

    await browser.scripting.registerContentScripts([{
      id: scriptId,
      matches: [`${origin}/*`],
      js: [
        'src/shared/core.js',
        'src/content/ticket-dom.js',
        'src/content/ticket-labels.js',
        'src/content/controller.js'
      ],
      css: ['src/content/labels.css'],
      runAt: 'document_idle',
      persistAcrossSessions: true
    }]);
    return true;
  }

  extension.ContentRegistration = Object.freeze({ sync });
})(globalThis);

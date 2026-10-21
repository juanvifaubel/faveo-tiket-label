(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const Core = extension.Core;
  const retryDelayMs = 500;
  const waitingMessage = 'Buscando el número del ticket en la ficha abierta…';

  // Se inyecta en la página, así que debe ser autónoma (no puede usar nada de fuera).
  function extractTicketNumberFromDom() {
    const title = document.querySelector('#tickets-index .timeline_title, #ticket-timeline .timeline_title, .timeline_title');
    const titleNumber = title?.textContent.match(/(?:#|ticket)\s*:?\s*([0-9]+)/i)?.[1] || title?.textContent.match(/([0-9]+)/i)?.[1];
    if (titleNumber) return titleNumber;

    const activeRow = document.querySelector('#tickets-expanded tr.active_ticket, #ticket-list-body tr.active_ticket');
    const numberNode = activeRow?.querySelector('.ticket-no, .ticket_no, .ticket-number, .ticket_number, [data-ticket-number], [data-ticket-id], [data-pjax]');
    const value = numberNode?.getAttribute('data-ticket-number')
      || numberNode?.getAttribute('data-ticket-id')
      || numberNode?.textContent
      || numberNode?.getAttribute('data-pjax')
      || '';
    return value.match(/(?:#|ticket)\s*:?\s*([0-9]+)/i)?.[1] || value.match(/([0-9]+)/i)?.[1] || '';
  }

  async function readTicketNumberFromPage(tabId) {
    try {
      const messageNumber = Core.normalizeTicketNumber(await browser.tabs.sendMessage(tabId, { type: 'get-current-ticket' }));
      if (messageNumber) return messageNumber;
    } catch {
      // La lectura directa del DOM de abajo también funciona si el content script aún no está listo.
    }

    const [result] = await browser.scripting.executeScript({ target: { tabId }, func: extractTicketNumberFromDom });
    return Core.normalizeTicketNumber(result?.result);
  }

  // Busca el número del ticket de la pestaña activa y reintenta hasta encontrarlo o cancelar.
  // onFound(ticketNumber) se llama al encontrarlo; onProgress(message, isError) informa mientras se busca.
  function create({ onFound, onProgress }) {
    let timer = null;
    let cancelled = false;

    async function search(tabId) {
      if (cancelled) return;
      let ticketNumber = '';
      let lookupError = '';

      try {
        ticketNumber = await readTicketNumberFromPage(tabId);
      } catch (error) {
        lookupError = error.message || 'No se recibió respuesta de la ficha.';
      }

      if (cancelled) return;
      if (ticketNumber) {
        onFound(ticketNumber);
        return;
      }
      onProgress(lookupError ? `No se pudo leer la ficha de Faveo: ${lookupError}` : waitingMessage, Boolean(lookupError));
      timer = window.setTimeout(() => void search(tabId), retryDelayMs);
    }

    function start(tabId) {
      cancelled = false;
      onProgress(waitingMessage, false);
      void search(tabId);
    }

    function cancel() {
      cancelled = true;
      window.clearTimeout(timer);
    }

    return { start, cancel };
  }

  extension.TicketReader = Object.freeze({ create });
})(globalThis);

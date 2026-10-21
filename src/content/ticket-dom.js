(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const ticketSelectors = [
    '.ticket-no', '.ticket_no', '.ticket-number', '.ticket_number', '.ticket-id', '.ticket_id',
    '.ticketNo', '.ticketNumber', '#ticket-number', '#ticket-no', '#ticket-id', '#ticket_id',
    '#ticket_number', '#ticket_no', '#ticketId', '#ticketNumber', 'input[name="ticket_number"]',
    'input[name="ticket_id"]', '[data-pjax]', '[data-ticket-number]', '[data-ticket-id]', '[data-ticket-no]'
  ].join(', ');

  function getTicketNumber(element) {
    if (!element) return '';
    const ticketNode = element.matches?.(ticketSelectors) ? element : element.querySelector(ticketSelectors);
    if (ticketNode) {
      const dataNumber = ticketNode.getAttribute('data-ticket-number')
        || ticketNode.getAttribute('data-ticket-id')
        || ticketNode.getAttribute('data-ticket-no');
      const pjaxNumber = ticketNode.getAttribute('data-pjax');
      const textNumber = ticketNode.textContent.match(/#?([A-Z0-9]+-\d+)/i);
      const prefixedNumber = ticketNode.textContent.match(/(?:ticket\s*(?:number|no|id)?\s*[:#]?|#)\s*([A-Z0-9-]*\d+)/i);
      const directText = ticketNode.matches('.ticket-no, .ticket_no, .ticket-number, .ticket_number, .ticket-id, .ticket_id, .ticketNo, .ticketNumber, #ticket-number, #ticket-no, #ticket-id, #ticket_id, #ticket_number, #ticket_no, #ticketId, #ticketNumber, input[name="ticket_number"], input[name="ticket_id"]')
        ? (ticketNode.value || ticketNode.getAttribute('value') || ticketNode.textContent)
        : '';
      return extension.Core.normalizeTicketNumber(dataNumber || textNumber?.[1] || prefixedNumber?.[1] || pjaxNumber || directText);
    }

    const text = element.textContent.replace(/\s+/g, ' ').trim();
    const bracketNumber = text.match(/\[\s*#?\s*([A-Z0-9]+-\d+|\d+)\s*\]/i);
    if (bracketNumber) return extension.Core.normalizeTicketNumber(bracketNumber[1]);
    const namedNumber = text.match(/(?:ticket|solicitud|caso)\s*(?:number|no|id|n[.º°]?)?\s*[:#-]?\s*([A-Z0-9-]*\d+)/i);
    if (namedNumber) return extension.Core.normalizeTicketNumber(namedNumber[1]);
    const hashNumber = text.match(/#\s*([A-Z0-9]+-\d+|\d+)/i);
    return extension.Core.normalizeTicketNumber(hashNumber?.[1]);
  }

  function getCurrentTicketNumber() {
    const title = document.querySelector('#tickets-index .timeline_title, #ticket-timeline .timeline_title, .timeline_title');
    const numberAfterHash = title?.textContent.match(/#(?:[A-Z0-9]+-)?(\d+)/i)?.[1];
    if (numberAfterHash) return numberAfterHash;

    const activeRow = document.querySelector('#tickets-expanded tr.active_ticket, #ticket-list-body tr.active_ticket');
    const detailRoot = document.querySelector('#ticket-timeline, .timeline_details, #ticket-details, .ticket-details, .ticket-view');
    const fallbackTitle = document.querySelector('.ticket-title, .ticket_title');
    const routeMatch = `${location.pathname}${location.hash}`.match(/(?:tickets?|ticket(?:s)?)(?:\/|%2f)(?:view\/|detail\/|show\/)?(\d+)(?:\/|\b|$)/i);
    const searchParams = new URLSearchParams(location.search);
    const queryNumber = searchParams.get('ticket_id') || searchParams.get('ticketId') || searchParams.get('ticket') || '';
    const firstRow = document.querySelector('#tickets-expanded tbody tr, #ticket-list-body tr');
    const contextNumber = detailRoot?.textContent.match(/(?:ticket|solicitud|caso)\s*(?:n[.º°]?)?\s*#?\s*([A-Z0-9-]*\d+)/i)?.[1];

    return getTicketNumber(activeRow)
      || getTicketNumber(detailRoot)
      || getTicketNumber(fallbackTitle)
      || extension.Core.normalizeTicketNumber(contextNumber)
      || extension.Core.normalizeTicketNumber(routeMatch?.[1] || queryNumber)
      || getTicketNumber(firstRow);
  }

  extension.TicketDom = Object.freeze({ getTicketNumber, getCurrentTicketNumber });
})(globalThis);

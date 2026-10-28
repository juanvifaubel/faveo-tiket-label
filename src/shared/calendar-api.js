(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const Core = extension.Core;
  const calendarsUrl = 'https://www.googleapis.com/calendar/v3';
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  let serverTimeOffset = null;

  function updateServerClock(response) {
    const serverTime = Date.parse(response.headers.get('Date') || '');
    if (!Number.isNaN(serverTime)) serverTimeOffset = serverTime - Date.now();
  }

  function buildRequestError(status, message) {
    const error = new Error(message || `Google Calendar respondió con HTTP ${status}.`);
    error.status = status;
    return error;
  }

  const invalidGrantMessage = 'Google rechazó el Refresh token. Puede haber caducado, haberse revocado o pertenecer a otro cliente OAuth. Autoriza de nuevo la cuenta y guarda el nuevo Refresh token.';
  const unauthorizedMessage = 'Google rechazó el Access token renovado. Comprueba el cliente OAuth, el Refresh token y el permiso calendar.';

  // --- Autenticación ---

  async function getAccessToken(settings) {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        refresh_token: settings.refreshToken,
        grant_type: 'refresh_token'
      }).toString()
    });
    updateServerClock(response);
    const renewalError = `No se pudo renovar el Access token (HTTP ${response.status}).`;

    let tokenResponse;
    try {
      tokenResponse = await response.json();
    } catch {
      throw buildRequestError(response.status, renewalError);
    }

    if (!response.ok) {
      const message = tokenResponse.error === 'invalid_grant'
        ? invalidGrantMessage
        : tokenResponse.error_description || renewalError;
      throw buildRequestError(response.status, message);
    }
    if (!tokenResponse.access_token) throw new Error('Google no devolvió un Access token.');
    return tokenResponse.access_token;
  }

  // --- Petición base a la API de eventos ---

  function getCalendarId(settings) {
    const calendarId = (settings.calendarId || '').trim();
    if (!calendarId) throw new Error('Indica el ID del calendario de destino en Preferencias.');
    return calendarId;
  }

  function buildEventsUrl(calendarId, eventId, query) {
    const eventsUrl = `${calendarsUrl}/calendars/${encodeURIComponent(calendarId)}/events`;
    const url = new URL(eventId ? `${eventsUrl}/${encodeURIComponent(eventId)}` : eventsUrl);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    return url;
  }

  async function readErrorMessage(response) {
    try {
      const error = await response.json();
      if (error.error?.message) return error.error.message;
    } catch {
      // La respuesta no es JSON: se mantiene el mensaje basado en el estado.
    }
    return `Google Calendar respondió con HTTP ${response.status}.`;
  }

  async function request(settings, method, eventId = '', body, query = {}, accessTokenOverride = '') {
    const calendarId = getCalendarId(settings);
    const accessToken = accessTokenOverride || await getAccessToken(settings);
    const url = buildEventsUrl(calendarId, eventId, query);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    updateServerClock(response);

    if (response.status === 204) return null;
    if (method === 'DELETE' && response.status === 404) return null;
    if (response.status === 401) throw buildRequestError(response.status, unauthorizedMessage);
    if (!response.ok) throw buildRequestError(response.status, await readErrorMessage(response));
    return response.json();
  }

  // --- Lectura de eventos y disponibilidad ---

  function getEventInterval(event) {
    if (event.start?.date && event.end?.date) {
      return { start: Core.parseDateKey(event.start.date), end: Core.parseDateKey(event.end.date) };
    }
    const start = new Date(event.start?.dateTime || '');
    const end = new Date(event.end?.dateTime || '');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end };
  }

  async function listEventsBetween(settings, timeMin, timeMax, accessToken = '') {
    const events = [];
    let pageToken = '';

    do {
      const query = {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500'
      };
      if (pageToken) query.pageToken = pageToken;
      const result = await request(settings, 'GET', '', null, query, accessToken);
      events.push(...(result.items || []));
      pageToken = result.nextPageToken || '';
    } while (pageToken);

    return events;
  }

  function listEventsForDay(settings, dateKey) {
    const startOfDay = Core.parseDateKey(dateKey);
    const endOfDay = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), startOfDay.getDate() + 1);
    return listEventsBetween(settings, startOfDay, endOfDay);
  }

  // Reconstruye las citas a partir de los eventos del calendario de destino.
  // Devuelve una lista plana: un ticket puede tener varios eventos.
  // Incluye 30 días atrás para recuperar también las citas recientes ya pasadas.
  async function listTicketAppointments(settings, daysAhead = 90, daysBack = 30) {
    const accessToken = await getAccessToken(settings);
    const today = getNow();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack);
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysAhead);
    const events = await listEventsBetween(settings, from, to, accessToken);
    const appointments = [];

    events.forEach(event => {
      if (event.status === 'cancelled' || !event.start?.dateTime || !event.end?.dateTime) return;
      const ticketNumber = (event.description || '').match(/^Ticket:\s*#?(\d+)\s*$/im)?.[1];
      if (!ticketNumber) return;
      const start = new Date(event.start.dateTime);
      const end = new Date(event.end.dateTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      appointments.push({
        ticketNumber,
        appointmentAt: Core.buildAppointmentValue(Core.toDateKey(start), time),
        durationMinutes: Math.round((end - start) / 60000),
        calendarEventId: event.id
      });
    });

    return { appointments, from, to };
  }

  function hasOverlap(events, start, end, excludedEventId = '') {
    return events.some(event => {
      if (event.id === excludedEventId || event.status === 'cancelled') return false;
      const interval = getEventInterval(event);
      return interval && interval.start < end && interval.end > start;
    });
  }

  function getNow() {
    return new Date(Date.now() + (serverTimeOffset ?? 0));
  }

  // --- Escritura de eventos ---

  function getEventTimes(appointmentAt, durationMinutes) {
    const start = new Date(appointmentAt);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return {
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    };
  }

  async function getStableEventId(appointmentId) {
    const identity = String(appointmentId || crypto.randomUUID());
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `a${hex}`;
  }

  async function createEvent(settings, appointmentAt, ticketNumber, durationMinutes, appointmentId) {
    const eventId = await getStableEventId(appointmentId);
    const eventBody = {
      ...Core.getEventDetails(ticketNumber, settings.faveoUrl, settings.ticketPath),
      ...getEventTimes(appointmentAt, durationMinutes),
      id: eventId,
      extendedProperties: { private: { faveoTicketLabelId: String(appointmentId || '') } }
    };
    let event;
    try {
      event = await request(settings, 'POST', '', eventBody);
    } catch (error) {
      if (error.status !== 409) throw error;
      event = await request(settings, 'GET', eventId);
      if (event.extendedProperties?.private?.faveoTicketLabelId !== String(appointmentId || '')) {
        throw new Error('Ya existe un evento con el identificador de esta cita, pero no se pudo confirmar que sea el correcto.');
      }
    }
    if (!event?.id) throw new Error('Google creó el evento, pero no devolvió su identificador.');
    return event.id;
  }

  async function updateEvent(settings, eventId, appointmentAt, durationMinutes, ticketNumber) {
    const existingEvent = await request(settings, 'GET', eventId);
    // Reescribe las líneas del ticket y del enlace; conserva cualquier otra línea añadida a mano.
    const otherLines = (existingEvent.description || '').split(/\r?\n/).filter(line => (
      !/^Ticket:\s*#?\d+\s*$/i.test(line) && !/^Enlace del ticket:/i.test(line)
    ));
    const { description: ticketLines } = Core.getEventDetails(ticketNumber, settings.faveoUrl, settings.ticketPath);
    const description = [ticketLines, ...otherLines].filter(Boolean).join('\n');
    await request(settings, 'PATCH', eventId, {
      ...getEventTimes(appointmentAt, durationMinutes),
      description
    });
  }

  async function deleteEvent(settings, eventId) {
    await request(settings, 'DELETE', eventId);
  }

  extension.CalendarApi = Object.freeze({
    getAccessToken,
    request,
    listEventsForDay,
    listTicketAppointments,
    hasOverlap,
    getNow,
    createEvent,
    updateEvent,
    deleteEvent
  });
})(globalThis);

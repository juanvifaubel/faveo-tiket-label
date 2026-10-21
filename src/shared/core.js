(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};

  function normalizeTicketNumber(value) {
    const match = String(value || '').trim().replace(/[?#].*$/, '').match(/(\d+)$/);
    return match ? match[1] : '';
  }

  function sortAppointments(appointments) {
    return [...appointments].sort((first, second) => String(first.appointmentAt).localeCompare(String(second.appointmentAt)));
  }

  function normalizeAppointment(value) {
    if (!value || typeof value !== 'object' || !value.appointmentAt) return null;
    return {
      ...value,
      id: value.id || value.calendarEventId || crypto.randomUUID(),
      appointmentAt: String(value.appointmentAt),
      durationMinutes: value.durationMinutes || 15,
      calendarEventId: value.calendarEventId || ''
    };
  }

  // Formato: { [número de ticket]: [cita, ...] }, con las citas de cada ticket ordenadas por fecha.
  function normalizeLabels(storedLabels) {
    const normalized = {};
    Object.entries(storedLabels || {}).forEach(([key, value]) => {
      const ticketNumber = normalizeTicketNumber(key);
      if (!ticketNumber) return;
      const appointments = (Array.isArray(value) ? value : [value]).map(normalizeAppointment).filter(Boolean);
      if (appointments.length) normalized[ticketNumber] = sortAppointments([...(normalized[ticketNumber] || []), ...appointments]);
    });
    return normalized;
  }

  function toDateKey(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function buildAppointmentValue(dateKey, time) {
    return dateKey && time ? `${dateKey}T${time}:00` : '';
  }

  function formatAppointment(value) {
    const appointment = new Date(value);
    if (Number.isNaN(appointment.getTime())) return '';
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(appointment);
  }

  function formatCalendarDate(value) {
    const date = new Date(value);
    const pad = part => String(part).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
  }

  function normalizeBaseUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
    } catch {
      return '';
    }
  }

  const defaultTicketPath = '/thread/{ticket}';

  function normalizeTicketPath(value) {
    const path = String(value || '').trim();
    if (!path || !path.includes('{ticket}')) return defaultTicketPath;
    return path.startsWith('/') ? path : `/${path}`;
  }

  function buildTicketUrl(baseUrl, ticketPath, ticketNumber) {
    const origin = normalizeBaseUrl(baseUrl);
    if (!origin) return '';
    return origin + normalizeTicketPath(ticketPath).replace('{ticket}', encodeURIComponent(ticketNumber));
  }

  function hasApiConfig(settings) {
    return Boolean(settings.clientId && settings.clientSecret && settings.refreshToken && settings.calendarId);
  }

  function getEventDetails(ticketNumber, baseUrl = '', ticketPath = '') {
    const ticketUrl = buildTicketUrl(baseUrl, ticketPath, ticketNumber);
    return {
      summary: `#${ticketNumber}`,
      description: [`Ticket: #${ticketNumber}`, ticketUrl && `Enlace del ticket: ${ticketUrl}`]
        .filter(Boolean)
        .join('\n')
    };
  }

  extension.Core = Object.freeze({
    normalizeTicketNumber,
    normalizeLabels,
    sortAppointments,
    normalizeBaseUrl,
    defaultTicketPath,
    normalizeTicketPath,
    buildTicketUrl,
    hasApiConfig,
    toDateKey,
    parseDateKey,
    buildAppointmentValue,
    formatAppointment,
    formatCalendarDate,
    getEventDetails
  });
})(globalThis);

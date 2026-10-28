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

  // Rango laboral: { days: [1..7] (1 = lunes, 7 = domingo), start: 'HH:MM', end: 'HH:MM' }.
  function defaultWorkRanges() {
    return [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '15:00' }];
  }

  function timeToMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return NaN;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours > 23 || minutes > 59 ? NaN : hours * 60 + minutes;
  }

  function minutesToTime(total) {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  // Descarta rangos inválidos; si no queda ninguno, devuelve el horario por defecto.
  function normalizeWorkRanges(value) {
    if (!Array.isArray(value)) return defaultWorkRanges();
    const ranges = value.map(range => {
      const days = [...new Set((Array.isArray(range?.days) ? range.days : []).map(Number))]
        .filter(day => day >= 1 && day <= 7)
        .sort((first, second) => first - second);
      const start = timeToMinutes(range?.start);
      const end = timeToMinutes(range?.end);
      if (!days.length || Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
      return { days, start: minutesToTime(start), end: minutesToTime(end) };
    }).filter(Boolean);
    return ranges.length ? ranges : defaultWorkRanges();
  }

  // Intervalos { start, end } en minutos que aplican a una fecha, ordenados por hora de inicio.
  function getWorkIntervals(ranges, date) {
    const weekday = ((date.getDay() + 6) % 7) + 1;
    return normalizeWorkRanges(ranges)
      .filter(range => range.days.includes(weekday))
      .map(range => ({ start: timeToMinutes(range.start), end: timeToMinutes(range.end) }))
      .sort((first, second) => first.start - second.start);
  }

  // Duraciones (minutos) que se pueden elegir al reservar. Las citas ya creadas guardan la suya y no dependen de esta lista.
  const MIN_DURATION = 5;
  const MAX_DURATION = 480;

  function defaultDurations() {
    return [15, 30, 60];
  }

  function normalizeDurations(value) {
    if (!Array.isArray(value)) return defaultDurations();
    const durations = [...new Set(value.map(Number))]
      .filter(minutes => Number.isInteger(minutes) && minutes >= MIN_DURATION && minutes <= MAX_DURATION)
      .sort((first, second) => first - second);
    return durations.length ? durations : defaultDurations();
  }

  function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return `${rest} min`;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
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
    MIN_DURATION,
    MAX_DURATION,
    defaultDurations,
    normalizeDurations,
    formatDuration,
    defaultWorkRanges,
    normalizeWorkRanges,
    timeToMinutes,
    minutesToTime,
    getWorkIntervals,
    toDateKey,
    parseDateKey,
    buildAppointmentValue,
    formatAppointment,
    formatCalendarDate,
    getEventDetails
  });
})(globalThis);

(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const Core = extension.Core;
  const CalendarApi = extension.CalendarApi;

  function usesApi(settings) {
    return settings.mode === 'api';
  }

  // Combina las citas del calendario con las locales, emparejándolas por el id del evento.
  // El calendario manda: una cita local con evento que debería estar en el rango consultado
  // y no aparece se borró del calendario.
  function mergeLabels(labels, remoteAppointments, from, to) {
    const merged = {};
    const add = (ticketNumber, appointment) => {
      (merged[ticketNumber] = merged[ticketNumber] || []).push(appointment);
    };
    const remoteIds = new Set(remoteAppointments.map(appointment => appointment.calendarEventId));
    const localByEventId = new Map();

    Object.entries(labels).forEach(([ticketNumber, appointments]) => {
      appointments.forEach(appointment => {
        if (appointment.calendarEventId) localByEventId.set(appointment.calendarEventId, appointment);
        if (remoteIds.has(appointment.calendarEventId)) return;
        const at = new Date(appointment.appointmentAt);
        const inWindow = appointment.calendarEventId && !Number.isNaN(at.getTime()) && at >= from && at < to;
        if (!inWindow) add(ticketNumber, appointment);
      });
    });

    remoteAppointments.forEach(({ ticketNumber, ...remote }) => {
      const local = localByEventId.get(remote.calendarEventId);
      const appointment = local?.syncState === 'pending'
        ? { ...remote, ...local, id: local.id }
        : { ...local, ...remote, id: local?.id || remote.calendarEventId, syncState: 'synced' };
      add(ticketNumber, appointment);
    });

    Object.keys(merged).forEach(ticketNumber => {
      merged[ticketNumber] = Core.sortAppointments(merged[ticketNumber]);
    });
    return merged;
  }

  // Devuelve las citas actualizadas desde el calendario, o null si no está en modo API configurado.
  async function loadLabels(settings, labels) {
    if (!usesApi(settings) || !Core.hasApiConfig(settings)) return null;
    const { appointments, from, to } = await CalendarApi.listTicketAppointments(settings);
    return mergeLabels(labels, appointments, from, to);
  }

  async function deleteEvent(settings, appointment) {
    if (usesApi(settings) && appointment?.calendarEventId) await CalendarApi.deleteEvent(settings, appointment.calendarEventId);
  }

  function openTemplate(settings, appointmentAt, ticketNumber, durationMinutes) {
    const start = Core.formatCalendarDate(appointmentAt);
    const end = Core.formatCalendarDate(new Date(new Date(appointmentAt).getTime() + durationMinutes * 60 * 1000));
    const eventDetails = Core.getEventDetails(ticketNumber, settings.faveoUrl, settings.ticketPath);
    const calendarUrl = new URL('https://calendar.google.com/calendar/render');
    calendarUrl.searchParams.set('action', 'TEMPLATE');
    calendarUrl.searchParams.set('text', eventDetails.summary);
    calendarUrl.searchParams.set('dates', `${start}/${end}`);
    calendarUrl.searchParams.set('details', eventDetails.description);
    return browser.tabs.create({ url: calendarUrl.toString() });
  }

  // Crea o actualiza el evento de la cita (o abre Google Calendar en modo pestaña).
  // Si crea un evento, deja su id en appointment.calendarEventId. Devuelve el mensaje para el usuario.
  async function pushAppointment(settings, appointment, ticketNumber, { appointmentAt, durationMinutes }) {
    if (!usesApi(settings)) {
      await openTemplate(settings, appointmentAt, ticketNumber, durationMinutes);
      return 'Cita guardada. Google Calendar se abrió en una pestaña nueva.';
    }

    if (appointment.calendarEventId) {
      try {
        await CalendarApi.updateEvent(settings, appointment.calendarEventId, appointmentAt, durationMinutes, ticketNumber);
        appointment.syncState = 'synced';
        return 'Cita guardada y evento actualizado en Google Calendar.';
      } catch (error) {
        // El evento guardado ya no existe en el calendario de destino (borrado o creado en otro calendario).
        if (error.status !== 404) throw error;
        appointment.calendarEventId = await CalendarApi.createEvent(settings, appointmentAt, ticketNumber, durationMinutes, appointment.id);
        appointment.syncState = 'synced';
        return 'El evento anterior no existía en el calendario; se ha creado uno nuevo.';
      }
    }

    appointment.calendarEventId = await CalendarApi.createEvent(settings, appointmentAt, ticketNumber, durationMinutes, appointment.id);
    appointment.syncState = 'synced';
    return 'Cita guardada y evento creado en Google Calendar.';
  }

  async function syncPending(settings, labels) {
    const failures = [];
    for (const [ticketNumber, appointments] of Object.entries(labels)) {
      for (const appointment of appointments) {
        if (settings.mode !== 'api' || appointment.syncState !== 'pending') continue;
        try {
          await pushAppointment(settings, appointment, ticketNumber, appointment);
        } catch (error) {
          failures.push({ ticketNumber, appointment, error });
        }
      }
    }
    return failures;
  }

  extension.CalendarSync = Object.freeze({ loadLabels, deleteEvent, pushAppointment, syncPending });
})(globalThis);

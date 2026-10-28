(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};

  function create(elements, actions) {
    function isPast(appointment) {
      const start = new Date(appointment.appointmentAt).getTime();
      return !Number.isNaN(start) && start + (appointment.durationMinutes || 15) * 60000 < Date.now();
    }

    function createButton(className, text, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = text;
      button.addEventListener('click', onClick);
      return button;
    }

    // Una fila por cita: un ticket con varias citas aparece varias veces.
    function createItem(ticketNumber, appointment) {
      const ticket = document.createElement('strong');
      ticket.textContent = ticketNumber;
      const when = document.createElement('small');
      const duration = appointment.durationMinutes || 15;
      const syncStatus = appointment.syncState === 'pending' ? ' · Pendiente de sincronizar' : '';
      when.textContent = `Cita: ${extension.Core.formatAppointment(appointment.appointmentAt)} · ${duration} min${syncStatus}`;
      const details = document.createElement('div');
      details.append(ticket, when);

      const itemActions = document.createElement('div');
      itemActions.className = 'label-actions';
      itemActions.append(
        createButton('edit-button', 'Editar', () => actions.onEdit(ticketNumber, appointment)),
        createButton('remove-button', 'Quitar', () => void actions.onRemove(ticketNumber, appointment))
      );

      const item = document.createElement('li');
      item.className = 'label-item';
      item.append(details, itemActions);
      return item;
    }

    function render(labels, { hidePast = false } = {}) {
      const all = Object.entries(labels).flatMap(([ticketNumber, appointments]) =>
        appointments.map(appointment => ({ ticketNumber, appointment })));
      const visible = all
        .filter(({ appointment }) => !(hidePast && isPast(appointment)))
        .sort((first, second) => first.ticketNumber.localeCompare(second.ticketNumber, undefined, { numeric: true })
          || first.appointment.appointmentAt.localeCompare(second.appointment.appointmentAt));

      elements.emptyState.hidden = visible.length > 0;
      elements.emptyState.textContent = all.length && !visible.length
        ? 'Todas las citas guardadas ya han pasado.'
        : 'Todavía no hay citas.';
      elements.clearAllButton.hidden = all.length === 0;
      elements.list.replaceChildren(...visible.map(({ ticketNumber, appointment }) => createItem(ticketNumber, appointment)));
    }

    return Object.freeze({ render });
  }

  extension.LabelsView = Object.freeze({ create });
})(globalThis);

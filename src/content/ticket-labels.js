(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const labelClass = 'faveo-ticket-label';
  const containerClass = 'faveo-ticket-labels';
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Datos de una etiqueta (texto, tooltip y estado) para una cita.
  function describeAppointment(appointment, now) {
    const text = extension.Core.formatAppointment(appointment.appointmentAt);
    if (!text) return null;
    const date = new Date(appointment.appointmentAt);
    const isSoon = date >= now && date - now <= oneDayMs;
    const isPast = date < now;
    return {
      text,
      title: `Cita: ${text}`,
      className: [labelClass, isSoon && `${labelClass}--soon`, isPast && `${labelClass}--past`].filter(Boolean).join(' ')
    };
  }

  function createLabel({ text, title, className }) {
    const element = document.createElement('span');
    element.textContent = text;
    element.title = title;
    element.className = className;
    return element;
  }

  // Muestra una etiqueta por cita dentro de un contenedor. Solo se reconstruye si cambia
  // algo, para no disparar el observador de cambios de la página en bucle.
  function renderRow(row, appointments) {
    const userCell = row.querySelector('#ticket_user');
    if (!userCell) return;

    const existing = row.querySelector(`.${containerClass}`);
    const now = Date.now();
    const descriptions = (appointments || []).map(appointment => describeAppointment(appointment, now)).filter(Boolean);

    if (!descriptions.length) {
      existing?.remove();
      return;
    }

    const signature = JSON.stringify(descriptions);
    if (existing?.dataset.signature === signature) return;

    const container = existing || document.createElement('span');
    container.className = containerClass;
    container.dataset.signature = signature;
    container.replaceChildren(...descriptions.map(createLabel));

    if (!existing) {
      const userImage = userCell.querySelector('.user-image');
      if (userImage) userImage.insertAdjacentElement('afterend', container);
      else userCell.append(container);
    }
  }

  function render(labels) {
    const rows = document.querySelectorAll('#tickets-expanded tbody tr, #ticket-list-body tr');
    rows.forEach(row => {
      const ticketNumber = extension.TicketDom.getTicketNumber(row);
      if (ticketNumber) renderRow(row, labels[ticketNumber]);
    });
  }

  extension.TicketLabels = Object.freeze({ render });
})(globalThis);

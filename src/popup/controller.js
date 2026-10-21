(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const { Core, SecureStore, SchedulePicker, LabelsView, TicketReader, CalendarSync } = extension;

  const elements = {
    gearButton: document.querySelector('#gear-button'),
    unlockForm: document.querySelector('#unlock-form'),
    unlockPassword: document.querySelector('#unlock-password'),
    unlockStatus: document.querySelector('#unlock-status'),
    form: document.querySelector('#label-form'),
    submitButton: document.querySelector('#submit-button'),
    cancelEditButton: document.querySelector('#cancel-edit'),
    ticketInput: document.querySelector('#ticket-number'),
    status: document.querySelector('#status'),
    labelList: document.querySelector('#label-list'),
    emptyState: document.querySelector('#empty-state'),
    clearAllButton: document.querySelector('#clear-all'),
    hidePast: document.querySelector('#hide-past'),
    todayButton: document.querySelector('#today-button'),
    calendarToggle: document.querySelector('#calendar-toggle'),
    calendarPanel: document.querySelector('#calendar-panel'),
    calendarMonth: document.querySelector('#calendar-month'),
    calendarGrid: document.querySelector('#calendar-grid'),
    previousMonth: document.querySelector('#previous-month'),
    nextMonth: document.querySelector('#next-month'),
    duration: document.querySelector('#duration-select'),
    availabilityStatus: document.querySelector('#availability-status'),
    timeSlots: document.querySelector('#time-slots'),
    selectedDate: document.querySelector('#selected-date')
  };

  let calendarSettings = normalizeSettings({});
  let labels = {};
  let editing = null;
  let statusTimer = null;

  // --- Estado y mensajes ---

  function normalizeSettings(stored) {
    return {
      mode: stored.mode === 'api' ? 'api' : 'tab',
      faveoUrl: Core.normalizeBaseUrl(stored.faveoUrl),
      ticketPath: Core.normalizeTicketPath(stored.ticketPath),
      calendarId: (stored.calendarId || '').trim()
    };
  }

  // Mensaje temporal: desaparece a los pocos segundos.
  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.className = isError ? 'error' : 'success';
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      elements.status.textContent = '';
      elements.status.className = '';
    }, 3500);
  }

  // Mensaje fijo: se queda hasta que otro lo sustituya.
  function setPersistentStatus(message, isError = false) {
    window.clearTimeout(statusTimer);
    elements.status.textContent = message;
    elements.status.className = isError ? 'error' : '';
  }

  async function saveLabels() {
    await browser.storage.local.set({ ticketLabels: labels });
  }

  function renderLabels() {
    labelsView.render(labels, { hidePast: elements.hidePast.checked });
  }

  // --- Lista de citas guardadas ---

  // Cita que se está editando; null si el formulario crea una cita nueva.
  function findEditingAppointment() {
    if (!editing) return null;
    return labels[editing.ticketNumber]?.find(appointment => appointment.id === editing.appointmentId) || null;
  }

  function setEditing(next) {
    editing = next;
    elements.submitButton.textContent = next ? 'Guardar cambios' : 'Guardar cita';
    elements.cancelEditButton.hidden = !next;
  }

  function editLabel(ticketNumber, appointment) {
    ticketReader.cancel();
    setEditing({ ticketNumber, appointmentId: appointment.id });
    elements.ticketInput.value = ticketNumber;
    schedule.setAppointment(appointment.appointmentAt, appointment.durationMinutes || 15);
    setStatus(`Editando una cita del ticket ${ticketNumber}.`);
  }

  function cancelEdit() {
    setEditing(null);
    setStatus('Edición cancelada. Se creará una cita nueva.');
  }

  async function removeLabel(ticketNumber, appointment) {
    try {
      await CalendarSync.deleteEvent(calendarSettings, appointment);
    } catch (error) {
      setStatus(`No se quitó la cita porque no se pudo borrar el evento de Google Calendar: ${error.message}`, true);
      return;
    }

    const remaining = labels[ticketNumber].filter(item => item.id !== appointment.id);
    if (remaining.length) labels[ticketNumber] = remaining;
    else delete labels[ticketNumber];
    if (editing?.appointmentId === appointment.id) setEditing(null);
    await saveLabels();
    renderLabels();
    setStatus('Cita quitada.');
  }

  async function clearAllLabels() {
    try {
      for (const appointments of Object.values(labels)) {
        for (const appointment of appointments) await CalendarSync.deleteEvent(calendarSettings, appointment);
      }
    } catch (error) {
      setStatus(`No se limpiaron las citas porque no se pudieron borrar todos los eventos de Google Calendar: ${error.message}`, true);
      return;
    }

    labels = {};
    setEditing(null);
    await saveLabels();
    renderLabels();
    setStatus('Citas quitadas.');
  }

  // El calendario es la fuente de verdad; la copia local solo se usa si no se puede leer.
  async function syncLabelsFromCalendar() {
    try {
      const calendarLabels = await CalendarSync.loadLabels(calendarSettings, labels);
      if (!calendarLabels) return;
      labels = calendarLabels;
      await saveLabels();
      renderLabels();
    } catch (error) {
      setStatus(`No se pudo leer el calendario; se muestran las citas guardadas localmente: ${error.message}`, true);
    }
  }

  // --- Ticket abierto en la pestaña activa ---

  // Un ticket detectado no carga ninguna cita: el formulario crea una cita nueva.
  function handleTicketFound(ticketNumber) {
    elements.ticketInput.value = ticketNumber;
    setEditing(null);
    setStatus(`Ticket ${ticketNumber} detectado.`);
  }

  async function startTicketLookup() {
    if (!calendarSettings.faveoUrl) {
      setPersistentStatus('Indica la URL de Faveo Helpdesk en Preferencias (engranaje).', true);
      return;
    }
    try {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) ticketReader.start(activeTab.id);
      else setPersistentStatus('Abre una ficha de Faveo para autocompletar el número.', true);
    } catch (error) {
      setPersistentStatus(`No se pudo acceder a la ficha: ${error.message}`, true);
    }
  }

  // --- Guardar una cita ---

  async function saveLabel(event) {
    event.preventDefault();
    const ticketNumber = Core.normalizeTicketNumber(elements.ticketInput.value);
    if (!/^\d+$/.test(ticketNumber)) {
      setStatus('Abre una ficha de Faveo para autocompletar el número.', true);
      return;
    }

    let selection;
    try {
      selection = await schedule.confirmAvailable();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    const appointment = findEditingAppointment() || { id: crypto.randomUUID(), calendarEventId: '' };
    Object.assign(appointment, { appointmentAt: selection.appointmentAt, durationMinutes: selection.durationMinutes });
    labels[ticketNumber] = Core.sortAppointments([
      ...(labels[ticketNumber] || []).filter(item => item.id !== appointment.id),
      appointment
    ]);
    await saveLabels();
    renderLabels();

    try {
      const message = await CalendarSync.pushAppointment(calendarSettings, appointment, ticketNumber, selection);
      await saveLabels();
      setStatus(message);
    } catch (error) {
      setStatus(`La cita se guardó, pero no se pudo añadir al calendario: ${error.message}`, true);
      return;
    }

    // Tras guardar, el formulario queda listo para añadir otra cita al mismo ticket.
    setEditing(null);
    elements.form.reset();
    elements.ticketInput.value = ticketNumber;
    schedule.setAppointment(appointment.appointmentAt, appointment.durationMinutes);
  }

  // --- Credenciales cifradas ---

  // Añade las credenciales descifradas a los ajustes; si están bloqueadas, pide la contraseña.
  async function loadCredentials() {
    if (calendarSettings.mode !== 'api') return;
    try {
      const credentials = await SecureStore.load();
      if (credentials) {
        Object.assign(calendarSettings, credentials);
      } else if (await SecureStore.hasSecrets()) {
        elements.unlockForm.hidden = false;
        elements.unlockPassword.focus();
      }
    } catch (error) {
      setStatus(`No se pudieron leer las credenciales: ${error.message}`, true);
    }
  }

  async function unlockCredentials(event) {
    event.preventDefault();
    try {
      if (await SecureStore.unlock(elements.unlockPassword.value)) {
        window.location.reload();
        return;
      }
      elements.unlockStatus.textContent = 'Contraseña maestra incorrecta.';
      elements.unlockStatus.className = 'availability-status error';
      elements.unlockPassword.select();
    } catch (error) {
      elements.unlockStatus.textContent = `No se pudo desbloquear: ${error.message}`;
      elements.unlockStatus.className = 'availability-status error';
    }
  }

  // --- Arranque ---

  async function loadPopup() {
    const { ticketLabels = {}, calendarSettings: storedSettings = {}, hidePastAppointments = false } = await browser.storage.local.get([
      'ticketLabels',
      'calendarSettings',
      'hidePastAppointments'
    ]);
    elements.hidePast.checked = Boolean(hidePastAppointments);
    labels = Core.normalizeLabels(ticketLabels);
    calendarSettings = normalizeSettings(storedSettings);
    await loadCredentials();
    await saveLabels();
    renderLabels();
    await syncLabelsFromCalendar();
    await schedule.init();
    await startTicketLookup();
  }

  function registerEvents() {
    elements.gearButton.addEventListener('click', () => {
      void browser.tabs.create({ url: browser.runtime.getURL('preferences.html') });
    });
    elements.form.addEventListener('submit', event => void saveLabel(event));
    elements.cancelEditButton.addEventListener('click', cancelEdit);
    elements.unlockForm.addEventListener('submit', event => void unlockCredentials(event));
    elements.clearAllButton.addEventListener('click', () => void clearAllLabels());
    elements.hidePast.addEventListener('change', () => {
      renderLabels();
      void browser.storage.local.set({ hidePastAppointments: elements.hidePast.checked });
    });
  }

  const ticketReader = TicketReader.create({
    onFound: handleTicketFound,
    onProgress: setPersistentStatus
  });

  const schedule = SchedulePicker.create({
    todayButton: elements.todayButton,
    calendarToggle: elements.calendarToggle,
    calendarPanel: elements.calendarPanel,
    calendarMonth: elements.calendarMonth,
    calendarGrid: elements.calendarGrid,
    previousMonth: elements.previousMonth,
    nextMonth: elements.nextMonth,
    duration: elements.duration,
    availabilityStatus: elements.availabilityStatus,
    timeSlots: elements.timeSlots,
    selectedDate: elements.selectedDate
  }, {
    getCalendarSettings: () => calendarSettings,
    getExcludedEventId: () => findEditingAppointment()?.calendarEventId || '',
    setStatus
  });

  const labelsView = LabelsView.create({
    list: elements.labelList,
    emptyState: elements.emptyState,
    clearAllButton: elements.clearAllButton
  }, {
    onEdit: editLabel,
    onRemove: removeLabel
  });

  registerEvents();
  void loadPopup();
})(globalThis);

(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const { Core, SecureStore, MasterPassword, SchedulePicker, LabelsView, TicketReader, CalendarSync, ConfirmDialog } = extension;

  const elements = {
    appView: document.querySelector('#app-view'),
    lockedView: document.querySelector('#locked-view'),
    setupView: document.querySelector('#setup-view'),
    setupForm: document.querySelector('#setup-form'),
    gearButton: document.querySelector('#gear-button'),
    logoutButton: document.querySelector('#logout-button'),
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
  let saveInProgress = false;

  // --- Estado y mensajes ---

  function normalizeSettings(stored) {
    return {
      mode: stored.mode === 'api' ? 'api' : 'tab',
      faveoUrl: Core.normalizeBaseUrl(stored.faveoUrl),
      ticketPath: Core.normalizeTicketPath(stored.ticketPath),
      calendarId: (stored.calendarId || '').trim(),
      workRanges: Core.normalizeWorkRanges(stored.workRanges),
      durations: Core.normalizeDurations(stored.durations)
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
    if (await SecureStore.isUnlocked()) {
      const ticketLabelsEncrypted = await SecureStore.encryptData(labels);
      await browser.storage.local.set({ ticketLabelsEncrypted });
      await browser.storage.local.remove('ticketLabels');
      return;
    }
    if (Object.keys(labels).length) {
      throw new Error('Configura una contraseña maestra en Preferencias para cifrar y guardar las citas.');
    }
    await browser.storage.local.remove(['ticketLabels', 'ticketLabelsEncrypted']);
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
    schedule.refreshDurations();
    setStatus('Edición cancelada. Se creará una cita nueva.');
  }

  async function removeLabel(ticketNumber, appointment) {
    const when = Core.formatAppointment(appointment.appointmentAt);
    const detail = calendarSettings.mode === 'api' && appointment.calendarEventId ? ' También se borrará su evento de Google Calendar.' : '';
    const confirmed = await ConfirmDialog.ask({
      title: `¿Quitar la cita del ticket ${ticketNumber}?`,
      message: `Cita del ${when}.${detail} No se puede deshacer.`,
      confirmLabel: 'Quitar cita'
    });
    if (!confirmed) return;
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
    void schedule.releaseEvents([appointment.calendarEventId]);
  }

  async function clearAllLabels() {
    const total = Object.values(labels).reduce((sum, appointments) => sum + appointments.length, 0);
    if (!total) return;
    const detail = calendarSettings.mode === 'api' ? ' También se borrarán sus eventos de Google Calendar.' : '';
    const confirmed = await ConfirmDialog.ask({
      title: '¿Quitar todas las citas?',
      message: `Se quitarán ${total} ${total === 1 ? 'cita guardada' : 'citas guardadas'}.${detail} No se puede deshacer.`,
      confirmLabel: 'Quitar todas'
    });
    if (!confirmed) return;
    try {
      for (const appointments of Object.values(labels)) {
        for (const appointment of appointments) await CalendarSync.deleteEvent(calendarSettings, appointment);
      }
    } catch (error) {
      setStatus(`No se limpiaron las citas porque no se pudieron borrar todos los eventos de Google Calendar: ${error.message}`, true);
      return;
    }

    const removedEventIds = Object.values(labels).flat().map(appointment => appointment.calendarEventId);
    labels = {};
    setEditing(null);
    await saveLabels();
    renderLabels();
    setStatus('Citas quitadas.');
    void schedule.releaseEvents(removedEventIds);
  }

  // El calendario es la fuente de verdad; la copia local solo se usa si no se puede leer.
  async function syncLabelsFromCalendar() {
    try {
      const pendingFailures = await CalendarSync.syncPending(calendarSettings, labels);
      if (pendingFailures.length) {
        await saveLabels();
        await notifyNetworkFailure(pendingFailures[0].error);
      } else {
        await saveLabels();
      }
      const calendarLabels = await CalendarSync.loadLabels(calendarSettings, labels);
      if (!calendarLabels) return;
      labels = calendarLabels;
      await saveLabels();
      renderLabels();
      void schedule.refreshAvailability();
    } catch (error) {
      setStatus(`No se pudo leer el calendario; se muestran las citas guardadas localmente: ${error.message}`, true);
      if (!navigator.onLine) await notifyNetworkFailure(error);
    }
  }

  async function notifyNetworkFailure(error) {
    if (navigator.onLine && !(error instanceof TypeError)) return;
    try {
      await browser.notifications.create({
        type: 'basic',
        title: 'Faveo: sin conexión',
        message: `La cita queda guardada localmente y se sincronizará al recuperar la conexión. ${error?.message || ''}`.trim(),
        iconUrl: browser.runtime.getURL('icons/icon-48.png')
      });
    } catch (notificationError) {
      console.error('No se pudo mostrar la notificación de pérdida de red:', notificationError);
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
    if (saveInProgress) return;
    const ticketNumber = Core.normalizeTicketNumber(elements.ticketInput.value);
    if (!/^\d+$/.test(ticketNumber)) {
      setStatus('Abre una ficha de Faveo para autocompletar el número.', true);
      return;
    }

    saveInProgress = true;
    elements.submitButton.disabled = true;
    try {
      if (!(await SecureStore.isUnlocked())) {
        throw new Error('Configura o desbloquea la contraseña maestra en Preferencias antes de guardar citas.');
      }
      const selection = await schedule.confirmAvailable();

      const appointment = findEditingAppointment() || { id: crypto.randomUUID(), calendarEventId: '' };
      const previousEventId = appointment.calendarEventId;
      Object.assign(appointment, { appointmentAt: selection.appointmentAt, durationMinutes: selection.durationMinutes });
      if (calendarSettings.mode === 'api') appointment.syncState = 'pending';
      labels[ticketNumber] = Core.sortAppointments([
        ...(labels[ticketNumber] || []).filter(item => item.id !== appointment.id),
        appointment
      ]);
      await saveLabels();
      renderLabels();

      try {
        const message = await CalendarSync.pushAppointment(calendarSettings, appointment, ticketNumber, selection);
        await saveLabels();
        renderLabels();
        setStatus(message);
      } catch (error) {
        await saveLabels();
        setStatus(`La cita se guardó, pero no se pudo añadir al calendario: ${error.message}`, true);
        await notifyNetworkFailure(error);
        void schedule.releaseEvents([previousEventId]);
        return;
      }

      setEditing(null);
      elements.form.reset();
      elements.ticketInput.value = ticketNumber;
      void schedule.releaseEvents([previousEventId], { refresh: false });
      schedule.setAppointment(appointment.appointmentAt, appointment.durationMinutes);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      saveInProgress = false;
      elements.submitButton.disabled = false;
    }
  }

  // --- Credenciales cifradas ---

  // Añade las credenciales descifradas a los ajustes; si están bloqueadas, pide la contraseña.
  async function loadCredentials() {
    if (calendarSettings.mode !== 'api') return;
    try {
      const credentials = await SecureStore.load();
      if (credentials) Object.assign(calendarSettings, credentials);
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
    const { ticketLabels = {}, ticketLabelsEncrypted, calendarSettings: storedSettings = {}, hidePastAppointments = false } = await browser.storage.local.get([
      'ticketLabels',
      'ticketLabelsEncrypted',
      'calendarSettings',
      'hidePastAppointments'
    ]);
    calendarSettings = normalizeSettings(storedSettings);
    const state = await MasterPassword.getState();
    const isUnlocked = state === 'unlocked';
    if (state === 'none') {
      // Sin contraseña maestra la extensión permanece bloqueada.
      elements.setupView.hidden = false;
      return;
    }
    if (state === 'locked') {
      elements.lockedView.hidden = false;
      elements.unlockPassword.focus();
      return;
    }
    elements.appView.hidden = false;
    elements.logoutButton.hidden = false;
    if (ticketLabelsEncrypted) {
      labels = Core.normalizeLabels(await SecureStore.decryptData(ticketLabelsEncrypted));
    } else {
      labels = Core.normalizeLabels(ticketLabels);
    }
    elements.hidePast.checked = Boolean(hidePastAppointments);
    await loadCredentials();
    if (!ticketLabelsEncrypted && Object.keys(labels).length) await saveLabels();
    renderLabels();
    await syncLabelsFromCalendar();
    await schedule.init();
    await startTicketLookup();
  }

  function registerEvents() {
    const openPreferences = () => void browser.tabs.create({ url: browser.runtime.getURL('preferences.html') });
    elements.gearButton.addEventListener('click', openPreferences);
    elements.setupForm.addEventListener('submit', event => {
      event.preventDefault();
      openPreferences();
      window.close();
    });
    elements.form.addEventListener('submit', event => void saveLabel(event));
    elements.cancelEditButton.addEventListener('click', cancelEdit);
    elements.unlockForm.addEventListener('submit', event => void unlockCredentials(event));
    elements.logoutButton.addEventListener('click', async () => {
      await SecureStore.lock();
      window.location.reload();
    });
    elements.clearAllButton.addEventListener('click', () => void clearAllLabels());
    elements.hidePast.addEventListener('change', () => {
      renderLabels();
      void browser.storage.local.set({ hidePastAppointments: elements.hidePast.checked });
    });
  }

  function reportPopupLoadError(error) {
    console.error('No se pudo cargar el popup:', error);
    elements.lockedView.hidden = true;
    elements.setupView.hidden = true;
    elements.appView.hidden = false;
    setPersistentStatus(`No se pudo cargar la información del popup: ${error.message}`, true);
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
    getExcludedAppointmentId: () => findEditingAppointment()?.id || '',
    getLocalAppointments: dateKey => Object.values(labels).flat().filter(appointment =>
      Core.toDateKey(new Date(appointment.appointmentAt)) === dateKey),
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
  void loadPopup().catch(reportPopupLoadError);
  void MasterPassword.watch(() => window.location.reload());
})(globalThis);

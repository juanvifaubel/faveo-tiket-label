(function () {
  const { Core, SecureStore, MasterPassword, ContentRegistration, CalendarSync, ConfirmDialog } = FaveoLabels;
  const settingsForm = document.querySelector('#settings-form');
  const settingsStatus = document.querySelector('#settings-status');
  const passwordForm = document.querySelector('#password-form');
  const passwordStatus = document.querySelector('#password-status');
  const passwordButton = document.querySelector('#password-button');
  const modeRadios = [...document.querySelectorAll('input[name="calendar-mode"]')];
  const credentialsSection = document.querySelector('#google');
  const oauthOffNote = document.querySelector('#oauth-off-note');
  const firstRunNotice = document.querySelector('#first-run-notice');
  const confirmField = document.querySelector('#master-password-confirm-field');
  const confirmInput = document.querySelector('#master-password-confirm');
  const passwordLabel = document.querySelector('#master-password-label');
  const clientIdInput = document.querySelector('#oauth-client-id');
  const clientSecretInput = document.querySelector('#oauth-client-secret');
  const refreshTokenInput = document.querySelector('#oauth-refresh-token');
  const masterPasswordInput = document.querySelector('#master-password');
  const secretsStatus = document.querySelector('#secrets-status');
  const credentialInputs = [clientIdInput, clientSecretInput, refreshTokenInput];
  const faveoUrlInput = document.querySelector('#faveo-url');
  const ticketPathInput = document.querySelector('#ticket-path');
  const calendarIdInput = document.querySelector('#calendar-id');
  const workRangesList = document.querySelector('#work-ranges');
  const addRangeButton = document.querySelector('#add-range');
  const workRangesError = document.querySelector('#work-ranges-error');
  const durationList = document.querySelector('#duration-list');
  const durationNewInput = document.querySelector('#duration-new');
  const addDurationButton = document.querySelector('#add-duration');
  const durationsError = document.querySelector('#durations-error');
  let durations = Core.defaultDurations();
  const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const DAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  // Se consulta cada vez porque los tramos de horario se crean dinámicamente.
  const getSettingsControls = () => [...settingsForm.querySelectorAll('input, button')];

  // 'none': no existe contraseña maestra · 'locked': existe y está bloqueada · 'unlocked': disponible en esta sesión.
  let secretsState = 'none';

  const SECRETS_MESSAGES = {
    none: 'Sin contraseña maestra: la extensión está bloqueada.',
    locked: 'Bloqueada: introduce la contraseña maestra para continuar.',
    unlocked: 'Contraseña maestra activa y desbloqueada en esta sesión.'
  };

  const PASSWORD_UI = {
    none: { label: 'Crear contraseña', button: 'Crear contraseña', confirm: true },
    locked: { label: 'Contraseña maestra', button: 'Desbloquear', confirm: false },
    unlocked: { label: 'Nueva contraseña maestra', button: 'Actualizar contraseña', confirm: true }
  };

  function requestPanel(id) {
    window.dispatchEvent(new CustomEvent('panel-request', { detail: id }));
  }

  function getSelectedMode() {
    return modeRadios.find(radio => radio.checked)?.value === 'api' ? 'api' : 'tab';
  }

  function setStatus(message, isError = false) {
    settingsStatus.textContent = message;
    settingsStatus.className = isError ? 'error' : 'success';
  }

  function setPasswordStatus(message, isError = false) {
    passwordStatus.textContent = message;
    passwordStatus.className = isError ? 'error' : 'success';
  }

  // El resto de ajustes solo se pueden editar con la contraseña maestra creada y desbloqueada.
  function updateModeDisplay() {
    const isApi = getSelectedMode() === 'api';
    const isUnlocked = secretsState === 'unlocked';
    getSettingsControls().forEach(control => {
      control.disabled = !isUnlocked;
    });
    credentialInputs.forEach(input => {
      input.disabled = !isUnlocked || !isApi;
    });
    credentialsSection.classList.toggle('is-disabled', !isApi);
    oauthOffNote.hidden = isApi;
    firstRunNotice.hidden = secretsState !== 'none';

    const ui = PASSWORD_UI[secretsState];
    passwordLabel.textContent = ui.label;
    passwordButton.textContent = ui.button;
    confirmField.hidden = !ui.confirm;
    masterPasswordInput.autocomplete = secretsState === 'locked' ? 'current-password' : 'new-password';
    modeRadios.forEach(radio => {
      radio.closest('.mode-option').classList.toggle('is-selected', radio.checked);
    });
    secretsStatus.textContent = SECRETS_MESSAGES[secretsState];
    secretsStatus.dataset.state = secretsState;
    document.body.dataset.passwordState = secretsState;
    window.dispatchEvent(new CustomEvent('password-state'));
  }

  function addRangeRow(range) {
    const row = document.createElement('div');
    row.className = 'work-range';
    const days = document.createElement('div');
    days.className = 'work-days';
    days.setAttribute('role', 'group');
    days.setAttribute('aria-label', 'Días de la semana');
    DAY_NAMES.forEach((name, index) => {
      const label = document.createElement('label');
      label.className = 'work-day';
      label.title = name;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(index + 1);
      checkbox.checked = range.days.includes(index + 1);
      checkbox.setAttribute('aria-label', name);
      const text = document.createElement('span');
      text.textContent = DAY_INITIALS[index];
      label.append(checkbox, text);
      days.append(label);
    });

    const times = document.createElement('div');
    times.className = 'work-times';
    const start = document.createElement('input');
    start.type = 'time';
    start.className = 'range-start';
    start.value = range.start;
    start.setAttribute('aria-label', 'Hora de inicio');
    const separator = document.createElement('span');
    separator.textContent = 'a';
    const end = document.createElement('input');
    end.type = 'time';
    end.className = 'range-end';
    end.value = range.end;
    end.setAttribute('aria-label', 'Hora de fin');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-range';
    remove.textContent = 'Quitar';
    remove.addEventListener('click', async () => {
      const days = [...row.querySelectorAll('.work-day input:checked')].map(input => DAY_NAMES[Number(input.value) - 1].toLowerCase()).join(', ');
      const confirmed = await ConfirmDialog.ask({
        title: '¿Quitar este tramo?',
        message: `${row.querySelector('.range-start').value}–${row.querySelector('.range-end').value}${days ? ` (${days})` : ''}. Las citas ya creadas no se modifican; dejarán de ofrecerse esas franjas al reservar.`,
        confirmLabel: 'Quitar tramo'
      });
      if (!confirmed) return;
      row.remove();
      validateWorkRangesLive();
    });
    times.append(start, separator, end, remove);
    row.append(days, times);
    workRangesList.append(row);
  }

  function renderWorkRanges(ranges) {
    workRangesList.replaceChildren();
    Core.normalizeWorkRanges(ranges).forEach(addRangeRow);
    workRangesError.hidden = true;
  }

  // Devuelve { ranges } o { error } si algún tramo es inválido o se solapa con otro en el mismo día.
  function readWorkRanges() {
    const ranges = [];
    const rows = [...workRangesList.querySelectorAll('.work-range')];
    for (const [index, row] of rows.entries()) {
      const days = [...row.querySelectorAll('.work-day input:checked')].map(input => Number(input.value));
      const start = row.querySelector('.range-start').value;
      const end = row.querySelector('.range-end').value;
      const label = `Tramo ${index + 1}`;
      if (!days.length) return { error: `${label}: marca al menos un día.` };
      if (Number.isNaN(Core.timeToMinutes(start)) || Number.isNaN(Core.timeToMinutes(end))) return { error: `${label}: indica la hora de inicio y de fin.` };
      if (Core.timeToMinutes(end) <= Core.timeToMinutes(start)) return { error: `${label}: la hora de fin debe ser posterior a la de inicio.` };
      ranges.push({ days, start, end });
    }
    if (!ranges.length) return { error: 'Añade al menos un tramo de horario.' };
    for (let first = 0; first < ranges.length; first += 1) {
      for (let second = first + 1; second < ranges.length; second += 1) {
        const a = ranges[first];
        const b = ranges[second];
        const sharedDays = a.days.filter(day => b.days.includes(day));
        const overlap = Core.timeToMinutes(a.start) < Core.timeToMinutes(b.end) && Core.timeToMinutes(b.start) < Core.timeToMinutes(a.end);
        if (sharedDays.length && overlap) {
          const names = sharedDays.map(day => DAY_NAMES[day - 1].toLowerCase()).join(', ');
          return { error: `Los tramos ${first + 1} (${a.start}–${a.end}) y ${second + 1} (${b.start}–${b.end}) se solapan: ${names}.` };
        }
      }
    }
    return { ranges };
  }

  // Avisa al momento de cualquier tramo inválido o solapado; guardar sigue bloqueado hasta corregirlo.
  function validateWorkRangesLive() {
    const result = readWorkRanges();
    workRangesError.textContent = result.error || '';
    workRangesError.hidden = !result.error;
  }

  function renderDurations() {
    durationList.replaceChildren(...durations.map(minutes => {
      const item = document.createElement('li');
      item.className = 'duration-chip';
      const text = document.createElement('span');
      text.textContent = Core.formatDuration(minutes);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-duration';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Quitar ${Core.formatDuration(minutes)}`);
      remove.disabled = durations.length === 1 || secretsState !== 'unlocked';
      remove.addEventListener('click', async () => {
        const confirmed = await ConfirmDialog.ask({
          title: `¿Quitar la duración de ${Core.formatDuration(minutes)}?`,
          message: 'Las citas ya creadas con esta duración no se modifican ni sus eventos del calendario; solo dejará de ofrecerse al reservar.',
          confirmLabel: 'Quitar duración'
        });
        if (!confirmed) return;
        durations = durations.filter(value => value !== minutes);
        durationsError.hidden = true;
        renderDurations();
      });
      item.append(text, remove);
      return item;
    }));
  }

  function addDuration() {
    const minutes = Number(durationNewInput.value);
    let error = '';
    if (!Number.isInteger(minutes) || minutes < Core.MIN_DURATION || minutes > Core.MAX_DURATION) {
      error = `Indica una duración entera entre ${Core.MIN_DURATION} y ${Core.MAX_DURATION} minutos.`;
    } else if (durations.includes(minutes)) {
      error = `La duración de ${Core.formatDuration(minutes)} ya existe.`;
    }
    durationsError.textContent = error;
    durationsError.hidden = !error;
    if (error) return;
    durations = Core.normalizeDurations([...durations, minutes]);
    durationNewInput.value = '';
    renderDurations();
  }

  async function loadSettings() {
    const { calendarSettings = {} } = await browser.storage.local.get('calendarSettings');
    const mode = calendarSettings.mode === 'api' ? 'api' : 'tab';
    secretsState = await MasterPassword.getState();
    const credentials = secretsState === 'unlocked' ? await SecureStore.load() : null;

    modeRadios.forEach(radio => {
      radio.checked = radio.value === mode;
    });
    faveoUrlInput.value = calendarSettings.faveoUrl || '';
    ticketPathInput.value = Core.normalizeTicketPath(calendarSettings.ticketPath);
    calendarIdInput.value = calendarSettings.calendarId || '';
    renderWorkRanges(calendarSettings.workRanges);
    durations = Core.normalizeDurations(calendarSettings.durations);
    renderDurations();
    clientIdInput.value = credentials?.clientId || '';
    clientSecretInput.value = credentials?.clientSecret || '';
    refreshTokenInput.value = credentials?.refreshToken || '';
    updateModeDisplay();
  }

  // Devuelve un mensaje de error, o una cadena vacía si se concedió el permiso.
  async function requestFaveoPermission(faveoUrl) {
    try {
      const granted = await browser.permissions.request({ origins: [`${faveoUrl}/*`] });
      return granted
        ? ''
        : `Sin permiso para acceder a ${faveoUrl} la extensión no puede leer los tickets. Vuelve a guardar y acepta el permiso.`;
    } catch (error) {
      return `No se pudo solicitar el permiso para ${faveoUrl}: ${error.message}`;
    }
  }

  function readCredentials() {
    return {
      clientId: clientIdInput.value.trim(),
      clientSecret: clientSecretInput.value.trim(),
      refreshToken: refreshTokenInput.value.trim()
    };
  }

  // Cifra las credenciales escritas o comprueba las guardadas. Devuelve un error con el campo a enfocar, o null.
  async function storeCredentials(mode) {
    const credentials = readCredentials();
    const typedCount = Object.values(credentials).filter(Boolean).length;
    const missingMessage = 'Completa las tres credenciales OAuth: ID de cliente, secreto y Refresh token.';

    if (typedCount > 0 && typedCount < credentialInputs.length) {
      return { input: credentialInputs.find(input => !input.value.trim()), message: missingMessage };
    }
    if (typedCount === credentialInputs.length) {
      await SecureStore.saveUnlocked(credentials);
      return null;
    }
    if (mode === 'api') {
      const stored = await SecureStore.load();
      if (!stored?.clientId || !stored.clientSecret || !stored.refreshToken) {
        return { input: clientIdInput, message: missingMessage };
      }
    }
    return null;
  }

  // Cifra las citas que quedaron en claro de versiones anteriores.
  async function migratePlainLabels() {
    const { ticketLabels = {}, ticketLabelsEncrypted } = await browser.storage.local.get(['ticketLabels', 'ticketLabelsEncrypted']);
    if (ticketLabelsEncrypted || !Object.keys(ticketLabels).length) return;
    await browser.storage.local.set({
      ticketLabelsEncrypted: await SecureStore.encryptData(Core.normalizeLabels(ticketLabels))
    });
    await browser.storage.local.remove('ticketLabels');
  }

  // Crea, desbloquea o actualiza la contraseña maestra según el estado detectado.
  async function savePassword(event) {
    event.preventDefault();
    const password = masterPasswordInput.value;
    const previousState = secretsState;

    if (!password) {
      setPasswordStatus(previousState === 'locked' ? 'Escribe la contraseña maestra.' : 'Escribe la contraseña.', true);
      masterPasswordInput.focus();
      return;
    }
    if (previousState !== 'locked' && password !== confirmInput.value) {
      setPasswordStatus('Las dos contraseñas no coinciden.', true);
      confirmInput.focus();
      return;
    }

    try {
      if (previousState === 'none') {
        await SecureStore.save(password, {});
        await migratePlainLabels();
      } else if (previousState === 'locked') {
        if (!(await SecureStore.unlock(password))) {
          setPasswordStatus('Contraseña maestra incorrecta.', true);
          masterPasswordInput.select();
          return;
        }
      } else {
        const [credentials, { ticketLabelsEncrypted }] = await Promise.all([
          SecureStore.load(),
          browser.storage.local.get('ticketLabelsEncrypted')
        ]);
        const labels = ticketLabelsEncrypted ? await SecureStore.decryptData(ticketLabelsEncrypted) : undefined;
        await SecureStore.rotate(password, credentials || {}, labels);
      }
    } catch (error) {
      setPasswordStatus(error.message, true);
      masterPasswordInput.focus();
      return;
    }

    masterPasswordInput.value = '';
    confirmInput.value = '';
    await loadSettings();
    setPasswordStatus({
      none: 'Contraseña creada. Ya puedes configurar tu Faveo.',
      locked: 'Contraseña correcta: sesión desbloqueada.',
      unlocked: 'Contraseña actualizada.'
    }[previousState]);
    if (previousState !== 'unlocked') requestPanel('faveo');
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (secretsState !== 'unlocked') {
      setStatus('Crea o desbloquea la contraseña maestra para guardar los ajustes.', true);
      return;
    }
    const faveoUrl = Core.normalizeBaseUrl(faveoUrlInput.value);
    if (!faveoUrl) {
      setStatus('Indica una URL válida de Faveo Helpdesk, por ejemplo https://helpdesk.tuorganizacion.es', true);
      requestPanel('faveo');
      faveoUrlInput.focus();
      return;
    }

    const workSchedule = readWorkRanges();
    if (workSchedule.error) {
      workRangesError.textContent = workSchedule.error;
      workRangesError.hidden = false;
      setStatus(workSchedule.error, true);
      requestPanel('horario');
      return;
    }

    // Firefox exige pedir el permiso directamente desde el clic, antes de cualquier otro await.
    const permissionError = await requestFaveoPermission(faveoUrl);
    if (permissionError) {
      setStatus(permissionError, true);
      return;
    }

    const mode = getSelectedMode();
    if (mode === 'api' && !calendarIdInput.value.trim()) {
      setStatus('Indica el ID del calendario de destino.', true);
      requestPanel('calendario');
      calendarIdInput.focus();
      return;
    }
    try {
      const credentialsError = await storeCredentials(mode);
      if (credentialsError) {
        setStatus(credentialsError.message, true);
        requestPanel('google');
        credentialsError.input.focus();
        return;
      }
      await migratePlainLabels();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    const ticketPath = Core.normalizeTicketPath(ticketPathInput.value);
    // Las credenciales ya no se guardan aquí: viven cifradas en calendarSecrets.
    await browser.storage.local.set({
      calendarSettings: { mode, faveoUrl, ticketPath, calendarId: calendarIdInput.value.trim(), workRanges: workSchedule.ranges, durations }
    });
    faveoUrlInput.value = faveoUrl;
    ticketPathInput.value = ticketPath;
    await loadSettings();

    const restoreMessage = await restoreAppointmentsFromCalendar(mode, calendarIdInput.value.trim());
    try {
      await ContentRegistration.sync(faveoUrl);
    } catch (error) {
      setStatus(`Preferencias guardadas, pero no se pudo activar la extensión en ${faveoUrl}: ${error.message}`, true);
      return;
    }
    setStatus(`Preferencias guardadas. Recarga las pestañas de Faveo que tengas abiertas.${restoreMessage}`);
  }

  // En un navegador nuevo el calendario es la fuente de verdad: trae las citas sin esperar a abrir el popup.
  async function restoreAppointmentsFromCalendar(mode, calendarId) {
    if (mode !== 'api' || secretsState !== 'unlocked') return '';
    try {
      const credentials = await SecureStore.load();
      const settings = { mode, calendarId, ...credentials };
      if (!Core.hasApiConfig(settings)) return '';
      const { ticketLabelsEncrypted } = await browser.storage.local.get('ticketLabelsEncrypted');
      const current = ticketLabelsEncrypted ? await SecureStore.decryptData(ticketLabelsEncrypted) : {};
      const restored = await CalendarSync.loadLabels(settings, Core.normalizeLabels(current));
      if (!restored) return '';
      await browser.storage.local.set({ ticketLabelsEncrypted: await SecureStore.encryptData(restored) });
      const total = Object.values(restored).reduce((sum, list) => sum + list.length, 0);
      return ` Se han recuperado las citas del calendario (${total}).`;
    } catch (error) {
      return ` No se pudieron recuperar las citas del calendario: ${error.message}`;
    }
  }

  modeRadios.forEach(radio => radio.addEventListener('change', updateModeDisplay));
  addRangeButton.addEventListener('click', () => {
    addRangeRow({ days: [1, 2, 3, 4, 5], start: '16:00', end: '18:00' });
    validateWorkRangesLive();
  });
  workRangesList.addEventListener('input', validateWorkRangesLive);
  workRangesList.addEventListener('change', validateWorkRangesLive);
  addDurationButton.addEventListener('click', addDuration);
  durationNewInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addDuration();
  });
  passwordForm.addEventListener('submit', event => void savePassword(event));
  settingsForm.addEventListener('submit', event => void saveSettings(event));
  void loadSettings().then(() => MasterPassword.watch(state => {
    // La contraseña cambió en otra página (p. ej. cerrar sesión desde el popup).
    if (state !== secretsState) void loadSettings();
  }));
})();

(function () {
  const { Core, SecureStore, ContentRegistration } = FaveoLabels;
  const settingsForm = document.querySelector('#settings-form');
  const settingsStatus = document.querySelector('#settings-status');
  const modeRadios = [...document.querySelectorAll('input[name="calendar-mode"]')];
  const credentialsSection = document.querySelector('#oauth-credentials');
  const clientIdInput = document.querySelector('#oauth-client-id');
  const clientSecretInput = document.querySelector('#oauth-client-secret');
  const refreshTokenInput = document.querySelector('#oauth-refresh-token');
  const masterPasswordInput = document.querySelector('#master-password');
  const secretsStatus = document.querySelector('#secrets-status');
  const credentialInputs = [clientIdInput, clientSecretInput, refreshTokenInput];
  const faveoUrlInput = document.querySelector('#faveo-url');
  const ticketPathInput = document.querySelector('#ticket-path');
  const calendarIdInput = document.querySelector('#calendar-id');

  // 'none': sin credenciales guardadas · 'locked': cifradas y bloqueadas · 'unlocked': desbloqueadas.
  let secretsState = 'none';

  const SECRETS_MESSAGES = {
    none: 'Todavía no hay credenciales guardadas.',
    locked: 'Hay credenciales cifradas y bloqueadas. Escribe la contraseña maestra y guarda para desbloquearlas, o introduce credenciales nuevas para sustituirlas.',
    unlocked: 'Credenciales desbloqueadas durante esta sesión de Firefox.'
  };

  function getSelectedMode() {
    return modeRadios.find(radio => radio.checked)?.value === 'api' ? 'api' : 'tab';
  }

  function setStatus(message, isError = false) {
    settingsStatus.textContent = message;
    settingsStatus.className = isError ? 'error' : 'success';
  }

  // Solo el modo API necesita las credenciales OAuth y la contraseña maestra.
  function updateModeDisplay() {
    const isApi = getSelectedMode() === 'api';
    credentialInputs.forEach(input => {
      input.required = isApi && secretsState !== 'locked';
      input.disabled = !isApi;
    });
    masterPasswordInput.required = isApi && secretsState !== 'unlocked';
    masterPasswordInput.disabled = !isApi;
    credentialsSection.classList.toggle('is-disabled', !isApi);
    modeRadios.forEach(radio => {
      radio.closest('.mode-option').classList.toggle('is-selected', radio.checked);
    });
    secretsStatus.textContent = SECRETS_MESSAGES[secretsState];
  }

  async function loadSecretsState() {
    if (!(await SecureStore.hasSecrets())) {
      secretsState = 'none';
      return null;
    }
    const credentials = await SecureStore.load();
    secretsState = credentials ? 'unlocked' : 'locked';
    return credentials;
  }

  async function loadSettings() {
    const { calendarSettings = {} } = await browser.storage.local.get('calendarSettings');
    const mode = calendarSettings.mode === 'api' ? 'api' : 'tab';
    const credentials = await loadSecretsState();

    modeRadios.forEach(radio => {
      radio.checked = radio.value === mode;
    });
    faveoUrlInput.value = calendarSettings.faveoUrl || '';
    ticketPathInput.value = Core.normalizeTicketPath(calendarSettings.ticketPath);
    calendarIdInput.value = calendarSettings.calendarId || '';
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

  // Cifra, desbloquea o conserva las credenciales según lo que haya escrito el usuario.
  // Devuelve un error con el campo a enfocar, o null si todo está correcto.
  async function storeCredentials() {
    const credentials = readCredentials();
    const typedCount = Object.values(credentials).filter(Boolean).length;
    const password = masterPasswordInput.value;

    if (typedCount > 0 && typedCount < credentialInputs.length) {
      return {
        input: credentialInputs.find(input => !input.value.trim()),
        message: 'Completa las tres credenciales OAuth: ID de cliente, secreto y Refresh token.'
      };
    }

    if (typedCount === credentialInputs.length) {
      if (password) {
        await SecureStore.save(password, credentials);
      } else if (secretsState === 'unlocked') {
        await SecureStore.saveUnlocked(credentials);
      } else {
        return { input: masterPasswordInput, message: 'Escribe una contraseña maestra para cifrar las credenciales.' };
      }
      secretsState = 'unlocked';
      return null;
    }

    // Sin credenciales escritas: solo sirve lo ya guardado.
    if (secretsState === 'none') {
      return {
        input: clientIdInput,
        message: 'Completa las credenciales OAuth para consultar la disponibilidad del calendario.'
      };
    }
    if (secretsState === 'locked') {
      if (!password) return { input: masterPasswordInput, message: 'Escribe la contraseña maestra para desbloquear las credenciales.' };
      if (!(await SecureStore.unlock(password))) {
        return { input: masterPasswordInput, message: 'Contraseña maestra incorrecta.' };
      }
      secretsState = 'unlocked';
    }
    return null;
  }

  async function saveSettings(event) {
    event.preventDefault();
    const faveoUrl = Core.normalizeBaseUrl(faveoUrlInput.value);
    if (!faveoUrl) {
      setStatus('Indica una URL válida de Faveo Helpdesk, por ejemplo https://helpdesk.tuorganizacion.es', true);
      faveoUrlInput.focus();
      return;
    }

    // Firefox exige pedir el permiso directamente desde el clic, antes de cualquier otro await.
    const permissionError = await requestFaveoPermission(faveoUrl);
    if (permissionError) {
      setStatus(permissionError, true);
      return;
    }

    const mode = getSelectedMode();
    if (mode === 'api') {
      if (!calendarIdInput.value.trim()) {
        setStatus('Indica el ID del calendario de destino.', true);
        calendarIdInput.focus();
        return;
      }
      try {
        const credentialsError = await storeCredentials();
        if (credentialsError) {
          setStatus(credentialsError.message, true);
          credentialsError.input.focus();
          return;
        }
      } catch (error) {
        setStatus(error.message, true);
        masterPasswordInput.focus();
        return;
      }
    }

    const ticketPath = Core.normalizeTicketPath(ticketPathInput.value);
    // Las credenciales ya no se guardan aquí: viven cifradas en calendarSecrets.
    await browser.storage.local.set({
      calendarSettings: { mode, faveoUrl, ticketPath, calendarId: calendarIdInput.value.trim() }
    });
    faveoUrlInput.value = faveoUrl;
    ticketPathInput.value = ticketPath;
    masterPasswordInput.value = '';
    await loadSettings();

    try {
      await ContentRegistration.sync(faveoUrl);
    } catch (error) {
      setStatus(`Preferencias guardadas, pero no se pudo activar la extensión en ${faveoUrl}: ${error.message}`, true);
      return;
    }
    setStatus('Preferencias guardadas. Recarga las pestañas de Faveo que tengas abiertas.');
  }

  modeRadios.forEach(radio => radio.addEventListener('change', updateModeDisplay));
  settingsForm.addEventListener('submit', event => void saveSettings(event));
  void loadSettings();
})();

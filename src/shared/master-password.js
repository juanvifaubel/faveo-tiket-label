(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const { SecureStore } = extension;
  const WATCHED_KEYS = ['calendarSecrets'];
  const WATCHED_SESSION_KEYS = ['calendarSecretsKey'];

  // 'none': aún no existe contraseña maestra · 'locked': existe y la sesión está bloqueada · 'unlocked': existe y está desbloqueada.
  async function getState() {
    if (!(await SecureStore.hasSecrets())) return 'none';
    return (await SecureStore.isUnlocked()) ? 'unlocked' : 'locked';
  }

  // Llama a callback(estado) cada vez que la contraseña se crea, se bloquea o se desbloquea, desde cualquier página.
  function watch(callback) {
    let current = null;
    const refresh = async () => {
      const next = await getState();
      if (next === current) return;
      current = next;
      callback(next);
    };
    browser.storage.onChanged.addListener((changes, area) => {
      const keys = area === 'session' ? WATCHED_SESSION_KEYS : area === 'local' ? WATCHED_KEYS : [];
      if (keys.some(key => key in changes)) void refresh();
    });
    return getState().then(state => {
      current = state;
      return state;
    });
  }

  extension.MasterPassword = Object.freeze({ getState, watch });
})(globalThis);

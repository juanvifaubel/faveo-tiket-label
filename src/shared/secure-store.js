(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};

  // Los datos cifrados van en storage.local (persisten). La clave derivada de la
  // contraseña va en storage.session, que Firefox vacía al cerrar el navegador.
  const SECRETS_KEY = 'calendarSecrets';
  const SESSION_KEY = 'calendarSecretsKey';
  const PBKDF2_ITERATIONS = 600000;
  const MIN_PASSWORD_LENGTH = 8;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // --- Conversión binario <-> texto ---

  function toBase64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }

  function fromBase64(text) {
    return Uint8Array.from(atob(text), character => character.charCodeAt(0));
  }

  // --- Criptografía ---

  async function deriveKey(password, salt) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async function importKey(rawKeyBase64) {
    return crypto.subtle.importKey('raw', fromBase64(rawKeyBase64), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async function encrypt(key, credentials) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(credentials)));
    return { iv: toBase64(iv), data: toBase64(data) };
  }

  // AES-GCM autentica el contenido: con una clave incorrecta lanza un error.
  async function decrypt(key, secrets) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(secrets.iv) }, key, fromBase64(secrets.data));
    return JSON.parse(decoder.decode(plain));
  }

  function pickCredentials(credentials) {
    return {
      clientId: String(credentials.clientId || '').trim(),
      clientSecret: String(credentials.clientSecret || '').trim(),
      refreshToken: String(credentials.refreshToken || '').trim()
    };
  }

  // --- Almacenamiento ---

  async function getSecrets() {
    const stored = await browser.storage.local.get(SECRETS_KEY);
    const secrets = stored[SECRETS_KEY];
    return secrets && secrets.data ? secrets : null;
  }

  async function getSessionKey() {
    const stored = await browser.storage.session.get(SESSION_KEY);
    return stored[SESSION_KEY] || '';
  }

  async function rememberKey(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    await browser.storage.session.set({ [SESSION_KEY]: toBase64(raw) });
  }

  // --- API pública ---

  async function hasSecrets() {
    return Boolean(await getSecrets());
  }

  async function isUnlocked() {
    return Boolean(await getSessionKey());
  }

  // Cifra con una contraseña nueva (sal nueva) y deja el almacén desbloqueado.
  async function save(password, credentials) {
    if (String(password || '').length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La contraseña maestra debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const encrypted = await encrypt(key, pickCredentials(credentials));
    await browser.storage.local.set({ [SECRETS_KEY]: { salt: toBase64(salt), ...encrypted } });
    await rememberKey(key);
  }

  // Vuelve a cifrar reutilizando la clave de la sesión, sin pedir la contraseña.
  async function saveUnlocked(credentials) {
    const [secrets, rawKey] = await Promise.all([getSecrets(), getSessionKey()]);
    if (!secrets || !rawKey) throw new Error('Las credenciales están bloqueadas. Introduce la contraseña maestra.');
    const encrypted = await encrypt(await importKey(rawKey), pickCredentials(credentials));
    await browser.storage.local.set({ [SECRETS_KEY]: { salt: secrets.salt, ...encrypted } });
  }

  // Devuelve true si la contraseña es correcta.
  async function unlock(password) {
    const secrets = await getSecrets();
    if (!secrets) return false;
    try {
      const key = await deriveKey(String(password || ''), fromBase64(secrets.salt));
      await decrypt(key, secrets);
      await rememberKey(key);
      return true;
    } catch {
      return false;
    }
  }

  // Devuelve las credenciales descifradas, o null si no existen o están bloqueadas.
  async function load() {
    const [secrets, rawKey] = await Promise.all([getSecrets(), getSessionKey()]);
    if (!secrets || !rawKey) return null;
    try {
      return pickCredentials(await decrypt(await importKey(rawKey), secrets));
    } catch {
      await browser.storage.session.remove(SESSION_KEY);
      return null;
    }
  }

  extension.SecureStore = { MIN_PASSWORD_LENGTH, hasSecrets, isUnlocked, save, saveUnlocked, unlock, load };
})(globalThis);

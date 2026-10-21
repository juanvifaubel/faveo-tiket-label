# faveo-ticket-labels

Extensión de Firefox (Manifest V3) que enlaza citas con tickets de Faveo Helpdesk. Muestra una etiqueta con la fecha de la cita junto a cada ticket y la sincroniza con Google Calendar.

## Funcionamiento

- Desde el popup se toma el número del ticket de la pestaña activa, se elige fecha, duración y hora, y se guarda la cita. Un ticket puede tener varias citas: cada guardado crea una nueva, y «Editar» en la lista modifica una concreta. La etiqueta en Faveo muestra todas.
- El evento de Calendar solo contiene el título `#N` y una descripción con el número y el enlace al ticket.
- En modo API el calendario es la fuente de verdad: se leen las horas ocupadas y se crean, mueven y borran los eventos. En modo pestaña se abre Google Calendar con la cita preparada, sin credenciales.
- Las etiquetas se inyectan en Faveo solo en la URL configurada; el icono de la extensión muestra el contador de citas próximas.

## Configuración (Preferencias)

- **URL de Faveo:** dirección base. Al guardar, Firefox pide permiso para ese origen y el content script se registra solo ahí. Hay que recargar las pestañas de Faveo ya abiertas.
- **Ruta del ticket:** plantilla del enlace con `{ticket}`; por defecto `/thread/{ticket}`.
- **ID del calendario:** obligatorio en modo API.
- **Modo:** abrir pestaña o API de Google Calendar. La API necesita ID de cliente OAuth, secreto y Refresh token (scope `https://www.googleapis.com/auth/calendar`), que se guardan cifrados con una contraseña maestra; `help.html` explica cómo obtenerlos.

## Dónde se guardan los datos

Todo vive en el equipo, dentro del perfil de Firefox, en `browser.storage.local`. La extensión no tiene servidor propio ni envía datos a terceros; solo habla con Google (Calendar y OAuth) en modo API.

| Dato | Dónde se almacena | Clave |
|------|-------------------|-------|
| Citas (ticket, fecha, hora, ID del evento). Un ticket puede tener varias, cada una con su propio evento | `browser.storage.local` del perfil de Firefox, como copia local. En modo API, además, existen como eventos en tu Google Calendar, que es la fuente de verdad | `ticketLabels` |
| URL de Faveo, ruta del ticket, ID del calendario y modo | `browser.storage.local` | `calendarSettings` |
| ID de cliente OAuth, secreto y Refresh token | `browser.storage.local`, **cifrados con AES-GCM 256**; la clave se deriva de tu contraseña maestra (PBKDF2-SHA256, 600 000 iteraciones) | `calendarSecrets` |
| Clave de descifrado | `browser.storage.session`: solo en memoria de la sesión, Firefox la borra al cerrarse. La contraseña maestra nunca se guarda | `calendarSecretsKey` |
| Opción «Ocultar pasadas» | `browser.storage.local` | `hidePastAppointments` |
| Access token de Google | No se guarda: se pide de nuevo con el Refresh token cuando hace falta | — |

Consecuencias:

- Las citas y los ajustes son por perfil de Firefox: no se sincronizan entre equipos ni perfiles. En modo API, las citas se recuperan desde el calendario.
- Borrar los datos de la extensión o desinstalarla elimina las citas locales y las credenciales, pero no los eventos ya creados en Google Calendar.
- Una extensión cargada como temporal desde `about:debugging` pierde sus datos al cerrar Firefox.
- Las credenciales de Google están protegidas por la contraseña maestra, que se pide una vez cada vez que se abre Firefox (en el popup, en modo API). No hay forma de recuperarla: si se olvida, hay que volver a introducir las credenciales en Preferencias. Protege frente a quien copie el perfil o el disco, pero no frente a malware que ya esté ejecutándose en tu sesión.

## Organización

- `manifest.json`: permisos, popup y scripts de background.
- `popup.html`: captura del ticket y selección de fecha, duración y hora.
- `preferences.html`: URL de Faveo, ruta del ticket, ID del calendario, modo y credenciales OAuth.
- `help.html`: guía de configuración de Google Calendar.
- `src/shared/core.js`: normalización de URL, ruta y tickets, datos de evento, fechas y `hasApiConfig`.
- `src/shared/secure-store.js`: cifrado y desbloqueo de las credenciales OAuth.
- `src/shared/calendar-api.js`: renovación OAuth y operaciones de Google Calendar.
- `src/shared/content-registration.js`: registro dinámico del content script y de su CSS.
- `src/popup/`: `controller.js` (orquestador), `ticket-reader.js` (lee el ticket de la pestaña), `calendar-sync.js` (Calendar y pestaña de plantilla), `schedule-picker.js` (fecha y horas) y `labels-view.js` (lista de citas).
- `src/preferences/controller.js`: carga y guardado de preferencias.
- `src/content/`: lectura del DOM de Faveo y etiquetas inyectadas (`labels.css`).
- `src/background/`: `register-content.js` (registro del content script) y `badge.js` (contador).
- `src/*/*.css`: estilos de cada vista.

## Carga de scripts

No hay bundler ni dependencias externas. Los scripts son clásicos y comparten el namespace `globalThis.FaveoLabels`; quien use `Core` o `CalendarApi` debe cargarse después de ellos.

- **Popup:** `core.js`, `secure-store.js`, `calendar-api.js`, `calendar-sync.js`, `ticket-reader.js`, `schedule-picker.js`, `labels-view.js`, `controller.js`.
- **Preferencias:** `core.js`, `secure-store.js`, `content-registration.js`, `controller.js`.
- **Background:** `core.js`, `content-registration.js`, `register-content.js`, `badge.js` (lista en `manifest.json`).
- **Content script:** se registra dinámicamente con `core.js`, `ticket-dom.js`, `ticket-labels.js` y `controller.js`.

Al añadir un script, actualiza la lista correspondiente. Mantén la lógica del DOM de Faveo en `src/content/` y las llamadas a Calendar API en `src/shared/calendar-api.js`.


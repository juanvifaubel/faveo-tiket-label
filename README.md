# faveo-ticket-labels

Extensión de Firefox (Manifest V3) que enlaza citas con tickets de Faveo Helpdesk. Muestra una etiqueta con la fecha de la cita junto a cada ticket y la sincroniza con Google Calendar.

## Funcionamiento

- Desde el popup se toma el número del ticket de la pestaña activa, se elige fecha, duración y hora, y se guarda la cita. Un ticket puede tener varias citas: cada guardado crea una nueva, y «Editar» en la lista modifica una concreta. La etiqueta en Faveo muestra todas.
- El evento de Calendar solo contiene el título `#N` y una descripción con el número y el enlace al ticket; estos datos se envían a Google Calendar y no los cifra la extensión.
- En modo API el calendario es la fuente de verdad: se leen las horas ocupadas y se crean, mueven y borran los eventos. En modo pestaña se abre Google Calendar con la cita preparada, sin credenciales.
- Las citas locales se cifran con AES-GCM usando la contraseña maestra. En modo API, los fallos de conexión dejan las citas pendientes en local, reservan la franja y se reintentan al volver a abrir el popup.
- En modo API, la extensión avisa con una notificación cuando detecta una pérdida o recuperación de red; el monitor comprueba la conexión una vez por minuto.
- Las etiquetas se inyectan en Faveo solo en la URL configurada; el icono de la extensión muestra el contador de citas próximas.

## Configuración (Preferencias)

- **URL de Faveo:** dirección base. Al guardar, Firefox pide permiso para ese origen y el content script se registra solo ahí. Hay que recargar las pestañas de Faveo ya abiertas.
- **Ruta del ticket:** plantilla del enlace con `{ticket}`; por defecto `/thread/{ticket}`.
- **ID del calendario:** obligatorio en modo API.
- **Contraseña maestra:** obligatoria para cifrar las citas locales (mínimo 12 caracteres). Se solicita al abrir el popup si se cerró la sesión; usa «Cerrar sesión» para bloquearlas manualmente.
- **Horario de trabajo:** uno o varios tramos, cada uno con sus días de la semana y una hora de inicio y fin (p. ej. 08:00–15:00 de lunes a viernes y 16:00–18:30 martes y jueves). El popup solo ofrece franjas de 15 min dentro de esos tramos; por defecto, lunes a viernes de 08:00 a 15:00. Los tramos no pueden solaparse en un mismo día (se avisa al instante y no deja guardar). Se guardan en `calendarSettings.workRanges`.
- **Duraciones de reserva:** lista editable (5–480 min; por defecto 15, 30 y 60) en `calendarSettings.durations`. Quitar una duración no toca las citas ya guardadas ni sus eventos: cada cita conserva su `durationMinutes`, y al editarla se mantiene su duración aunque ya no esté en la lista.
- **Modo:** abrir pestaña o API de Google Calendar. En modo API el calendario es la fuente de verdad: en un navegador nuevo las citas (de 30 días atrás a 90 adelante) se recrean en el almacenamiento local al guardar Preferencias y al abrir el popup. La API necesita ID de cliente OAuth, secreto y Refresh token (scope `https://www.googleapis.com/auth/calendar`), que también se guardan cifrados con la contraseña maestra; `help.html` explica cómo obtenerlos.

## Dónde se guardan los datos

Todo vive en el equipo, dentro del perfil de Firefox, en `browser.storage.local`. La extensión no tiene servidor propio ni envía datos a terceros; solo habla con Google (Calendar y OAuth) en modo API.

| Dato | Dónde se almacena | Clave |
|------|-------------------|-------|
| Citas (ticket, fecha, hora, duración, ID y estado de sincronización). Un ticket puede tener varias | `browser.storage.local` del perfil de Firefox, cifradas con AES-GCM 256 | `ticketLabelsEncrypted` |
| URL de Faveo, ruta del ticket, ID del calendario y modo | `browser.storage.local` | `calendarSettings` |
| ID de cliente OAuth, secreto y Refresh token | `browser.storage.local`, **cifrados con AES-GCM 256**; la clave se deriva de tu contraseña maestra (PBKDF2-SHA256, 600 000 iteraciones) | `calendarSecrets` |
| Clave de descifrado | `browser.storage.session`: solo en memoria de la sesión, Firefox la borra al cerrarse. La contraseña maestra nunca se guarda | `calendarSecretsKey` |
| Opción «Ocultar pasadas» | `browser.storage.local` | `hidePastAppointments` |
| Access token de Google | No se guarda: se pide de nuevo con el Refresh token cuando hace falta | — |

Consecuencias:

- Las citas y los ajustes son por perfil de Firefox: no se sincronizan entre equipos ni perfiles. En modo API, las citas también existen en el calendario y se recuperan desde allí.
- Al guardar Preferencias, las citas antiguas guardadas en claro se migran al almacenamiento cifrado.
- Borrar los datos de la extensión o desinstalarla elimina las citas locales y las credenciales, pero no los eventos ya creados en Google Calendar.
- Una extensión cargada como temporal desde `about:debugging` pierde sus datos al cerrar Firefox.
- La contraseña maestra protege las citas locales y las credenciales de Google. No hay forma de recuperarla: si se olvida, las citas cifradas no se pueden recuperar y hay que volver a introducir las credenciales en Preferencias. Protege frente a quien copie el perfil o el disco, pero no frente a malware que ya esté ejecutándose en tu sesión.
- Los datos de eventos del calendario remoto se transmiten a Google y permanecen legibles en Google Calendar; el cifrado local no cifra esos eventos.

## Organización

- `manifest.json`: permisos, popup y scripts de background.
- `popup.html`: captura del ticket y selección de fecha, duración y hora.
- `preferences.html`: configuración con panel lateral que cambia de sección (contraseña maestra, Faveo, calendario, horario de trabajo y acceso a Google; `src/preferences/panels.js`) y un único botón de guardar. En la primera instalación se abre sola y el popup solo ofrece abrirla hasta que se cree la contraseña maestra.
- `help.html`: ayuda con panel lateral, separada por temas (primer uso, Faveo, modos, Google Cloud/OAuth, sesión, red y problemas).
- `src/shared/core.js`: normalización de URL, ruta y tickets, datos de evento, fechas y `hasApiConfig`.
- `src/shared/secure-store.js`: cifrado y desbloqueo de las credenciales OAuth y las citas.
- `src/shared/master-password.js`: servicio que detecta si existe contraseña maestra (`none`, `locked`, `unlocked`) y avisa de los cambios. Sin contraseña (`none`), el popup y los ajustes de Preferencias quedan bloqueados; el campo pasa a «Crear contraseña», «Desbloquear» o «Actualizar contraseña» según el estado.
- `src/shared/confirm-dialog.js` (+ `.css`): diálogo de confirmación que piden todas las acciones destructivas (quitar una cita, quitar todas, quitar un tramo de horario o una duración). El foco empieza en «Cancelar»; Escape o clic fuera cancelan.
- `src/shared/calendar-api.js`: renovación OAuth y operaciones de Google Calendar.
- `src/shared/content-registration.js`: registro dinámico del content script y de su CSS.
- `src/shared/sidebar-nav.js`: resalta la sección visible en el panel lateral de ayuda y preferencias.
- `src/popup/`: `controller.js` (orquestador), `ticket-reader.js` (lee el ticket de la pestaña), `calendar-sync.js` (Calendar y pestaña de plantilla), `schedule-picker.js` (fecha y horas) y `labels-view.js` (lista de citas).
- `src/preferences/controller.js`: carga y guardado de preferencias.
- `src/content/`: lectura del DOM de Faveo y etiquetas inyectadas (`labels.css`).
- `src/background/`: `register-content.js` (registro del content script), `network-monitor.js` (notificaciones de conectividad) y `badge.js` (contador).
- `src/*/*.css`: estilos de cada vista.

## Carga de scripts

No hay bundler ni dependencias externas. Los scripts son clásicos y comparten el namespace `globalThis.FaveoLabels`; quien use `Core` o `CalendarApi` debe cargarse después de ellos.

- **Popup:** `core.js`, `confirm-dialog.js`, `secure-store.js`, `master-password.js`, `calendar-api.js`, `calendar-sync.js`, `ticket-reader.js`, `schedule-picker.js`, `labels-view.js`, `controller.js`.
- **Preferencias:** `core.js`, `confirm-dialog.js`, `secure-store.js`, `master-password.js`, `calendar-api.js`, `calendar-sync.js`, `content-registration.js`, `panels.js`, `controller.js`.
- **Background:** `core.js`, `secure-store.js`, `content-registration.js`, `labels-provider.js`, `register-content.js`, `network-monitor.js`, `badge.js` (lista en `manifest.json`).
- **Content script:** se registra dinámicamente con `core.js`, `ticket-dom.js`, `ticket-labels.js` y `controller.js`.

Al añadir un script, actualiza la lista correspondiente. Mantén la lógica del DOM de Faveo en `src/content/` y las llamadas a Calendar API en `src/shared/calendar-api.js`.

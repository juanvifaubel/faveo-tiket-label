(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const Core = extension.Core;
  const CalendarApi = extension.CalendarApi;

  function create(elements, options) {
    let selectedDateKey = Core.toDateKey(CalendarApi.getNow());
    let selectedTime = '';
    let calendarMonth = new Date(CalendarApi.getNow().getFullYear(), CalendarApi.getNow().getMonth(), 1);
    let requestId = 0;
    // Últimos eventos leídos del calendario para el día mostrado: permiten repintar al instante tras una acción local.
    let cachedEvents = null;
    let cachedDateKey = '';

    function updateDateLabel() {
      elements.selectedDate.textContent = new Intl.DateTimeFormat('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(Core.parseDateKey(selectedDateKey));
    }

    function setDate(dateKey) {
      selectedDateKey = dateKey;
      selectedTime = '';
      calendarMonth = Core.parseDateKey(dateKey);
      calendarMonth.setDate(1);
      cachedEvents = null;
      elements.timeSlots.replaceChildren();
      elements.calendarPanel.hidden = true;
      elements.calendarToggle.setAttribute('aria-expanded', 'false');
      updateDateLabel();
      renderCalendar();
      void refreshAvailability();
    }

    function renderCalendar() {
      elements.calendarMonth.textContent = new Intl.DateTimeFormat('es-ES', {
        month: 'long',
        year: 'numeric'
      }).format(calendarMonth);
      elements.calendarGrid.replaceChildren();

      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth();
      const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayKey = Core.toDateKey(CalendarApi.getNow());

      for (let index = 0; index < firstWeekday; index += 1) {
        const emptyDay = document.createElement('span');
        emptyDay.className = 'calendar-empty-day';
        emptyDay.setAttribute('aria-hidden', 'true');
        elements.calendarGrid.append(emptyDay);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const dateKey = Core.toDateKey(date);
        const dayButton = document.createElement('button');
        dayButton.type = 'button';
        dayButton.className = 'calendar-day';
        dayButton.textContent = String(day);
        dayButton.setAttribute('role', 'gridcell');
        dayButton.setAttribute('aria-pressed', String(dateKey === selectedDateKey));
        dayButton.setAttribute('aria-label', new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(date));
        dayButton.disabled = dateKey < todayKey;
        dayButton.classList.toggle('is-today', dateKey === todayKey);
        dayButton.classList.toggle('is-selected', dateKey === selectedDateKey);
        dayButton.addEventListener('click', () => setDate(dateKey));
        elements.calendarGrid.append(dayButton);
      }
    }

    function getAppointmentAt() {
      return Core.buildAppointmentValue(selectedDateKey, selectedTime);
    }

    function getDurationMinutes() {
      return Number(elements.duration.value);
    }

    // Franjas cada 15 min dentro de los rangos de trabajo del día. Al editar, se conserva la hora ya asignada aunque quede fuera.
    function getSlotMinutes(day, durationMinutes) {
      const minutes = new Set();
      Core.getWorkIntervals(options.getCalendarSettings().workRanges, day).forEach(interval => {
        for (let minute = interval.start; minute + durationMinutes <= interval.end; minute += 15) minutes.add(minute);
      });
      const kept = options.getExcludedAppointmentId() ? Core.timeToMinutes(selectedTime) : NaN;
      if (!Number.isNaN(kept)) minutes.add(kept);
      return [...minutes].sort((first, second) => first - second);
    }

    // Actualiza los botones existentes en vez de recrearlos, para que no se note el repintado.
    function renderSlots(events) {
      const durationMinutes = getDurationMinutes();
      const day = Core.parseDateKey(selectedDateKey);
      const excludedEventId = options.getExcludedEventId();
      const now = CalendarApi.getNow().getTime();
      const existing = new Map([...elements.timeSlots.querySelectorAll('.time-slot')].map(button => [button.dataset.time, button]));
      const buttons = [];
      const localAppointments = options.getLocalAppointments(selectedDateKey)
        .filter(appointment => appointment.id !== options.getExcludedAppointmentId())
        .map(appointment => ({
          id: appointment.id,
          start: { dateTime: appointment.appointmentAt },
          end: { dateTime: new Date(new Date(appointment.appointmentAt).getTime() + appointment.durationMinutes * 60000).toISOString() }
        }));

      const slotMinutes = getSlotMinutes(day, durationMinutes);
      for (const minute of slotMinutes) {
        const hour = Math.floor(minute / 60);
        const minutePart = minute % 60;
        const time = `${String(hour).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}`;
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minutePart);
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        const busy = CalendarApi.hasOverlap([...events, ...localAppointments], start, end, excludedEventId);
        const past = start.getTime() <= now;
        let button = existing.get(time);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'time-slot';
          button.textContent = time;
          button.dataset.time = time;
        }
        button.disabled = busy || past;
        button.classList.toggle('is-busy', busy);
        button.classList.toggle('is-past', !busy && past);
        button.classList.toggle('is-selected', !busy && !past && time === selectedTime);
        button.setAttribute('aria-pressed', String(!busy && !past && time === selectedTime));
        if (busy) {
          button.title = 'Ya hay una cita o evento en este intervalo';
          button.setAttribute('aria-label', `${time}, ocupado`);
        } else {
          button.title = past ? 'Esta hora ya ha pasado' : '';
          button.removeAttribute('aria-label');
        }
        buttons.push(button);
      }
      elements.timeSlots.replaceChildren(...buttons);

      elements.availabilityStatus.textContent = !slotMinutes.length
        ? 'Este día no tiene horario de trabajo para esa duración. Puedes cambiarlo en Preferencias → Horario.'
        : events.length || localAppointments.length
        ? 'Las franjas ocupadas aparecen deshabilitadas.'
        : 'No hay eventos en esta fecha. Selecciona una franja.';
      const selectedSlot = [...elements.timeSlots.querySelectorAll('.time-slot')]
        .find(button => button.textContent === selectedTime);
      if (selectedTime && (!selectedSlot || selectedSlot.disabled)) {
        selectedTime = '';
        elements.timeSlots.querySelectorAll('.time-slot').forEach(slot => {
          slot.classList.remove('is-selected');
          slot.setAttribute('aria-pressed', 'false');
        });
      }
    }

    async function refreshAvailability() {
      const currentRequestId = ++requestId;
      const settings = options.getCalendarSettings();
      if (settings.mode !== 'api') {
        renderSlots([]);
        elements.availabilityStatus.textContent = 'Modo pestaña: no se consulta el calendario, así que no se marcan horas ocupadas.';
        return;
      }
      if (!Core.hasApiConfig(settings)) {
        elements.timeSlots.replaceChildren();
        elements.availabilityStatus.textContent = 'Faltan las credenciales o el ID del calendario, o las credenciales están bloqueadas. Revisa Preferencias o desbloquéalas arriba.';
        return;
      }

      const dateKey = selectedDateKey;
      // Repinta al momento con lo ya conocido (incluye los cambios locales) y reconcilia después con el calendario.
      if (cachedEvents && cachedDateKey === dateKey) renderSlots(cachedEvents);
      else if (!elements.timeSlots.children.length) elements.availabilityStatus.textContent = 'Consultando el calendario…';
      try {
        const events = await CalendarApi.listEventsForDay(settings, dateKey);
        if (currentRequestId !== requestId) return;
        cachedEvents = events;
        cachedDateKey = dateKey;
        renderSlots(events);
      } catch (error) {
        if (currentRequestId !== requestId) return;
        selectedTime = '';
        elements.timeSlots.replaceChildren();
        elements.availabilityStatus.textContent = `No se pudo comprobar la disponibilidad. No se permite reservar sin verificar: ${error.message}`;
      }
    }

    // Tras borrar o mover una cita, descarta sus eventos de la caché para que su franja se libere sin esperar a la red.
    function releaseEvents(eventIds, { refresh = true } = {}) {
      const ids = new Set(eventIds.filter(Boolean));
      if (cachedEvents && ids.size) cachedEvents = cachedEvents.filter(event => !ids.has(event.id));
      return refresh ? refreshAvailability() : Promise.resolve();
    }

    async function confirmAvailable() {
      const appointmentAt = getAppointmentAt();
      if (!appointmentAt) throw new Error('Selecciona una fecha y una franja horaria disponible.');
      const settings = options.getCalendarSettings();
      const checkCalendar = settings.mode === 'api';
      if (checkCalendar && !Core.hasApiConfig(settings)) {
        throw new Error('Faltan las credenciales o el ID del calendario, o las credenciales están bloqueadas. Revisa Preferencias o desbloquéalas.');
      }

      const dateKey = selectedDateKey;
      const time = selectedTime;
      const durationMinutes = getDurationMinutes();
      const [hour, minute] = time.split(':').map(Number);
      const date = Core.parseDateKey(dateKey);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
      if (start.getTime() <= CalendarApi.getNow().getTime()) throw new Error('No se pueden agendar franjas que ya han pasado.');
      const excludedAppointmentId = options.getExcludedAppointmentId();
      const localEvents = options.getLocalAppointments(dateKey)
        .filter(appointment => appointment.id !== excludedAppointmentId)
        .map(appointment => ({
          id: appointment.id,
          start: { dateTime: appointment.appointmentAt },
          end: { dateTime: new Date(new Date(appointment.appointmentAt).getTime() + appointment.durationMinutes * 60000).toISOString() }
        }));
      if (CalendarApi.hasOverlap(localEvents, start, end)) {
        throw new Error('Esa franja ya está reservada por otra cita guardada localmente.');
      }
      if (!checkCalendar) return { appointmentAt, durationMinutes };

      const events = await CalendarApi.listEventsForDay(settings, dateKey);
      if (dateKey !== selectedDateKey || time !== selectedTime || durationMinutes !== getDurationMinutes()) {
        throw new Error('La selección cambió durante la comprobación. Elige de nuevo la franja.');
      }
      if (CalendarApi.hasOverlap(events, start, end, options.getExcludedEventId())) {
        selectedTime = '';
        void refreshAvailability();
        throw new Error('Alguien ocupó esa franja. Elige otra hora.');
      }

      return { appointmentAt, durationMinutes };
    }

    // Rellena el selector con las duraciones configuradas. Si se edita una cita cuya duración ya no está en la lista,
    // se añade solo para esa edición, así que no se altera la cita guardada ni su evento del calendario.
    function renderDurationOptions(selected, keepMissing) {
      const durations = [...options.getCalendarSettings().durations];
      const wanted = Number(selected);
      if (keepMissing && wanted && !durations.includes(wanted)) {
        durations.push(wanted);
        durations.sort((first, second) => first - second);
      }
      elements.duration.replaceChildren(...durations.map((minutes, index) => {
        const option = new Option(Core.formatDuration(minutes), String(minutes), index === 0, false);
        if (!options.getCalendarSettings().durations.includes(minutes)) option.textContent += ' (ya no disponible)';
        return option;
      }));
      elements.duration.value = durations.includes(wanted) ? String(wanted) : String(durations[0]);
    }

    function refreshDurations() {
      renderDurationOptions(elements.duration.value, false);
      void refreshAvailability();
    }

    function setAppointment(value, durationMinutes = 15) {
      const appointment = new Date(value);
      if (Number.isNaN(appointment.getTime())) return;
      selectedDateKey = Core.toDateKey(appointment);
      selectedTime = `${String(appointment.getHours()).padStart(2, '0')}:${String(appointment.getMinutes()).padStart(2, '0')}`;
      calendarMonth = new Date(appointment.getFullYear(), appointment.getMonth(), 1);
      renderDurationOptions(String(durationMinutes), true);
      renderCalendar();
      updateDateLabel();
      void refreshAvailability();
    }

    function bind() {
      elements.todayButton.addEventListener('click', () => setDate(Core.toDateKey(CalendarApi.getNow())));
      elements.calendarToggle.addEventListener('click', () => {
        const willOpen = elements.calendarPanel.hidden;
        elements.calendarPanel.hidden = !willOpen;
        elements.calendarToggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) renderCalendar();
      });
      elements.previousMonth.addEventListener('click', () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
        renderCalendar();
      });
      elements.nextMonth.addEventListener('click', () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
        renderCalendar();
      });
      elements.duration.addEventListener('change', () => {
        void refreshAvailability();
      });
      elements.timeSlots.addEventListener('click', event => {
        const button = event.target.closest('.time-slot');
        if (!button || button.disabled) return;
        selectedTime = button.dataset.time;
        elements.timeSlots.querySelectorAll('.time-slot').forEach(slot => {
          const selected = slot === button;
          slot.classList.toggle('is-selected', selected);
          slot.setAttribute('aria-pressed', String(selected));
        });
      });
    }

    function init() {
      selectedDateKey = Core.toDateKey(CalendarApi.getNow());
      const now = CalendarApi.getNow();
      calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      renderDurationOptions('', false);
      renderCalendar();
      updateDateLabel();
      bind();
      return refreshAvailability();
    }

    function clearSelectedTime() {
      selectedTime = '';
      void refreshAvailability();
    }

    return Object.freeze({
      init,
      setAppointment,
      getAppointmentAt,
      getDurationMinutes,
      confirmAvailable,
      clearSelectedTime,
      refreshDurations,
      refreshAvailability,
      releaseEvents
    });
  }

  extension.SchedulePicker = Object.freeze({ create });
})(globalThis);

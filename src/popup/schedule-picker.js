(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};
  const Core = extension.Core;
  const CalendarApi = extension.CalendarApi;

  function create(elements, options) {
    let selectedDateKey = Core.toDateKey(new Date());
    let selectedTime = '';
    let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let requestId = 0;

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
      const todayKey = Core.toDateKey(new Date());

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

    function renderSlots(events, currentRequestId) {
      const durationMinutes = getDurationMinutes();
      const day = Core.parseDateKey(selectedDateKey);
      const excludedEventId = options.getExcludedEventId();
      const now = Date.now();
      elements.timeSlots.replaceChildren();

      for (let minute = 8 * 60; minute + durationMinutes <= 15 * 60; minute += 15) {
        const hour = Math.floor(minute / 60);
        const minutePart = minute % 60;
        const time = `${String(hour).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}`;
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minutePart);
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        const busy = CalendarApi.hasOverlap(events, start, end, excludedEventId);
        const past = start.getTime() <= now;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'time-slot';
        button.textContent = time;
        button.disabled = busy || past;
        button.setAttribute('aria-pressed', String(time === selectedTime));

        if (busy) {
          button.classList.add('is-busy');
          button.title = 'Ya hay un evento en este intervalo';
          button.setAttribute('aria-label', `${time}, ocupado`);
        } else if (past) {
          button.classList.add('is-past');
          button.title = 'Esta hora ya ha pasado';
        } else {
          button.classList.toggle('is-selected', time === selectedTime);
          button.addEventListener('click', () => {
            if (currentRequestId !== requestId) return;
            selectedTime = time;
            elements.timeSlots.querySelectorAll('.time-slot').forEach(slot => {
              const selected = slot === button;
              slot.classList.toggle('is-selected', selected);
              slot.setAttribute('aria-pressed', String(selected));
            });
          });
        }
        elements.timeSlots.append(button);
      }

      elements.availabilityStatus.textContent = events.length
        ? 'Las franjas ocupadas aparecen deshabilitadas.'
        : 'No hay eventos en esta fecha. Selecciona una franja.';
    }

    async function refreshAvailability() {
      const currentRequestId = ++requestId;
      elements.timeSlots.replaceChildren();
      const settings = options.getCalendarSettings();
      if (settings.mode !== 'api') {
        renderSlots([], currentRequestId);
        elements.availabilityStatus.textContent = 'Modo pestaña: no se consulta el calendario, así que no se marcan horas ocupadas.';
        return;
      }
      if (!Core.hasApiConfig(settings)) {
        elements.availabilityStatus.textContent = 'Faltan las credenciales o el ID del calendario, o las credenciales están bloqueadas. Revisa Preferencias o desbloquéalas arriba.';
        return;
      }

      elements.availabilityStatus.textContent = 'Consultando el calendario…';
      try {
        const events = await CalendarApi.listEventsForDay(settings, selectedDateKey);
        if (currentRequestId !== requestId) return;
        renderSlots(events, currentRequestId);
      } catch (error) {
        if (currentRequestId !== requestId) return;
        selectedTime = '';
        elements.availabilityStatus.textContent = `No se pudo comprobar la disponibilidad. No se permite reservar sin verificar: ${error.message}`;
      }
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
      if (start.getTime() <= Date.now()) throw new Error('No se pueden agendar franjas que ya han pasado.');
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

    function setAppointment(value, durationMinutes = 15) {
      const appointment = new Date(value);
      if (Number.isNaN(appointment.getTime())) return;
      selectedDateKey = Core.toDateKey(appointment);
      selectedTime = `${String(appointment.getHours()).padStart(2, '0')}:${String(appointment.getMinutes()).padStart(2, '0')}`;
      calendarMonth = new Date(appointment.getFullYear(), appointment.getMonth(), 1);
      elements.duration.value = String(durationMinutes);
      renderCalendar();
      updateDateLabel();
      void refreshAvailability();
    }

    function bind() {
      elements.todayButton.addEventListener('click', () => setDate(Core.toDateKey(new Date())));
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
        selectedTime = '';
        void refreshAvailability();
      });
    }

    function init() {
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
      refreshAvailability
    });
  }

  extension.SchedulePicker = Object.freeze({ create });
})(globalThis);

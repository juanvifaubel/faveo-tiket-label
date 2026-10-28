(function () {
  const links = [...document.querySelectorAll('.sidebar a[data-panel]')];
  const panels = links.map(link => document.getElementById(link.getAttribute('href').slice(1))).filter(Boolean);
  const settingsForm = document.querySelector('#settings-form');
  const LOCK_PANEL = 'seguridad';
  let currentId = LOCK_PANEL;

  // Sin contraseña maestra desbloqueada solo está disponible su propio panel.
  function isAllowed(id) {
    return id === LOCK_PANEL || document.body.dataset.passwordState === 'unlocked';
  }

  function render() {
    const target = panels.find(panel => panel.id === currentId && isAllowed(panel.id)) || panels.find(panel => panel.id === LOCK_PANEL);
    panels.forEach(panel => { panel.hidden = panel !== target; });
    // Los paneles de ajustes viven dentro del formulario de guardado; el de contraseña no.
    settingsForm.hidden = target.id === LOCK_PANEL;
    links.forEach(link => {
      const id = link.getAttribute('href').slice(1);
      const active = id === target.id;
      const blocked = !isAllowed(id);
      link.classList.toggle('is-active', active);
      link.classList.toggle('is-blocked', blocked);
      if (blocked) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    return target;
  }

  function show(id, { focus = false } = {}) {
    currentId = id;
    const target = render();
    if (focus) target.querySelector('input:not([type="radio"]):not(:disabled)')?.focus();
  }

  function goTo(id, options) {
    history.replaceState(null, '', `#${id}`);
    show(id, options);
  }

  links.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    goTo(link.getAttribute('href').slice(1));
  }));

  document.querySelectorAll('[data-next-panel]').forEach(button => button.addEventListener('click', () => {
    goTo(button.dataset.nextPanel, { focus: true });
    window.scrollTo({ top: 0 });
  }));

  window.addEventListener('panel-request', event => goTo(event.detail));
  window.addEventListener('password-state', render);
  window.addEventListener('hashchange', () => show(location.hash.slice(1) || LOCK_PANEL));

  show(location.hash.slice(1) || LOCK_PANEL);
})();

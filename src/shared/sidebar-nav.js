(function () {
  const links = [...document.querySelectorAll('.sidebar a[href^="#"]')];
  const sections = links
    .map(link => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (!sections.length) return;

  function setActive(id) {
    links.forEach(link => {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  // La sección activa es la última cuyo encabezado ya ha pasado la zona superior de la ventana.
  function update() {
    const threshold = 120;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top - threshold <= 0) current = section;
    }
    if (atBottom) current = sections[sections.length - 1];
    setActive(current.id);
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('hashchange', update);
  update();
})();

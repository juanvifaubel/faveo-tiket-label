(function (global) {
  const extension = global.FaveoLabels = global.FaveoLabels || {};

  // Pide confirmación antes de una acción destructiva. Resuelve true solo si el usuario la acepta;
  // Escape, clic fuera o «Cancelar» resuelven false.
  function ask({ title, message, confirmLabel = 'Eliminar' }) {
    if (document.querySelector('dialog.confirm-dialog')) return Promise.resolve(false);
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'confirm-dialog';
      dialog.setAttribute('aria-labelledby', 'confirm-dialog-title');

      const heading = document.createElement('h2');
      heading.id = 'confirm-dialog-title';
      heading.textContent = title;
      const text = document.createElement('p');
      text.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'confirm-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'confirm-cancel';
      cancel.textContent = 'Cancelar';
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'confirm-accept';
      accept.textContent = confirmLabel;
      actions.append(cancel, accept);
      dialog.append(heading, text, actions);

      let accepted = false;
      accept.addEventListener('click', () => {
        accepted = true;
        dialog.close();
      });
      cancel.addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(accepted);
      });

      document.body.append(dialog);
      dialog.showModal();
      // El foco empieza en «Cancelar» para que un Intro accidental no elimine nada.
      cancel.focus();
    });
  }

  extension.ConfirmDialog = Object.freeze({ ask });
})(globalThis);

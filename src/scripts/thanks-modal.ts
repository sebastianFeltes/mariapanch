export function mountThanksModal(rootId = 'thanks-modal') {
  const modal = document.getElementById(rootId);
  if (!modal) {
    return { open: () => {}, close: () => {} };
  }

  const panel = modal.querySelector<HTMLElement>('.thanks-modal__panel');
  const closeTargets = modal.querySelectorAll<HTMLElement>('[data-close-thanks]');

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove('is-modal-open');
  };

  const open = () => {
    modal.hidden = false;
    document.body.classList.add('is-modal-open');
    panel?.focus();
  };

  closeTargets.forEach((el) => el.addEventListener('click', close));

  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  return { open, close };
}

const dialog = document.querySelector('#dialog');
const trigger = document.querySelector('#open-dialog');
const close = document.querySelector('#close-dialog');
const fixed = new URLSearchParams(location.search).has('fixed');
if (fixed) {
  document.querySelector('#icon-action').setAttribute('aria-label', 'Add to favourites');
  document.querySelector('#version').textContent = 'Fixed version: the icon has a name and closing returns focus to its trigger.';
}
trigger.addEventListener('click', () => dialog.showModal());
close.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  (fixed ? trigger : document.querySelector('#after')).focus();
});

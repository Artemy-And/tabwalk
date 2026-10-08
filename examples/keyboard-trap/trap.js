const fixed = new URLSearchParams(window.location.search).has('fixed');
document.body.classList.toggle('fixed', fixed);
document.getElementById('variant').textContent = fixed ? 'Fixed: native keyboard navigation' : 'Broken keyboard interaction';

const form = document.querySelector('form');
const first = form.querySelector('input');
const last = form.querySelector('button');
form.addEventListener('submit', (event) => event.preventDefault());

// An unnecessary custom focus loop is the only difference between the two versions.
if (!fixed) {
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  });
}

document.addEventListener('keydown', (event) => {
  document.getElementById('key').textContent =
    'Key: ' + (event.shiftKey ? 'Shift + ' : '') + event.key;
});
document.addEventListener('focusin', (event) => {
  const element = event.target;
  document.getElementById('trace').textContent =
    'Focus: ' + (element.labels?.[0]?.textContent || element.textContent.trim() || element.tagName.toLowerCase());
});

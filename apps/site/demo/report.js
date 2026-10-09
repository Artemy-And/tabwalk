const findings = [...document.querySelectorAll('.finding')];
const filters = [...document.querySelectorAll('[data-filter]')];
const search = document.getElementById('search');
let selected = 'all';
function update() {
  const query = search.value.trim().toLowerCase();
  let count = 0;
  for (const finding of findings) {
    const matches = (selected === 'all' || finding.dataset.checker === selected || finding.dataset.kind === selected) &&
      (!query || finding.textContent.toLowerCase().includes(query));
    finding.hidden = !matches;
    if (matches) count++;
  }
  document.getElementById('result-count').textContent = count + ' findings shown';
  document.getElementById('empty').hidden = count > 0;
}
for (const button of filters) {
  button.addEventListener('click', () => {
    selected = button.dataset.filter;
    for (const filter of filters) filter.setAttribute('aria-pressed', String(filter === button));
    update();
  });
}
search.addEventListener('input', update);

let previous;
window.addEventListener('beforeprint', () => {
  previous = [...document.querySelectorAll('details')].map((details) => [details, details.open]);
  for (const [details] of previous) details.open = true;
});
window.addEventListener('afterprint', () => {
  for (const [details, open] of previous ?? []) details.open = open;
});
document.getElementById('print').addEventListener('click', () => window.print());

// The form to try: the keyboard example's focus loop, which lets go after a few rounds so no visitor stays stuck.
const tryit = document.getElementById('tryit');
if (tryit) {
  const ROUNDS = 3;
  const form = tryit.querySelector('form');
  const first = form.querySelector('input');
  const last = form.querySelector('button');
  const exit = tryit.querySelector('.after');
  const status = document.getElementById('tryit-status');
  const variants = [...tryit.querySelectorAll('[data-variant]')].filter((el) => el.tagName === 'BUTTON');
  let fixed = false;
  let rounds = 0;
  let released = false;
  const say = (text) => { status.textContent = text; };
  const choose = (name) => {
    fixed = name === 'fixed';
    rounds = 0;
    released = false;
    tryit.dataset.variant = name;
    document.getElementById('variant').textContent = fixed ? 'Fixed: native keyboard navigation' : 'Broken keyboard interaction';
    for (const button of variants) button.setAttribute('aria-pressed', String(button.dataset.variant === name));
    say(fixed
      ? 'Fixed version. Press Start, then Tab: focus goes through the form and on to “Read our privacy policy”.'
      : 'Press Start, then Tab. Try to reach “Read our privacy policy”.');
  };
  for (const button of variants) button.addEventListener('click', () => choose(button.dataset.variant));
  document.getElementById('tryit-start').addEventListener('click', () => {
    rounds = 0;
    released = false;
    tryit.querySelector('.before').focus();
    say('Focus is on “Read the newsletter”. Now press Tab.');
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !fixed && !released && rounds > 0) say('Escape does not get out either. Keep pressing Tab.');
    if (fixed || released || event.key !== 'Tab') return;
    const forward = !event.shiftKey && document.activeElement === last;
    const backward = event.shiftKey && document.activeElement === first;
    if (!forward && !backward) return;
    if (rounds >= ROUNDS) {
      released = true;
      say(`That is a keyboard trap: ${ROUNDS} rounds, and Tab, Shift+Tab and Escape never left the form. Tabwalk reports it as a WCAG 2.1.2 failure. This demo lets go now; a real trap does not. Try the fixed version to compare.`);
      return;
    }
    event.preventDefault();
    (forward ? first : last).focus();
    rounds++;
    say(`Round ${rounds} of ${ROUNDS}: focus jumped back to ${forward ? 'the email field' : 'Subscribe'} instead of leaving the form.`);
  });
  tryit.addEventListener('keydown', (event) => {
    document.getElementById('key').textContent = 'Key: ' + (event.shiftKey ? 'Shift + ' : '') + event.key;
  });
  tryit.addEventListener('focusin', (event) => {
    const element = event.target;
    if (!element.closest('.tryit-page')) return;
    document.getElementById('trace').textContent =
      'Focus: ' + (element.labels?.[0]?.textContent || element.textContent.trim() || element.tagName.toLowerCase());
    if (element === exit && fixed) say('Focus left the form and reached “Read our privacy policy”. Nothing holds it now: the fix removed one keydown handler.');
  });
  choose('broken');
}

// Without a keyboard there is nothing to press, so phones and tablets get the recording first.
if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
  const recording = document.getElementById('recording');
  if (recording) recording.open = true;
}

// The dashboard tour loops, so it can be paused (and starts paused for reduced motion, via its <source>).
const tour = document.getElementById('tour');
const tourToggle = document.getElementById('tour-toggle');
if (tour && tourToggle && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const sources = [...tour.querySelectorAll('source')];
  const image = tour.querySelector('img');
  const animated = { light: image.getAttribute('src'), dark: sources.find((s) => !s.media.includes('reduced'))?.srcset };
  const still = { light: 'dashboard-still-light.png', dark: 'dashboard-still-dark.png' };
  tourToggle.hidden = false;
  tourToggle.addEventListener('click', () => {
    const pause = tourToggle.getAttribute('aria-pressed') !== 'true';
    const scheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    for (const source of sources) source.remove();
    image.src = (pause ? still : animated)[scheme];
    tourToggle.setAttribute('aria-pressed', String(pause));
    tourToggle.textContent = pause ? 'Play animation' : 'Pause animation';
  });
}

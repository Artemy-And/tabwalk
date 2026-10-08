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

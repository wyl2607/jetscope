export function renderSourceChip({ label, status }) {
  const tone = status === 'ok' ? 'ok' : status === 'reference' ? 'warn' : 'error';
  return `<span class="source-chip source-chip--${tone}">${label}</span>`;
}

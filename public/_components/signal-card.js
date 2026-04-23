export function renderSignalCard({ title, value, detail = '', tone = 'neutral' }) {
  return `
    <article class="signal-card signal-card--${tone}">
      <span>${title}</span>
      <strong>${value}</strong>
      ${detail ? `<small>${detail}</small>` : ''}
    </article>
  `;
}

export function renderRouteRow({ name, value, detail = '', href = '', status = '' }) {
  const content = `
    <strong>${name}</strong>
    <span>${detail}</span>
    <em>${value}</em>
    ${status ? `<small class="route-row-status">${status}</small>` : ''}
  `;

  return `
    <article class="route-row">
      ${href ? `<a class="route-row-link" href="${href}">${content}</a>` : content}
    </article>
  `;
}

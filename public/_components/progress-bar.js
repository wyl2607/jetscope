export function renderProgressBar(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<span class="mini-progress"><span style="width:${safePercent}%"></span></span>`;
}

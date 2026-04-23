export function mountSliderTriplet(root, values) {
  if (!root) return;
  root.dataset.component = 'slider-triplet';
  root.dataset.values = JSON.stringify(values ?? {});
}

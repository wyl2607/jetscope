export function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, value));
}

export function roundTo(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

export function percentDelta(base: number, next: number): number {
  if (!Number.isFinite(base) || base === 0) {
    return 0;
  }
  return ((next - base) / base) * 100;
}

export function safeDivide(a: number, b: number, fallback = 0): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return fallback;
  }
  return a / b;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampUnitRate(value: number) {
  return clamp(value, 0, 1);
}

export function toPercent(value: number) {
  return Math.floor(value * 100);
}

export function enforceMin(value: number, min: number) {
  return Math.max(min, value);
}

export function enforceMinInt(value: number, min: number) {
  return enforceMin(Math.round(value), min);
}

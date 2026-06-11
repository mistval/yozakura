export function clampUnitRate(value: number) {
  return Math.max(0, Math.min(1, value));
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

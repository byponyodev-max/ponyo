export function parsePriceFilter(value: string | string[] | undefined, fallback: number) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return fallback;

  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : fallback;
}

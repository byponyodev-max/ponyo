export type ReservationCountryCount = { country: string; count: number };

type ProductReservations = {
  reservationsByCountry?: readonly ReservationCountryCount[];
};

export function aggregateReservationsByCountry(products: readonly ProductReservations[]): ReservationCountryCount[] {
  const totals = new Map<string, number>();
  for (const product of products) {
    for (const entry of product.reservationsByCountry ?? []) {
      totals.set(entry.country, (totals.get(entry.country) ?? 0) + entry.count);
    }
  }
  return [...totals].map(([country, count]) => ({ country, count }))
    .sort((left, right) => right.count - left.count || left.country.localeCompare(right.country));
}

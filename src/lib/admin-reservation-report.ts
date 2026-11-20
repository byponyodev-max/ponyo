export type ReservationCountryCount = { country: string; count: number };

export type DemandSortOrder = "most" | "least";
export type DemandReportProduct = {
  id: string;
  name: string;
  sku: string;
  reservationCount?: number;
  interestCount?: number;
  reservationsByCountry?: readonly ReservationCountryCount[];
  interestsByCountry?: readonly ReservationCountryCount[];
};

type ProductReservations = {
  reservationsByCountry?: readonly ReservationCountryCount[];
};

export function filterAndSortDemandProducts<T extends DemandReportProduct>(
  products: readonly T[],
  kind: "reservations" | "interests",
  query: string,
  country: string,
  sort: DemandSortOrder,
): T[] {
  const search = query.trim().toLocaleLowerCase();
  return products
    .filter((product) => {
      const matchesSearch = !search
        || product.name.toLocaleLowerCase().includes(search)
        || product.sku.toLocaleLowerCase().includes(search);
      const countryCounts = kind === "reservations" ? product.reservationsByCountry : product.interestsByCountry;
      return matchesSearch && (!country || countryCounts?.some((entry) => entry.country === country));
    })
    .sort((left, right) => {
      const leftCount = kind === "reservations" ? left.reservationCount ?? 0 : left.interestCount ?? 0;
      const rightCount = kind === "reservations" ? right.reservationCount ?? 0 : right.interestCount ?? 0;
      const countDifference = sort === "most" ? rightCount - leftCount : leftCount - rightCount;
      return countDifference || left.name.localeCompare(right.name);
    });
}

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

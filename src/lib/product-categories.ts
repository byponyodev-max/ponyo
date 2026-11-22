export type ProductCategoryDefinition = {
  slug: string;
  name: string;
  parentSlug?: string;
};

export const PRODUCT_CATEGORY_DEFINITIONS: ProductCategoryDefinition[] = [
  { slug: "plush-toys", name: "Plush Toys" },
  { slug: "collectible-plush", name: "Collectible Plush", parentSlug: "plush-toys" },
  { slug: "character-plush", name: "Character Plush", parentSlug: "plush-toys" },
  { slug: "oversized", name: "Oversized" },
  { slug: "giant-plush", name: "Giant Plush", parentSlug: "oversized" },
  { slug: "oversized-soft-objects", name: "Oversized Soft Objects", parentSlug: "oversized" },
  { slug: "cushions", name: "Cushions" },
  { slug: "designer-cushions", name: "Designer Cushions", parentSlug: "cushions" },
  { slug: "character-pillows", name: "Character Pillows", parentSlug: "cushions" },
  { slug: "soft-furniture", name: "Soft Furniture" },
  { slug: "chairs", name: "Chairs", parentSlug: "soft-furniture" },
  { slug: "beds", name: "Beds", parentSlug: "soft-furniture" },
  { slug: "seating", name: "Seating", parentSlug: "soft-furniture" },
  { slug: "wall-decor", name: "Wall & Decor" },
];

export const PRODUCT_CATEGORY_ROOT_SLUGS = [
  "plush-toys",
  "oversized",
  "cushions",
  "soft-furniture",
  "wall-decor",
];

export function productCategoryTranslationKey(slug: string) {
  return `shop.category.${slug.replaceAll("-", "_")}`;
}

export function orderProductCategories<T extends { slug: string }>(categories: T[]) {
  const order = new Map(PRODUCT_CATEGORY_DEFINITIONS.map(({ slug }, index) => [slug, index]));
  return [...categories].sort((left, right) =>
    (order.get(left.slug) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.slug) ?? Number.MAX_SAFE_INTEGER),
  );
}

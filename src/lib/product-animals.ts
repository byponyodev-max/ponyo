import type { Product } from "@/types/product";

export const animalFilters = [
  { name: "All animals", key: "shop.category.all", slug: "all", tags: [] },
  { name: "Bears", key: "home.categories.bears", slug: "bears", tags: ["bear", "teddy"] },
  { name: "Bunnies", key: "home.categories.bunnies", slug: "bunnies", tags: ["bunny", "rabbit"] },
  { name: "Cats", key: "home.categories.cats", slug: "cats", tags: ["cat", "kitten", "kitty"] },
  { name: "Puppies", key: "home.categories.puppies", slug: "puppies", tags: ["puppy", "dog", "corgi"] },
  { name: "Pandas", key: "home.categories.pandas", slug: "pandas", tags: ["panda"] },
  { name: "Penguins", key: "home.categories.penguins", slug: "penguins", tags: ["penguin"] },
  { name: "Cute Characters", key: "home.categories.characters", slug: "characters", tags: ["character"] },
] as const;

export function matchesAnimal(product: Product, tags: readonly string[]) {
  const normalize = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bpuppies\b/g, "puppy")
    .replace(/\bbunnies\b/g, "bunny")
    .replace(/\bpenguins\b/g, "penguin")
    .replace(/\bkittens\b/g, "kitten")
    .replace(/\bteddies\b/g, "teddy");
  const productTags = new Set((product.tags ?? []).map(normalize));
  const details = normalize(`${product.categoryName} ${product.productType ?? ""} ${product.name} ${product.slug}`);
  const words = new Set(details.split(/\s+/));
  return tags.length === 0 || tags.some((tag) => productTags.has(tag) || words.has(tag));
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductGrid } from "@/components/product/product-grid";
import { getLocalizedProducts, getProductCategories } from "@/services/localized-products.server";
import { orderProductCategories, PRODUCT_CATEGORY_ROOT_SLUGS, productCategoryTranslationKey } from "@/lib/product-categories";
import type { ProductCategory } from "@/services/ponyo-api.client";
import type { Product } from "@/types/product";

const categoryFallbackImages: Record<string, string> = {
	"plush-toys": "/images/categories/plush-toys.png",
	oversized: "/images/categories/oversized.png",
	cushions: "/images/categories/cushions.png",
	"soft-furniture": "/images/categories/soft-furniture.png",
	"wall-decor": "/images/categories/wall-decor.png",
};

const animalCollections = [
	{ titleKey: "static.collections.animal.bears", slug: "bears", tag: "bear", fallback: "/images/catalog/maker-bear.jpg" },
	{ titleKey: "static.collections.animal.bunnies", slug: "bunnies", tag: "bunny", fallback: "/images/catalog/maker-bunny.jpg" },
	{ titleKey: "static.collections.animal.cats", slug: "cats", tag: "cat", fallback: "/images/catalog/maker-cat.jpg" },
	{ titleKey: "static.collections.animal.characters", slug: "characters", tag: "character", fallback: "/images/catalog/maker-dinosaur.jpg" },
	{ titleKey: "static.collections.animal.pandas", slug: "pandas", tag: "panda", fallback: "/images/catalog/ponyo-12.png" },
	{ titleKey: "static.collections.animal.puppies", slug: "puppies", tag: "puppy", fallback: "/images/catalog/maker-dog.jpg" },
	{ titleKey: "static.collections.animal.penguins", slug: "penguins", tag: "penguin", fallback: "/images/catalog/maker-penguin.jpg" },
] as const;

function productsForTag(products: Product[], tag: string) {
	return products.filter((product) => product.tags?.some((item) => item.toLowerCase() === tag) || product.categoryName.toLowerCase() === tag);
}

function productsForCategory(products: Product[], category: ProductCategory, categories: ProductCategory[]) {
	const children = categories.filter((item) => item.parentId === category.id);
	const childIds = new Set(children.map((item) => item.id));
	return products.filter((product) =>
		product.categoryId === category.id
		|| (product.categoryId != null && childIds.has(product.categoryId))
		|| product.categorySlug === category.slug
		|| children.some((child) => child.slug === product.categorySlug),
	);
}

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations();
	return { title: t("static.collections.metadata.title") };
}

export default async function CollectionsPage() {
	const t = await getTranslations();
	const [products, categoryData] = await Promise.all([getLocalizedProducts(), getProductCategories()]);
	const rootCategorySlugs = new Set<string>(PRODUCT_CATEGORY_ROOT_SLUGS);
	const categories = orderProductCategories(categoryData).filter((category) =>
		!category.parentId && rootCategorySlugs.has(category.slug),
	);
	const categoryLabel = (category: ProductCategory) => {
		const key = productCategoryTranslationKey(category.slug);
		return t.has(key) ? t(key) : category.name;
	};
	const heroImages = products.filter((product) => Boolean(product.image)).slice(0, 2);
	const newArrivals = productsForTag(products, "new-arrival");
	const featuredProducts = [...newArrivals, ...products.filter((product) => !newArrivals.some((arrival) => arrival.id === product.id))].slice(0, 4);
	const featuredCards = [
		...categories.map((category) => {
			const matching = productsForCategory(products, category, categoryData);
			const children = categoryData.filter((item) => item.parentId === category.id);
			return {
				slug: category.slug,
				href: `/collections/${category.slug}`,
				image: categoryFallbackImages[category.slug] ?? matching[0]?.image ?? "/images/catalog/ponyo-5.png",
				eyebrow: t("static.collections.featured.eyebrow"),
				title: categoryLabel(category),
				description: children.length
					? children.map(categoryLabel).join(" · ")
					: t.has("home.aisles.wall_decor_sub") ? t("home.aisles.wall_decor_sub") : "Wall art and decor",
				count: matching.length,
			};
		}),
		{
			slug: "new-arrivals",
			href: "/collections/new-arrivals",
			image: newArrivals[0]?.image ?? "/images/catalog/strawberry-mushroom-plush.webp",
			eyebrow: t("static.collections.feature.new.eyebrow"),
			title: t("static.collections.feature.new.title"),
			description: t("static.collections.feature.new.body"),
			count: newArrivals.length,
		},
	];
	return (
		<SiteFrame className="store-page collections-landing-page">
			<div className="collections-landing">
				<header className="collections-landing-hero">
					<div className="collections-landing-hero-copy">
						<p className="eyebrow">{t("static.collections.hero.eyebrow")}</p>
						<h1>{t("static.collections.hero.title_lead")} <em>{t("static.collections.hero.title_accent")}</em></h1>
						<p>{t("static.collections.hero.body")}</p>
						<div className="collections-landing-actions">
							<Link className="shop-button shop-button-orange" href="/collections/all">{t("static.collections.hero.shop_all")} <b>→</b></Link>
							<a className="collections-size-link" href="#shop-by-size">{t("static.collections.hero.shop_size")} <span aria-hidden="true">↓</span></a>
						</div>
					</div>
					<div className="collections-landing-hero-bubble" aria-hidden="true"><Image src="/images/catalog/maker-penguin.jpg" alt="" fill priority sizes="(max-width: 767px) 68px, 132px" /></div>
					<div className="collections-landing-hero-art" aria-hidden="true"><span className="collections-landing-orbit"/><Image src={heroImages[0]?.image ?? "/images/plushies-home-2.png"} alt="" fill sizes="(max-width: 767px) 34vw, 320px" priority/><span className="collections-landing-stamp">{t("static.collections.hero.stamp")}</span></div>
				</header>

				<section className="collections-featured" aria-labelledby="collections-featured-title">
					<div className="collections-section-heading"><div><p className="eyebrow">{t("static.collections.featured.eyebrow")}</p><h2 id="collections-featured-title">{t("static.collections.featured.title")}</h2><p>{t("static.collections.featured.body")}</p></div><Link href="/collections/all">{t("static.collections.featured.view_all")} <span aria-hidden="true">→</span></Link></div>
					<div className="collections-featured-grid">{featuredCards.map((collection) => {
						return <Link className={`collections-feature-card collections-feature-card--${collection.slug}`} href={collection.href} key={collection.slug}>
							<Image src={collection.image} alt="" fill quality={90} sizes="(max-width: 767px) 48vw, 16vw" />
							<span className="collections-feature-shade" />
							<span className="collections-feature-copy"><small>{collection.eyebrow}</small><strong>{collection.title}</strong><span>{collection.description}</span><b>{t(collection.count === 1 ? "static.collections.count.one" : "static.collections.count.other", { count: collection.count })} <i aria-hidden="true">→</i></b></span>
						</Link>;
					})}</div>
				</section>

				<section className="collections-animal-section" aria-labelledby="collections-animal-title">
					<div className="collections-section-heading"><div><p className="eyebrow">{t("static.collections.animals.eyebrow")}</p><h2 id="collections-animal-title">{t("static.collections.animals.title")}</h2><p>{t("static.collections.animals.body")}</p></div></div>
					<div className="collections-animal-grid">{animalCollections.map((collection) => {
						const matching = productsForTag(products, collection.tag);
						return <Link href={`/collections/${collection.slug}`} key={collection.slug} className="collections-animal-card">
							<span className="collections-animal-image"><Image src={matching[0]?.image ?? collection.fallback} alt="" fill sizes="(max-width: 600px) 42vw, 150px" /></span>
							<span className="collections-animal-copy"><strong>{t(collection.titleKey)}</strong><small>{matching.length ? t(matching.length === 1 ? "static.collections.count.one" : "static.collections.count.other", { count: matching.length }) : t("static.collections.explore")}</small></span><b aria-hidden="true">→</b>
						</Link>;
					})}</div>
				</section>

				<section className="collections-size-section" id="shop-by-size" aria-labelledby="collections-size-title">
					<div><p className="eyebrow">{t("static.collections.size.eyebrow")}</p><h2 id="collections-size-title">{t("static.collections.size.title")}</h2><p>{t("static.collections.size.body")}</p></div>
					<div className="collections-size-grid">{[
						{ name: t("static.collections.size.small"), key: "Small", range: t("static.collections.size.small_range") },
						{ name: t("static.collections.size.medium"), key: "Medium", range: t("static.collections.size.medium_range") },
						{ name: t("static.collections.size.large"), key: "Large", range: t("static.collections.size.large_range") },
						{ name: t("static.collections.size.xl"), key: "XL", range: t("static.collections.size.xl_range") },
					].map((size) => <Link href={`/collections/all?size=${size.key}`} key={size.key}><span>{size.name}</span><small>{size.range}</small><b aria-hidden="true">→</b></Link>)}</div>
				</section>

				{featuredProducts.length > 0 && <section className="collections-new-arrivals" aria-labelledby="collections-arrivals-title"><div className="collections-section-heading"><div><p className="eyebrow">{t("static.collections.arrivals.eyebrow")}</p><h2 id="collections-arrivals-title">{t("static.collections.arrivals.title")}</h2></div><Link href="/collections/new-arrivals">{t("static.collections.arrivals.link")} <span aria-hidden="true">→</span></Link></div><ProductGrid products={featuredProducts} compact /></section>}
			</div>
		</SiteFrame>
	);
}

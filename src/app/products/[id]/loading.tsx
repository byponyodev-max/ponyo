import { getTranslations } from "next-intl/server";

export default async function ProductDetailLoading() {
  const t = await getTranslations();
  return (
    <section className="product-loading store-container" role="status" aria-label={t("static.loading.product_aria")}>
      <span className="sr-only">{t("static.loading.product_text")}</span>
      <div className="product-loading-image" />
      <div className="product-loading-copy">
        <div className="product-loading-line product-loading-line--short" />
        <div className="product-loading-line product-loading-line--title" />
        <div className="product-loading-line product-loading-line--price" />
        <div className="product-loading-line" />
        <div className="product-loading-button" />
      </div>
    </section>
  );
}
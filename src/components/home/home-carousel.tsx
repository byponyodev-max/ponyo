"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import type { ProductImage } from "@/types/product";

type HomeCarouselCategory = {
  slug: string;
  title: string;
  description: string;
  href: string;
  image: ProductImage;
  heroImage: ProductImage;
  imageAlt: string;
};

type HomeCarouselSlide = {
  key: string;
  category?: boolean;
  kicker: string;
  title: string;
  description: string;
  action: string;
  href: string;
  image: ProductImage;
  imageAlt: string;
};

const newArrivalsSlide: HomeCarouselSlide = {
  key: "new",
  kicker: "JUST LANDED",
  title: "New Discoveries",
  description: "Fresh finds from new brands and makers.",
  action: "See what is new",
  href: "/collections/new-arrivals",
  image: "/images/home-hero/plush-room-hd.png",
  imageAlt: "",
};

export function HomeCarousel({ categories }: { categories: HomeCarouselCategory[] }) {
  const slides: HomeCarouselSlide[] = [
    ...categories.map((category) => ({
      key: category.slug,
      category: true,
      kicker: "",
      title: category.title,
      description: category.description,
      action: "Shop All",
      href: category.href,
      image: category.heroImage,
      imageAlt: category.imageAlt,
    })),
    newArrivalsSlide,
  ];
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const reduceMotion = useRef(false);
  const { t } = useLocalization();

  const copyKeys: Record<string, { kicker: string; title: string; description: string; action: string }> = {
    new: { kicker: "home.slides.new_eyebrow", title: "home.pillars.new_title", description: "home.pillars.new_body", action: "home.slides.new_cta" },
  };

  const markActive = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.min(slides.length - 1, Math.max(0, Math.round(Math.abs(track.scrollLeft) / track.clientWidth)));
    activeRef.current = index;
    setActive(index);
  }, [slides.length]);

  const goTo = useCallback((index: number, smooth = true) => {
    const track = trackRef.current;
    if (!track) return;
    const normalized = (index + slides.length) % slides.length;
    activeRef.current = normalized;
    setActive(normalized);
    track.scrollTo({ left: normalized * track.clientWidth * (document.dir === "rtl" ? -1 : 1), behavior: smooth && !reduceMotion.current ? "smooth" : "auto" });
  }, [slides.length]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (timerRef.current !== null || slides.length < 2 || reduceMotion.current || document.hidden) return;
    timerRef.current = window.setInterval(() => goTo(activeRef.current + 1), 7000);
  }, [goTo, slides.length]);

  const restart = useCallback(() => { stop(); start(); }, [start, stop]);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    start();
    const onVisibility = () => document.hidden ? stop() : start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [start, stop]);

  return (
    <section className="store-hero-carousel" aria-label={t("home.slides.label", "Featured plush")} aria-roledescription="carousel">
      <div className="store-hero-track" ref={trackRef} onScroll={markActive} onTouchStart={stop} onTouchEnd={restart}>
        {slides.map((slide, index) => <div className="store-hero-slide" key={slide.key} role="group" aria-roledescription="slide" aria-label={`${index + 1} / ${slides.length}`}>
          <Image className="store-hero-image" src={slide.image} alt={slide.imageAlt} fill priority={index === 0} quality={90} sizes="(min-width: 1400px) 1400px, 100vw" />
          <div className="store-hero-overlay" aria-hidden="true" />
          <div className="store-hero-copy" aria-live={index === active ? "polite" : undefined}>
            <span className="store-hero-kicker">{slide.category ? t("home.slides.label", "Featured plush") : t(copyKeys[slide.key].kicker, slide.kicker)}</span><h2>{slide.category ? slide.title : t(copyKeys[slide.key].title, slide.title)}</h2><p>{slide.category ? slide.description : t(copyKeys[slide.key].description, slide.description)}</p><Link className="store-hero-action" href={slide.href}>{slide.category ? t("home.footer.shop_all", "Shop All") : t(copyKeys[slide.key].action, slide.action)}</Link>
          </div>
        </div>)}
      </div>
      <button className="store-hero-arrow previous" type="button" aria-label={t("home.slides.previous", "Previous slide")} onClick={() => { goTo(activeRef.current - 1); restart(); }}>‹</button>
      <button className="store-hero-arrow next" type="button" aria-label={t("home.slides.next", "Next slide")} onClick={() => { goTo(activeRef.current + 1); restart(); }}>›</button>
      <div className="store-hero-dots" role="group" aria-label={t("home.slides.choose_collection", "Choose featured collection")}>
        {slides.map((slide, index) => <button key={slide.key} type="button" className={index === active ? "is-active" : ""} aria-label={t("home.slides.go_to", `Go to slide ${index + 1}`, { number: index + 1 })} aria-current={index === active ? "true" : undefined} onClick={() => { goTo(index); restart(); }} />)}
      </div>
    </section>
  );
}

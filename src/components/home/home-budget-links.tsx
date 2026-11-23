"use client";

import Link from "next/link";
import { LocalizedText, useLocalization } from "@/components/layout/localization-provider";
import { formatCurrencyBudget, getCurrencyBudgetProfile } from "@/lib/budget-by-currency";

export function HomeBudgetLinks() {
	const { currency } = useLocalization();
	const budget = getCurrencyBudgetProfile(currency);
	const format = (amount: number) => formatCurrencyBudget(currency, amount);
	const filter = budget.catalogPriceJPY;

	return (
		<div className="budget-links">
			<Link href={`/collections/all?filter.v.price.lte=${filter.underMax}`}>
				<span><LocalizedText translationKey="home.budget.treats" fallback="Sweet treats" /></span>
				<strong>{format(budget.underMax)} <LocalizedText translationKey="home.budget.under" fallback="and under" /></strong>
				<i aria-hidden="true">→</i>
			</Link>
			<Link href={`/collections/all?filter.v.price.gte=${filter.middleMin}&filter.v.price.lte=${filter.middleMax}`}>
				<span><LocalizedText translationKey="home.budget.favorites" fallback="Fan favourites" /></span>
				<strong>{format(budget.middleMin)}–{format(budget.middleMax)}</strong>
				<i aria-hidden="true">→</i>
			</Link>
			<Link href={`/collections/all?filter.v.price.gte=${filter.overMin}`}>
				<span><LocalizedText translationKey="home.budget.giant" fallback="Giant splurge" /></span>
				<strong>{format(budget.overMin)} <LocalizedText translationKey="home.budget.over" fallback="and up" /></strong>
				<i aria-hidden="true">→</i>
			</Link>
		</div>
	);
}
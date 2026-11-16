"use client";

import Link from "next/link";
import { LocalizedText, useLocalization } from "@/components/layout/localization-provider";
import { formatCountryBudget, getCountryBudgetProfile } from "@/lib/budget-by-country";

export function HomeBudgetLinks() {
	const { country } = useLocalization();
	const budget = getCountryBudgetProfile(country);
	const format = (amount: number) => formatCountryBudget(country, amount);
	const filter = budget.filterJPY;

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
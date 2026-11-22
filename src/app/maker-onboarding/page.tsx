"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PonyoSelect } from "@/components/ui/ponyo-select";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi } from "@/services/ponyo-api.client";
import "../partner-workflow.css";

const shippingOptions = [
	{ value: "maker", label: "Maker ships orders" },
	{ value: "ponyo", label: "Ponyo coordinates shipping" },
	{ value: "shared", label: "Shared responsibility" },
];

function MakerOnboardingForm() {
	const searchParams = useSearchParams();
	const token = searchParams.get("token") ?? "";
	const [makerName, setMakerName] = useState("");
	const [email, setEmail] = useState("");
	const [shippingResponsibility, setShippingResponsibility] = useState("maker");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [complete, setComplete] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!token) return;
		void ponyoApi.getMakerOnboarding(token).then((onboarding) => {
			setMakerName(onboarding.makerName);
			setEmail(onboarding.email);
		}).catch((requestError: unknown) => {
			setError(requestError instanceof ApiRequestError || requestError instanceof ApiNotConfiguredError
				? requestError.message
				: "This onboarding invitation could not be opened.");
		}).finally(() => setLoading(false));
	}, [token]);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setError("");
		const formData = new FormData(event.currentTarget);
		const splitList = (name: string) => String(formData.get(name) ?? "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
		try {
			await ponyoApi.submitMakerOnboarding(token, {
				brandStory: String(formData.get("brandStory") ?? ""),
				philosophy: String(formData.get("philosophy") ?? ""),
				process: String(formData.get("process") ?? ""),
				specialties: splitList("specialties"),
				productCategories: splitList("productCategories"),
				productionCapacity: Number(formData.get("productionCapacity")),
				shippingMethod: String(formData.get("shippingMethod") ?? ""),
				shippingResponsibility: shippingResponsibility as "maker" | "ponyo" | "shared",
				returnPolicy: String(formData.get("returnPolicy") ?? ""),
				exclusivityTerms: String(formData.get("exclusivityTerms") ?? ""),
				acceptTerms: true,
			});
			setComplete(true);
		} catch (requestError) {
			setError(requestError instanceof ApiRequestError || requestError instanceof ApiNotConfiguredError
				? requestError.message
				: "Your onboarding could not be submitted. Please try again.");
		} finally {
			setSaving(false);
		}
	}

	return <main className="partner-workflow-page">
		<Link className="partner-workflow-brand" href="/"><Image src="/ponyo-jellyfish.svg" alt="" width={42} height={42} /><span>PONYO<small>MAKER PARTNERSHIP</small></span></Link>
		<section className="partner-workflow-card">
			<p className="partner-workflow-eyebrow">YOUR NEXT STEP WITH PONYO</p>
			<h1>{complete ? "Thank you for sharing your studio." : "Let’s get to know your studio."}</h1>
			<p className="partner-workflow-intro">{complete
				? "Your onboarding is with the Ponyo team for review. Supplier access and product listings are set up separately after approval."
				: `Complete the partner details for ${makerName || "your maker studio"}. Acceptance does not activate a supplier account or publish products.`}</p>
			{!token ? <div className="partner-workflow-error" role="alert">This onboarding link is missing its invitation token.</div> : loading ? <p className="partner-workflow-message">Checking your invitation…</p> : complete ? <div className="partner-workflow-success" role="status">Onboarding submitted for {email}.</div> : <>
				{error && <div className="partner-workflow-error" role="alert">{error}</div>}
				{!error && <form className="partner-workflow-form" onSubmit={(event) => void submit(event)}>
					<label>Brand story<textarea name="brandStory" minLength={20} maxLength={4000} required rows={4} /></label>
					<label>Maker philosophy<textarea name="philosophy" minLength={10} maxLength={3000} required rows={3} /></label>
					<label>How your products are made<textarea name="process" minLength={10} maxLength={3000} required rows={3} /></label>
					<label>Specialties <small>Separate items with commas</small><input name="specialties" required placeholder="Hand embroidery, character plush" /></label>
					<label>Product categories <small>Separate items with commas</small><input name="productCategories" required placeholder="Plush Toys, Cushions" /></label>
					<label>Production capacity per month<input name="productionCapacity" type="number" min="1" step="1" required /></label>
					<label>Shipping method<textarea name="shippingMethod" minLength={5} maxLength={500} required rows={2} placeholder="Carrier, shipping regions, and typical dispatch method" /></label>
					<label>Who handles shipping<PonyoSelect label="Shipping responsibility" value={shippingResponsibility} onChange={setShippingResponsibility} options={shippingOptions} /></label>
					<label>Returns and defect policy<textarea name="returnPolicy" minLength={10} maxLength={3000} required rows={3} /></label>
					<label>Exclusivity or non-exclusivity terms<textarea name="exclusivityTerms" minLength={10} maxLength={3000} required rows={3} /></label>
					<label className="partner-workflow-check"><input type="checkbox" required /><span>I confirm these details are accurate and agree that Ponyo will review the partnership terms before activating a supplier account.</span></label>
					<button type="submit" disabled={saving}>{saving ? "Submitting for review…" : "Submit partner onboarding"}<span aria-hidden="true">↗</span></button>
				</form>}
			</>}
			<p className="partner-workflow-footer">Questions? <a href="mailto:partners@byponyo.com">Contact the Ponyo partnerships team</a></p>
		</section>
	</main>;
}

export default function MakerOnboardingPage() {
	return <Suspense fallback={<main className="partner-workflow-page"><p className="partner-workflow-message">Opening your invitation…</p></main>}><MakerOnboardingForm /></Suspense>;
}

"use client";

import { Suspense, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi } from "@/services/ponyo-api.client";
import "../partner-workflow.css";

function SupplierActivationForm() {
	const searchParams = useSearchParams();
	const token = searchParams.get("token") ?? "";
	const router = useRouter();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	async function activate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setError("");
		const formData = new FormData(event.currentTarget);
		try {
			await ponyoApi.acceptSupplierInvitation({
				token,
				firstName: String(formData.get("firstName") ?? ""),
				lastName: String(formData.get("lastName") ?? ""),
				password: String(formData.get("password") ?? "") || undefined,
			});
			router.push("/supplier-portal");
		} catch (requestError) {
			setError(requestError instanceof ApiRequestError || requestError instanceof ApiNotConfiguredError
				? requestError.message
				: "Your Supplier Portal access could not be activated.");
		} finally {
			setSaving(false);
		}
	}

	return <main className="partner-workflow-page">
		<Link className="partner-workflow-brand" href="/"><Image src="/ponyo-jellyfish.svg" alt="" width={42} height={42} /><span>PONYO<small>SUPPLIER STUDIO</small></span></Link>
		<section className="partner-workflow-card">
			<p className="partner-workflow-eyebrow">YOUR PONYO SUPPLIER PORTAL</p>
			<h1>Activate your studio access.</h1>
			<p className="partner-workflow-intro">This one-time invitation links the email address Ponyo used to contact your studio. Existing Ponyo customer accounts stay customer accounts and gain supplier access through the partner assignment.</p>
					{!token ? <div className="partner-workflow-error" role="alert">This supplier invitation is missing its activation token.</div> : <>
						{error && <div className="partner-workflow-error" role="alert">{error}</div>}
						{!error && <form className="partner-workflow-form" onSubmit={(event) => void activate(event)}>
					<label>First name<input name="firstName" autoComplete="given-name" maxLength={120} required /></label>
					<label>Last name<input name="lastName" autoComplete="family-name" maxLength={120} /></label>
					<label>New account password <small>Leave blank if you already have a Ponyo account.</small><input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} /></label>
					<button type="submit" disabled={saving}>{saving ? "Activating access…" : "Activate Supplier Portal"}<span aria-hidden="true">↗</span></button>
				</form>}
			</>}
			<p className="partner-workflow-footer">Already have an account? The invitation links your verified email; it will not change your existing password.</p>
		</section>
	</main>;
}

export default function SupplierActivatePage() {
	return <Suspense fallback={<main className="partner-workflow-page"><p className="partner-workflow-message">Opening your invitation…</p></main>}><SupplierActivationForm /></Suspense>;
}

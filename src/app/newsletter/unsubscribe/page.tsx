import { NewsletterUnsubscribeForm } from "./newsletter-unsubscribe-form";
import styles from "./newsletter-unsubscribe.module.css";

type NewsletterUnsubscribePageProps = {
	searchParams: Promise<{ token?: string | string[] }>;
};

export default async function NewsletterUnsubscribePage({ searchParams }: NewsletterUnsubscribePageProps) {
	const search = await searchParams;
	const token = typeof search.token === "string" ? search.token : "";
	return <main className={styles.page}><NewsletterUnsubscribeForm token={token} /></main>;
}

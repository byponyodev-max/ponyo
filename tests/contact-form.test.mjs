import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const componentText = readFileSync(
	new URL("../src/components/layout/local-store-forms.tsx", import.meta.url),
	"utf8",
);
const englishLocale = JSON.parse(
	readFileSync(
		new URL("../src/locales/en.default.json", import.meta.url),
		"utf8",
	),
);
const compile = (source) =>
	ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			jsx: ts.JsxEmit.ReactJSX,
		},
	}).outputText;
const translationContext = { exports: {} };
vm.runInNewContext(
	compile(
		readFileSync(
			new URL("../src/locales/contact-translations.ts", import.meta.url),
			"utf8",
		),
	),
	translationContext,
);
const translations = translationContext.exports.contactTranslations;
const source = compile(componentText);

function harness({
	locale = "en",
	baseUrl = "/ponyo-api",
	customer = {
		firstName: "Ponyo",
		lastName: "Buyer",
		email: "buyer@example.com",
	},
	api = async () => ({ emailNotificationSent: false }),
	newsletterApi = async () => {},
} = {}) {
	const states = [];
	const refs = [];
	const requests = [];
	const effects = [];
	const frames = new Map();
	const interactions = [];
	const newsletterRequests = [];
	let nextFrame = 0;
	let effectCursor = 0;
	class Element {
		blur() {
			interactions.push("blur");
		}
		focus(options) {
			interactions.push(["focus", { ...options }]);
		}
		scrollIntoView(options) {
			interactions.push(["scroll", { ...options }]);
		}
	}
	const activeElement = new Element();
	const document = { activeElement };
	let cursor = 0;
	let refCursor = 0;
	const context = {
		exports: {},
		Error,
		document,
		HTMLElement: Element,
		requestAnimationFrame(callback) {
			frames.set(++nextFrame, callback);
			return nextFrame;
		},
		cancelAnimationFrame(id) {
			frames.delete(id);
		},
		FormData: class {
			constructor(values) {
				this.values = values;
			}
			get(key) {
				return this.values[key] === undefined || this.values[key] === null
					? null
					: this.values[key];
			}
		},
		require(id) {
			if (id === "next/link") return { default: "a" };
			if (id === "react")
				return {
					useState(initial) {
						const index = cursor++;
						if (!(index in states)) states[index] = initial;
						return [
							states[index],
							(value) => {
								states[index] =
									typeof value === "function" ? value(states[index]) : value;
							},
						];
					},
					useRef(initial) {
						const index = refCursor++;
						if (!refs[index]) refs[index] = { current: initial };
						return refs[index];
					},
					useEffect(callback, dependencies) {
						const index = effectCursor++;
						const previous = effects[index];
						if (
							!previous ||
							dependencies.some(
								(value, i) => value !== previous.dependencies[i],
							)
						) {
							if (previous && previous.cleanup) previous.cleanup();
							effects[index] = { callback, dependencies, pending: true };
						}
					},
				};
			if (id === "@/locales/en.default.json") return { default: englishLocale };
			if (id === "@/components/layout/customer-session-provider")
				return { useCustomerSession: () => ({ customer }) };
			if (id === "@/components/layout/localization-provider")
				return {
					useLocalization: () => ({
						t: (key, fallback) =>
							translations[locale] && translations[locale][key] !== undefined
								? translations[locale][key]
								: fallback,
					}),
				};
			if (id === "@/services/ponyo-api.client")
				return {
					PONYO_API_BASE_URL: baseUrl,
					ponyoApi: {
						subscribeNewsletter: async (email) => {
							newsletterRequests.push(email);
							return newsletterApi(email);
						},
						submitContactRequest: async (payload) => {
							requests.push(payload);
							return api(payload);
						},
					},
				};
			return require(id);
		},
	};
	vm.runInNewContext(source, context);
	return {
		requests,
		newsletterRequests,
		interactions,
		activeElement,
		document,
		render() {
			cursor = 0;
			refCursor = 0;
			effectCursor = 0;
			const tree = context.exports.LocalContactForm();
			// Simulate React's commit: attach DOM refs before running effects.
			for (const ref of refs)
				if (ref.current instanceof Element) ref.current = null;
			if (tree.props.ref) tree.props.ref.current = new Element();
			for (const effect of effects)
				if (effect.pending) {
					effect.pending = false;
					effect.cleanup = effect.callback();
				}
			return tree;
		},
		renderHome() {
			cursor = 0;
			return context.exports.HomeInterestForms();
		},
		flushFrame() {
			const pending = [...frames.values()];
			frames.clear();
			for (const callback of pending) callback();
		},
		unmount() {
			for (const effect of effects) if (effect.cleanup) effect.cleanup();
			for (const ref of refs)
				if (ref.current instanceof Element) ref.current = null;
		},
		setLocale(value) {
			locale = value;
		},
	};
}

function find(node, predicate) {
	if (!node || typeof node !== "object") return undefined;
	if (Array.isArray(node)) {
		for (const child of node) {
			const result = find(child, predicate);
			if (result) return result;
		}
		return undefined;
	}
	return predicate(node)
		? node
		: find(node.props && node.props.children, predicate);
}

function text(node) {
	if (node == null || typeof node === "boolean") return "";
	if (typeof node !== "object") return String(node);
	return Array.isArray(node)
		? node.map(text).join("")
		: text(node.props && node.props.children);
}

const field = (tree, name) =>
	find(tree, (node) => node.props && node.props.name === name);
const topicControl = (tree) =>
	find(tree, (node) => node.props && node.props.id === "contact-topic");
const values = {
	name: "Ponyo Buyer",
	email: "buyer@example.com",
	phone: "+81 90 1234 5678",
	topic: "delivery",
	message: "Where is my plush?",
};
const event = (overrides = {}) => ({
	preventDefault() {},
	currentTarget: { ...values, ...overrides, contains: () => true },
});
const submit = (tree, overrides) =>
	find(tree, (node) => node.type === "form").props.onSubmit(event(overrides));

function findAll(node, predicate, matches = []) {
	if (!node || typeof node !== "object") return matches;
	if (Array.isArray(node)) {
		for (const child of node) findAll(child, predicate, matches);
		return matches;
	}
	if (predicate(node)) matches.push(node);
	findAll(node.props && node.props.children, predicate, matches);
	return matches;
}

test("newsletter and plush request forms submit independently", async () => {
	let resolveNewsletter;
	const newsletterPending = new Promise((resolve) => {
		resolveNewsletter = resolve;
	});
	const form = harness({ newsletterApi: () => newsletterPending });
	let tree = form.renderHome();
	const [newsletterForm] = findAll(tree, (node) => node.type === "form");
	const newsletterSubmit = newsletterForm.props.onSubmit({
		preventDefault() {},
		currentTarget: { email: "alerts@example.com" },
	});

	tree = form.renderHome();
	const [busyNewsletterForm, idleRequestForm] = findAll(
		tree,
		(node) => node.type === "form",
	);
	assert.equal(
		find(
			busyNewsletterForm,
			(node) => node.props && node.props.type === "submit",
		).props.disabled,
		true,
	);
	assert.equal(
		find(idleRequestForm, (node) => node.props && node.props.type === "submit")
			.props.disabled,
		false,
	);
	assert.deepEqual(form.newsletterRequests, ["alerts@example.com"]);
	assert.deepEqual(form.requests, []);

	resolveNewsletter();
	await newsletterSubmit;
	tree = form.renderHome();
	const [independentRequestForm] = findAll(
		tree,
		(node) => node.type === "form",
	);
	await independentRequestForm.props.onSubmit({
		preventDefault() {},
		currentTarget: {
			name: "Ponyo",
			email: "request@example.com",
			message: "Looking for a giant bunny.",
		},
	});
	assert.equal(form.newsletterRequests.length, 1);
	assert.equal(form.requests.length, 1);
	assert.deepEqual(JSON.parse(JSON.stringify(form.requests[0])), {
		name: "Ponyo",
		email: "request@example.com",
		message: "Looking for a giant bunny.",
		requestType: "Plush request",
	});
});

test("contact card has accessible fields, stable topics, limits and decorative icons", () => {
	const tree = harness().render();
	assert.equal(tree.type, "section");
	assert.equal(tree.props.className, "contact-form-card");
	assert.equal(
		text(find(tree, (node) => node.type === "h2")),
		"Send a little note",
	);
	assert.ok(
		find(
			tree,
			(node) => node.props && node.props.className === "contact-message-form",
		),
	);
	assert.ok(
		find(
			tree,
			(node) => node.props && node.props.className === "contact-field-grid",
		),
	);
	assert.ok(
		find(
			tree,
			(node) => node.props && node.props.className === "contact-topic-select",
		),
	);
	assert.ok(
		find(
			tree,
			(node) => node.props && node.props.className === "contact-form-footer",
		),
	);
	assert.equal(
		find(tree, (node) => node.type === "svg").props["aria-hidden"],
		"true",
	);
	for (const name of ["name", "email", "phone", "topic", "message"]) {
		const input = name === "topic" ? topicControl(tree) : field(tree, name);
		assert.ok(
			find(
				tree,
				(node) =>
					node.type === "label" && node.props.htmlFor === input.props.id,
			),
		);
	}
	assert.equal(field(tree, "name").props.maxLength, 160);
	assert.equal(field(tree, "phone").props.maxLength, 60);
	assert.equal(field(tree, "phone").props.required, undefined);
	assert.equal(field(tree, "message").props.maxLength, 4800);
	assert.equal(field(tree, "message").props.rows, 5);
	for (const name of ["name", "email", "message"])
		assert.equal(field(tree, name).props.required, true);
	assert.equal(topicControl(tree).props.role, "combobox");
	assert.equal(topicControl(tree).props["aria-required"], "true");
	assert.equal(topicControl(tree).props["aria-expanded"], false);
	assert.equal(field(tree, "topic").props.value, "");
	const topicListbox = find(
		tree,
		(node) => node.props && node.props.role === "listbox",
	);
	assert.equal(topicListbox.props.hidden, true);
	assert.deepEqual(
		Array.from(
			topicListbox.props.children,
			(option) => option.props["aria-selected"],
		),
		[false, false, false, false],
	);
});

test("contact page uses polished studio styling for information and form panels", () => {
	const styles = readFileSync(
		new URL("../src/app/theme-parity-polish.css", import.meta.url),
		"utf8",
	);
	assert.match(styles, /\.contact-page--studio \.contact-studio-intro/);
	assert.match(styles, /\.contact-page--studio \.contact-form-card/);
	assert.match(styles, /\.contact-page--studio \.contact-channel-card/);
	assert.match(styles, /contact-form-card::before/);
	assert.match(styles, /contact-care-art::after/);
	assert.match(styles, /contact-cloud-float/);
	assert.match(styles, /\.contact-page--studio \.contact-care-scene::before/);
	assert.match(styles, /\.contact-page--studio \.contact-hero \{/);
	assert.match(styles, /\.contact-page--studio \.contact-channel-grid \{/);
});

test("Ponyo topic dropdown supports keyboard selection and required validation", async () => {
	const form = harness();
	const closed = form.render();
	topicControl(closed).props.onKeyDown({
		key: "ArrowDown",
		preventDefault() {},
	});
	const open = form.render();
	assert.equal(topicControl(open).props["aria-expanded"], true);
	assert.equal(
		find(open, (node) => node.props && node.props.role === "listbox").props
			.hidden,
		false,
	);
	topicControl(open).props.onKeyDown({ key: "Enter", preventDefault() {} });
	const selected = form.render();
	assert.equal(topicControl(selected).props["aria-expanded"], false);
	assert.equal(field(selected, "topic").props.value, "order");
	assert.equal(text(topicControl(selected)), "An order");

	await submit(form.render(), { topic: "" });
	assert.equal(form.requests.length, 0);
	assert.equal(
		text(
			find(form.render(), (node) => node.props && node.props.role === "alert"),
		),
		"Please choose a topic before sending.",
	);
});

test("customer autofill remains editable and locale changes preserve user input", () => {
	const form = harness();
	let tree = form.render();
	assert.equal(field(tree, "name").props.value, "Ponyo Buyer");
	assert.equal(field(tree, "email").props.value, "buyer@example.com");
	assert.equal(field(tree, "name").props.autoComplete, "name");
	assert.equal(field(tree, "email").props.autoComplete, "email");
	assert.equal(field(tree, "phone").props.autoComplete, "tel");
	field(tree, "name").props.onChange({ target: { value: "Edited name" } });
	field(tree, "email").props.onChange({ target: { value: "new@example.com" } });
	form.setLocale("ja");
	tree = form.render();
	assert.equal(field(tree, "name").props.value, "Edited name");
	assert.equal(field(tree, "email").props.value, "new@example.com");
	assert.equal(
		field(harness({ customer: null }).render(), "name").props.value,
		"",
	);
});

for (const [topic, requestType] of [
	["order", "Order question"],
	["delivery", "Delivery question"],
	["plush", "Plush request"],
	["general", "General inquiry"],
	["unknown", "General inquiry"],
	["__proto__", "General inquiry"],
]) {
	test(`submission maps ${topic} to stable English request type and preserves phone`, async () => {
		const form = harness({ locale: "ja" });
		await submit(form.render(), { topic, phone: `  ${values.phone}  ` });
		assert.equal(form.requests.length, 1);
		assert.deepEqual(JSON.parse(JSON.stringify(form.requests[0])), {
			name: values.name,
			email: values.email,
			message: `${values.message}\nPhone: ${values.phone}`,
			requestType,
		});
	});
}

test("blank optional phone does not alter the message", async () => {
	const form = harness();
	await submit(form.render(), { phone: "   " });
	assert.equal(form.requests[0].message, values.message);
});

test("maximum-length valid fields keep appended message below backend limit", async () => {
	const form = harness();
	await submit(form.render(), {
		name: "n".repeat(160),
		phone: "1".repeat(60),
		message: "m".repeat(4800),
	});
	assert.equal(form.requests[0].message.length, 4868);
	assert.ok(form.requests[0].message.length <= 5000);
});

for (const invalid of [
	{ name: "n".repeat(161) },
	{ phone: "1".repeat(61) },
	{ message: "m".repeat(4801) },
	{ message: "m".repeat(5000) },
]) {
	test(`programmatic oversized ${Object.keys(invalid)[0]} submission is blocked without losing form`, async () => {
		const form = harness();
		await submit(form.render(), invalid);
		assert.equal(form.requests.length, 0);
		const tree = form.render();
		assert.ok(find(tree, (node) => node.type === "form"));
		assert.ok(find(tree, (node) => node.props && node.props.role === "alert"));
		assert.equal(
			find(tree, (node) => node.props && node.props.type === "submit").props
				.disabled,
			false,
		);
		await submit(tree);
		assert.equal(form.requests.length, 1);
	});
}

const outcomes = [
	[
		"preview",
		"Your note is in preview",
		"Preview only: your message was not sent to the backend or by email.",
	],
	[
		"saved_no_email",
		"Your note is saved",
		"Your message is saved. Email notification could not be sent; the Ponyo team can still find your note.",
	],
	[
		"saved_notified",
		"Your note is saved",
		"Your message is saved, and an email notification was sent to Ponyo.",
	],
];

for (const locale of ["en", "es", "id", "ja", "ko", "zh-CN"]) {
	test(`${locale}: all visible form copy resolves through reviewed contact translations`, () => {
		const form = harness({ locale });
		const tree = form.render();
		const expected = (key, fallback) => {
			const dictionary = translations[locale];
			return dictionary && dictionary[`contact.${key}`] !== undefined
				? dictionary[`contact.${key}`]
				: fallback;
		};
		assert.equal(
			text(find(tree, (node) => node.type === "h2")),
			expected("form_title", "Send a little note"),
		);
		for (const [key, fallback] of [
			["form_kicker", "A NOTE TO PONYO"],
			["required_note", "Fields marked * are required. The rest is up to you."],
			["name", "Name"],
			["email", "Email"],
			["phone", "Phone"],
			["optional", "(optional)"],
			["topic", "What’s your note about?"],
			["topic_placeholder", "Choose a topic"],
			["topic_order", "An order"],
			["topic_delivery", "Delivery"],
			["topic_plush", "Finding a plush"],
			["topic_general", "Something else"],
			["message", "Message"],
			[
				"privacy",
				"Please only share the details we need to help. Never include passwords or payment details.",
			],
			["send", "Send message"],
		]) {
			assert.ok(text(tree).includes(expected(key, fallback)), key);
		}
		assert.equal(
			field(tree, "message").props.placeholder,
			expected(
				"message_placeholder",
				"Tell us a little about how we can help…",
			),
		);
	});

	for (const [outcome, title, body] of outcomes) {
		test(`${locale}: ${outcome} success accurately describes storage and notification`, async () => {
			const form = harness({
				locale,
				baseUrl: outcome === "preview" ? "" : "/ponyo-api",
				api: async () => ({
					emailNotificationSent: outcome === "saved_notified",
				}),
			});
			await submit(form.render());
			const tree = form.render();
			assert.equal(tree.props.role, "status");
			assert.ok(tree.props.className.includes("contact-success"));
			const dictionary = translations[locale];
			const translatedTitle =
				dictionary &&
				dictionary[
					`contact.${outcome === "preview" ? "preview_title" : "saved_title"}`
				] !== undefined
					? dictionary[
							`contact.${outcome === "preview" ? "preview_title" : "saved_title"}`
						]
					: title;
			const translatedBody =
				dictionary && dictionary[`contact.${outcome}`] !== undefined
					? dictionary[`contact.${outcome}`]
					: body;
			assert.equal(
				text(find(tree, (node) => node.type === "h2")),
				translatedTitle,
			);
			assert.equal(
				text(find(tree, (node) => node.type === "p")),
				translatedBody,
			);
			assert.equal(
				find(tree, (node) => node.type === "form"),
				undefined,
			);
			assert.equal(
				find(tree, (node) => node.type === "svg").props["aria-hidden"],
				"true",
			);
			assert.equal(form.requests.length, outcome === "preview" ? 0 : 1);
		});
	}

	test(`${locale}: backend and fallback errors keep the form and edited fields for retry`, async () => {
		for (const error of [new Error("Backend unavailable"), null]) {
			let failed = false;
			const form = harness({
				locale,
				api: async () => {
					if (!failed) {
						failed = true;
						throw error;
					}
					return { emailNotificationSent: false };
				},
			});
			const initial = form.render();
			field(initial, "name").props.onChange({
				target: { value: "Edited Buyer" },
			});
			field(initial, "email").props.onChange({
				target: { value: "edited@example.com" },
			});
			await submit(form.render());
			const tree = form.render();
			const dictionary = translations[locale];
			const fallbackError =
				dictionary && dictionary["contact.error_send"] !== undefined
					? dictionary["contact.error_send"]
					: "Unable to send this message. Please try again; your note is still here.";
			const expectedError =
				error && error.message !== undefined ? error.message : fallbackError;
			assert.equal(
				text(find(tree, (node) => node.props && node.props.role === "alert")),
				expectedError,
			);
			assert.equal(field(tree, "name").props.value, "Edited Buyer");
			assert.equal(field(tree, "email").props.value, "edited@example.com");
			// Same form/control types, keys and positions: React retains uncontrolled phone/topic/message DOM values.
			for (const name of ["phone", "message"]) {
				assert.equal(field(tree, name).type, field(initial, name).type);
				assert.equal(field(tree, name).key, field(initial, name).key);
				assert.equal(field(tree, name).props.value, undefined);
			}
			assert.equal(field(tree, "topic").props.value, "");
			assert.equal(
				find(tree, (node) => node.props && node.props.type === "submit").props
					.disabled,
				false,
			);
			await submit(tree);
			assert.equal(form.requests.length, 2);
			assert.equal(
				find(
					form.render(),
					(node) => node.props && node.props.role === "alert",
				),
				undefined,
			);
		}
	});
}

test("same-tick and in-flight duplicate submits issue only one request", async () => {
	let resolve;
	const pending = new Promise((done) => {
		resolve = done;
	});
	const form = harness({ api: () => pending });
	const initial = form.render();
	const first = submit(initial);
	await submit(initial);
	const busy = form.render();
	assert.equal(
		find(busy, (node) => node.type === "form").props["aria-busy"],
		true,
	);
	assert.equal(
		find(busy, (node) => node.props && node.props.type === "submit").props
			.disabled,
		true,
	);
	assert.ok(text(busy).includes("Sending…"));
	await submit(busy);
	assert.equal(form.requests.length, 1);
	resolve({ emailNotificationSent: true });
	await first;
	assert.equal(form.render().props.role, "status");
});

for (const outcome of ["saved_notified", "saved_no_email", "preview"]) {
	test(`${outcome}: blur keyboard, focus confirmation without scrolling, then instantly center it`, async () => {
		const form = harness({
			baseUrl: outcome === "preview" ? "" : "/ponyo-api",
			api: async () => ({
				emailNotificationSent: outcome === "saved_notified",
			}),
		});
		const initial = form.render();
		form.flushFrame();
		assert.deepEqual(form.interactions, []);
		await submit(initial);
		assert.deepEqual(form.interactions, ["blur"]);
		const tree = form.render();
		assert.equal(tree.props.tabIndex, -1);
		assert.equal(tree.props["aria-labelledby"], "contact-success-title");
		assert.equal(tree.props["aria-describedby"], "contact-success-description");
		assert.equal(
			find(tree, (node) => node.type === "h2").props.id,
			"contact-success-title",
		);
		assert.ok(
			find(
				tree,
				(node) => node.props && node.props.className === "contact-success-halo",
			),
		);
		assert.ok(
			find(
				tree,
				(node) =>
					node.props && node.props.className === "contact-success-medallion",
			),
		);
		assert.equal(
			text(find(tree, (node) => node.type === "a")),
			"Explore FAQs ↗",
		);
		assert.equal(
			find(tree, (node) => node.type === "a").props.href,
			"/pages/faq",
		);
		form.flushFrame();
		assert.deepEqual(
			form.interactions,
			["blur"],
			"wait for layout after keyboard dismissal",
		);
		form.flushFrame();
		assert.deepEqual(form.interactions, [
			"blur",
			["focus", { preventScroll: true }],
			["scroll", { block: "center", inline: "nearest", behavior: "instant" }],
		]);
		form.setLocale("ja");
		form.render();
		form.flushFrame();
		form.flushFrame();
		assert.equal(
			form.interactions.length,
			3,
			"locale rerenders must not steal focus again",
		);
	});
}

test("failed and oversized requests never focus or scroll and retain the form", async () => {
	for (const overrides of [{}, { message: "m".repeat(4801) }]) {
		const form = harness({
			api: async () => {
				throw new Error("Unavailable");
			},
		});
		await submit(form.render(), overrides);
		assert.ok(find(form.render(), (node) => node.type === "form"));
		form.flushFrame();
		form.flushFrame();
		assert.deepEqual(form.interactions, []);
	}
});

test("success does not blur focus outside the submitting form", async () => {
	const form = harness();
	const tree = form.render();
	const submission = event();
	submission.currentTarget.contains = () => false;
	await find(tree, (node) => node.type === "form").props.onSubmit(submission);
	assert.deepEqual(form.interactions, []);
});

for (const framesBeforeUnmount of [0, 1]) {
	test(`unmount cancels success focus/scroll after ${framesBeforeUnmount} frames`, async () => {
		const form = harness();
		await submit(form.render());
		form.render();
		if (framesBeforeUnmount) form.flushFrame();
		form.unmount();
		form.flushFrame();
		form.flushFrame();
		assert.deepEqual(form.interactions, ["blur"]);
	});
}

test("all six reviewed dictionaries cover every contact form and page key", () => {
	const formKeys = [
		...componentText
			.slice(componentText.indexOf("export function LocalContactForm"))
			.matchAll(/t\("(contact\.[^"]+)"/g),
	].map((match) => match[1]);
	const pageKeys = [
		"hero_eyebrow",
		"hero_title",
		"hero_body",
		"hero_options",
		"hero_message",
		"channels_eyebrow",
		"channels_title",
		"channels_body",
		"email_general_title",
		"email_general_body",
		"email_support_title",
		"email_support_body",
		"email_partners_title",
		"email_partners_body",
		"phone_title",
		"phone_body",
		"care_eyebrow",
		"care_title",
		"care_body",
		"care_email",
		"care_phone",
		"eyebrow",
		"title",
		"intro",
		"team",
		"team_body",
		"faq",
		"faq_body",
		"faq_cta",
	].map((key) => `contact.${key}`);
	const contactPage = readFileSync(
		new URL("../src/app/pages/[slug]/page.tsx", import.meta.url),
		"utf8",
	)
		.split("function ContactPage()")[1]
		.split("function PartnerPage()")[0];
	assert.match(contactPage, /src="\/images\/contact-support-hero\.png"/);
	assert.match(contactPage, /href="mailto:hello@byponyo\.com"/);
	assert.match(contactPage, /href="mailto:support@byponyo\.com"/);
	assert.match(contactPage, /href="mailto:partners@byponyo\.com"/);
	assert.match(contactPage, /href="tel:\+817091606676"/);
	assert.match(contactPage, /\+81 70 9160 6676/);
	assert.match(contactPage, /className="contact-care-scene"/);
	assert.match(contactPage, /href="\/pages\/faq"/);
	assert.doesNotMatch(contactPage, /href="\/orders"|contact\.orders/);
	assert.deepEqual(Object.keys(translations), [
		"en",
		"es",
		"id",
		"ja",
		"ko",
		"zh-CN",
	]);
	for (const dictionary of Object.values(translations)) {
		for (const key of [...formKeys, ...pageKeys])
			assert.ok(dictionary[key] && dictionary[key].trim(), key);
		assert.deepEqual(
			Object.keys(dictionary).sort(),
			[...new Set([...formKeys, ...pageKeys])].sort(),
		);
	}
});

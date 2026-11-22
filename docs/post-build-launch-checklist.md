# Ponyo post-build launch checklist

**Updated:** 22 November 2026  
**Purpose:** One owner-facing checklist for decisions and work remaining after the app build. Repository implementation and local health checks do not prove that production is deployed or ready to take orders.

## Verified locally on 22 November 2026

- Docker Compose services are running; PostgreSQL, Redis, LibreTranslate, and the API report healthy, and the API health endpoint returns HTTP 200.
- Transactional SMTP authentication and SMTP/IMAP authentication for `hello`, `support`, and `partners` succeeded. The inboxes opened read-only. No test email was sent, so recipient delivery, spam placement, sender-domain authentication, and production mail readiness remain unverified.
- The transactional email queue currently has no pending or failed records.
- The private Supabase bucket `maker-application-photos` is reachable. A temporary JPEG upload, signed private preview (HTTP 200), and cleanup succeeded.
- Storefront, admin, and maker-facing native dropdowns were replaced with the Ponyo custom picker. Supplier Portal currently has no native HTML `<select>` controls.
- The app is still a local Docker deployment. Terraform has not been applied and no production deployment workflow or persistent staging environment is documented.

## First decision: what does “subscription” mean?

- **Newsletter subscription:** implemented. The app records consent and unsubscribe state. Before sending campaigns, verify the approved sender, audience/consent process, unsubscribe handling, and actual delivery in a controlled inbox.
- **Paid recurring customer subscription or membership:** **not implemented and not launch-ready.** The Stripe code is a one-time checkout/payment flow, and `commerce` and customer-account features are disabled. Do not advertise or charge for a recurring plan yet.

If paid recurring billing is wanted, decide the benefit, price, billing interval, trial, tax, shipping, cancellation/refund policy, failed-payment handling, renewal notices, customer self-service, and accounting treatment. Then implement and test the Stripe Billing/subscription lifecycle and legal disclosures separately before enabling it.

## Work in order

### 1. Confirm the business and customer experience

- [ ] Confirm legal operator name, business address, contact phone/email, supported markets, tax treatment, and who owns customer support.
- [ ] Complete and review the draft privacy, terms, returns/refunds, and Japanese Specified Commercial Transactions Act disclosures. Do not enable paid checkout while required seller and policy details are placeholders.
- [ ] Confirm product facts, maker permission, image rights, prices, stock/capacity, shipping destinations, delivery estimates, and return handling for each launch product.
- [ ] Decide whether launch is an interest/reservation preview or paid commerce. Reservations currently do not create an order or take payment.
- [ ] Decide how new products are submitted and approved. The current Admin Portal publishes existing catalog records; Maker applications and Supplier Portal are not product-submission workflows.
- [ ] Assign owners for production deployment, billing/vendor accounts, customer email, fulfillment, backups, and incident response.

### 2. Choose and budget the production platform

- [ ] Choose the production hosting approach and create separate staging and production environments. The AWS Terraform baseline is Tokyo-region infrastructure, but it has not been applied and its README identifies unfinished production components.
- [ ] Review the AWS plan and expected monthly spend before creating resources. The plan includes billable NAT, ALB, ECS/Fargate, Aurora, Redis, storage/CDN, logs, queues, and event infrastructure.
- [ ] Confirm domain registrar/DNS access, production storefront domain (`byponyo.com`), API domain (`api.byponyo.com`), TLS certificate, and who can publish.
- [ ] Create or confirm provider accounts and billing for hosting, domain, email, payments, Supabase photo storage, image/CDN storage, and any translation or marketing service. Record the plan, monthly/usage cost, renewal date, billing owner, and cancellation method in the site blueprint.
- [ ] Bootstrap encrypted/versioned Terraform state and locking; restrict access. Never put secrets in a `.tfvars` file committed to Git or in documentation.
- [ ] Build, scan, and push immutable backend/frontend images; deploy only those reviewed image digests. Do not start ECS with a placeholder image.

### 3. Configure production secrets and services

- [ ] Set production HTTPS storefront/API origins, exact CORS origins, shared cookie domain, secure cookies, a unique JWT secret, and TLS database/Redis URLs. Keep secrets in the hosting secret manager.
- [ ] Configure production Supabase URL and backend-only service-role secret; create/verify the private maker-photo bucket and agree on its backup/retention policy.
- [ ] Configure SMTP credentials and verified sender; configure IMAP only for inboxes that the Admin Portal will sync. Add SPF, DKIM, and DMARC records and verify them with the email provider.
- [ ] Configure Stripe live credentials and a **separate** live webhook secret only after staging sign-off. Register the documented webhook events and verify signatures reach the deployed API.
- [ ] Complete production queue/event delivery. The Terraform guide notes that an idempotent SQS consumer, EventBridge publisher/subscriptions, and fulfillment/supplier adapters still require implementation and verification.
- [ ] Set up log retention, alerts, budgets, rate-limit Redis, image delivery, monitoring access, and an incident contact. Confirm alert subscriptions actually receive a staging alert.
- [ ] Keep commerce/accounts disabled until the tests below pass and the business has approved launch. Production startup requires Stripe keys and an order-event queue URL; satisfying these settings alone is not proof of readiness.

### 4. Validate in staging before production

- [ ] Apply reviewed database migrations to staging and confirm schema revision, seed/catalog state, and rollback/recovery plan.
- [ ] Exercise the public storefront on desktop/mobile: browse/search, category/size filters, localization, custom dropdowns, product details, reservations/interest forms, and accessibility/keyboard behavior.
- [ ] Exercise Admin and Supplier Portal with least-privilege accounts: product publication/category assignment, maker review/photo previews, supplier offer approval, inventory updates, order routing, exports, and audit/error states.
- [ ] Submit a controlled maker application with temporary test photos; verify private storage, Admin signed previews, and deletion/retention behavior.
- [ ] Send controlled registration, password-reset, contact, maker, order, and reply emails. Verify actual delivery, links, sender identity, spam placement, SPF/DKIM/DMARC, retries, and Admin inbox sync. Authentication-only checks are not delivery tests.
- [ ] Run Stripe sandbox checkout and webhook end-to-end tests, including success, decline, duplicate webhook, expiry, refund, retry, and reconciliation. Keep live payments disabled until these pass.
- [ ] Verify customer data export/deletion and retention procedures, support escalation, rate limits, secure cookies/CORS, dependency/image scans, and production-like error logging.
- [ ] Restore a recent database backup into an isolated environment; verify data and record restore time and data-loss window. Confirm photo-storage recovery separately.
- [ ] Test rollback and the release process using the staging deployment. Record who can approve and publish.

### 5. Production release and first weeks

- [ ] Take/verify a pre-release backup and confirm on-call/support coverage.
- [ ] Deploy the reviewed version and migrations using the documented release owner; verify health, database/Redis, email queue, inbox sync, storage preview, logs, and alerts.
- [ ] Launch with paid commerce disabled if any payment, shipping, tax, policy, supplier-fulfillment, or refund gate remains open.
- [ ] If commerce is approved, enable it only after staging sign-off; place a controlled low-value order, verify the full order/payment/stock/email/refund path, then monitor daily.
- [ ] Review failed/pending email notifications, payment reconciliation, supplier handoffs, customer messages, capacity, and operational errors daily during the initial launch period.
- [ ] Update the site blueprint with the actual public URLs, vendor costs/renewals, backups/restore result, page status, release owner, and measured product-onboarding time.

## Launch blockers to track

| Area | Current evidence | Release gate |
| --- | --- | --- |
| Hosting/deployment | Local Compose works; Terraform is unapplied; no production deployment workflow is documented. | Staging and production deployment, DNS/TLS, secret manager, budget, and release owner confirmed. |
| Email | SMTP/IMAP logins passed locally; no test message was sent; production domain/delivery are unverified. | Controlled staging delivery and DNS authentication verified. |
| Payments | Stripe integration exists, but storefront commerce is disabled; sandbox E2E is still required. | Business policy, test flow, webhook delivery, refunds, and reconciliation signed off. |
| Paid recurring subscriptions | No customer subscription lifecycle found; newsletter subscriptions are separate. | Do not sell recurring plans until requirements, billing implementation, lifecycle tests, and disclosures are complete. |
| Supplier fulfillment | Supplier Portal exists, but automated production queue consumers/adapters are not complete. | Verified manual/automated fulfillment procedure and failure ownership before accepting paid orders. |
| Legal and operations | The site blueprint lists legal pages as drafts and business/vendor details as TBC. | Required seller, policy, support, shipping, tax, and return information approved. |
| Backups | Local database and Supabase photo upload work; production retention/restore is not verified. | Production backup policy and isolated restore drill recorded. |

## Related runbooks

- [Site blueprint](./site-blueprint.md)
- [AWS Terraform and production prerequisites](../infra/terraform/README.md)
- [Payment gateway and Stripe webhook checklist](./payment-gateway.md)
- [Operations reliability, email retries, and restore drills](./operations-reliability.md)
- [Backend configuration and local services](../backend/README.md)

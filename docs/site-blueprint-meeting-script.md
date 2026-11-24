# Site blueprint walkthrough script

**Meeting:** 30 minutes with Sergio · about 20 minutes talking, 10 minutes for questions
**Open on screen:** [site-blueprint.pdf](./site-blueprint.pdf) (page numbers below refer to it)
**Before the call:** replace the two `[date]` placeholders, and fill in any costs and renewal dates you already have.

## 0:00–2:00 · Opening

**Show:** page 1, top.

> Hey Sergio, thanks for making time. This is the site blueprint you asked for. It's four pages that answer your eight points, plus detailed diagrams at the back. I'll go through it in order and stop for questions.
>
> Three things up front. One: the shop is custom code, not Shopify or any ready-made system. Two: it's not public yet. byponyo.com is still parked. Three: browsing, reservations, newsletter and the two portals work today. Payments and customer accounts are built but switched off.

## 2:00–8:00 · The main diagram

**Show:** page 1, the diagram. Read it top to bottom and point at each row.

> Top row: three kinds of people use the site. Visitors, us as admins, and makers.
>
> Second row: what they see. It's one website with three faces: the storefront, the Admin Portal and the Supplier Portal. It's built with Next.js and hosted on Vercel. Vercel is set up, but the domain isn't connected yet.
>
> Every page talks to the box in the middle, the back end. That's our own Python code, and it's where the Ponyo rules live: who can log in, how reservations work, how prices are set. The plan is to host it on AWS in Tokyo. Right now it only runs on my machine.
>
> Left side is the domain, still at Hostinger. Right side is GitHub, where the code lives.
>
> Bottom two rows are what the back end connects to: the database, image storage, email through our Hostinger mailboxes, Stripe for payments, analytics, and two helpers for rate limiting and translation.
>
> One thing to read correctly: a solid arrow means it works today. A dashed arrow means it's switched off or not connected yet. So Stripe is dashed, and so is the domain.

## 8:00–11:00 · What it's built on, and outside services

**Show:** page 2.

> Point two, what it's built on and why. The short version: pages and back end are custom, because we need things a normal shop doesn't do. Reservations before production, maker approval, and our price rule of supplier cost plus 20%. Payments, email and image storage are ready-made services.
>
> Point three, outside services. The list is complete, but I'll be honest: most monthly costs and renewal dates still say TBC. I didn't want to guess. I'll fill those in from the billing pages by [date].

## 11:00–14:00 · Pages and data

**Show:** page 3.

> Point four, the page list. Green means a visitor can open it. Grey is built but hidden: cart, checkout, accounts and the journal. Yellow is draft, and that's all five legal pages. They need company details and a legal review before launch.
>
> Point five, data. Everything sits in one database. Reservations can be exported from the Admin Portal as CSV or Excel. Products, newsletter emails and customer accounts can't be exported with a button yet. A developer has to do it.

## 14:00–18:00 · Backups, releases, adding a product

**Show:** page 4.

> Point six, backups. Straight answer: there's no scheduled database backup today, and we've never tested a restore. That has to be fixed before launch.
>
> Point seven, how a change goes live. Code goes to GitHub, tests run, then Vercel publishes the pages. Product changes don't need any of that; an admin just clicks publish. There's no permanent test site yet, only my local copy and Vercel previews.
>
> Point eight, adding a product. The supplier submits it in their portal, an admin approves it, the system translates it to Japanese and Korean, and the admin publishes. I haven't timed it yet. I'll run one pilot product and record the number.

## 18:00–21:00 · Detailed diagrams

**Show:** pages 7, 8 and 13 only. The other figures are reference; open them only if he asks.

> The back has 15 detailed diagrams. They're reference, so I'll only show three.
>
> Page 7, Figures 4 and 5: how a maker gets in and how a product gets published. The key point is that there are separate approvals. Accepting a maker doesn't publish anything.
>
> Page 8, Figure 6: reservation versus interest. If we ship to their country and reservations are open, it's a reservation. Otherwise it's saved as interest. Neither takes payment.
>
> Page 13, Figure 15: the left side is what runs today. The right side is the AWS plan, and none of it is built yet.
>
> Figures 7, 9, 11 and 12 are payments, accounts, supplier orders and shipping. All built, all switched off.

## 21:00–23:00 · Close

**Show:** page 4, "Still to confirm".

> Last thing: six open items. Costs and renewal dates, which database we use in production, connecting the domain, backups, who's allowed to publish, and the time per product. Some of these I need your decision on. Which one do you want first?

## 23:00–30:00 · Questions

| If Sergio asks | Answer |
| --- | --- |
| "When can it go live?" | "Not before the legal pages, a backup, and the domain are done. I'd rather give you a date after we decide the open items." |
| "Why not just use Shopify?" | "Reservations before production and the supplier portal aren't standard there. We'd be fighting the tool." |
| "What does it cost per month?" | "I don't have confirmed numbers yet, and I don't want to guess. You'll have them by [date]." |
| "Who can publish right now?" | "For code, anyone with access to GitHub and Vercel. For products, anyone with an admin account. I'll list the names in the doc." |
| "Is our data safe?" | "It's stored properly, but there's no backup yet. That's my top priority before launch." |
| "Which figure shows X?" | Logins: Figure 8 (page 9). Stripe: Figure 7 (page 8). Email: Figure 14 (page 12). Admin Portal: Figure 13 (page 11). |

## Where each figure is in the PDF

| Page | Figures |
| --- | --- |
| 5 | 1 Overall architecture |
| 6 | 2 Catalog · 3 Newsletter and contact |
| 7 | 4 Maker onboarding · 5 Product submission and publishing |
| 8 | 6 Reservation or interest · 7 Stripe payment |
| 9 | 8 Logins and permissions · 9 Accounts, cart, wishlist |
| 10 | 10 Supplier cost and capacity changes · 11 Supplier purchase orders |
| 11 | 12 Shipments · 13 Admin Portal |
| 12 | 14 Email, background jobs, translation |
| 13 | 15 Deployment |

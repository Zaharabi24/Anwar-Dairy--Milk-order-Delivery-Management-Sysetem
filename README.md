# Remix of Anwar Agro

Anwar Fresh — Lovable Build Playbook

A 5-credit plan to build the full frontend prototype from the system design doc

This playbook turns Fresh Milk Employee Ordering & Distribution System (v1.0, Anwar Agro Farms / Anwar Group of Industries) into a complete, animated, mock-data-driven frontend prototype — built entirely inside Lovable's free-tier budget of 5 credits.

How the 5 credits are spent:

# Action Credits Cost 1 Send Prompt 1 (this also creates the project) 1 Foundation, design system, landing page, login, app shell — Paste the Knowledge Base into Project Settings 0 — free Every prompt from here on inherits full context 2 Send Prompt 2 1 Employee flow + Factory Operator flow 3 Send Prompt 3 1 Coordinator + Finance + Admin + Reports 4 Send Prompt 4 1 Polish, motion refinement, consistency pass — Keep in reserve 1 Spend only if something needs a directed fix beyond what the free Try-to-fix button can handle

If you're actually on a paid plan (Pro/Business) and just happen to have 5 credits left this cycle, you have a strictly better option: Settings → GitHub, connect a repo, and push a hand-built codebase — that costs 0 credits and leaves all 5 for polish. Paid plans also unlock Visual/Manual Edit mode more fully. Everything below assumes the free tier, but it works identically either way if you'd rather just run the prompts.

Two things are free no matter what, use them liberally: the Try-to-fix button on any error, and inline text edits / comments (click text directly, or leave a comment) for copy or styling tweaks after the fact.

PROMPT 1 — creates the project (1 credit)

Foundation, design system, landing page, login, app shell

Paste this as your very first message on lovable.dev.

Build "Anwar Fresh" — a frontend-only prototype (no backend, no Supabase, no
real auth) for an internal employee milk-ordering platform for Anwar Agro
Farms, a concern of Anwar Group of Industries. This is a demo built with
realistic mock data, not a production system. Use React + TypeScript + Vite +
Tailwind CSS + shadcn/ui + React Router, exactly as your default stack. Also
install and use "framer-motion" for all animation — name it explicitly so it's
added as a real dependency.

PRODUCT IN ONE PARAGRAPH
Every production day, a Factory Operator publishes one "Daily Milk Batch" —
available litres, price per litre, and a delivery window. Eligible employees
get a link, book a quantity before a cut-off time, and stock reduces live the
instant they confirm, so the batch can never be oversold. Head-office staff
fulfill orders from one delivery list, mark collection, and the day is
reconciled at close. One product only (Fresh Whole Milk, litres), fixed
delivery points, no payment gateway — just Paid/Unpaid tracking. Currency is
Bangladeshi Taka (৳).

DESIGN SYSTEM — set this up as real Tailwind theme tokens / CSS variables,
not inline hex codes scattered through components:
- Background: #F7F9F5 (soft sage-white, NOT warm cream)
- Foreground/ink: #16211B (deep pasture charcoal, NOT pure black or grey-slate)
- Primary (brand green): #2B6A4C, with a deeper hover/emphasis shade #1E4E38
- Accent (creamy gold, for CTAs and "live" energy): #E3A73E
- Info (dashboard-only, used sparingly): #3E6FA3
- Danger (muted, not neon): #C1503F
- Surface/card borders: #DCE6DD hairline — do NOT put an identical soft grey
  drop-shadow under every card; reserve real elevation/shadow for modals,
  dropdowns and sheets only, use hairline borders for everyday cards
- Typography: two typefaces only, clearly distinct roles. Load "Bricolage
  Grotesque" from Google Fonts for display/headings (it should carry
  personality — this is an active design element, not a neutral label), and
  "Inter" from Google Fonts for body text, forms, tables and all dense UI.
  No serif anywhere. No tracked-out ALL-CAPS eyebrow labels above headings.
  No arrow "→" appended to button/link text. Do not accent a single word in
  a headline with italics or a different color.
- Border radius: pick one consistent small radius (6-8px) for inputs/buttons
  and a slightly larger one (12-14px) for cards — don't mix arbitrary radii.
- Motion principle: purposeful, not scattered. A handful of orchestrated
  moments (specified below) rather than fade-up-on-every-element. Respect
  prefers-reduced-motion.

LANDING PAGE ("/") — public, no login required. Sections in order:

1. Sticky top nav: "Anwar Fresh" wordmark left, in-page links (How it works,
   For your team), a "Sign in" button right. No hero label/eyebrow above the
   logo.

2. HERO — asymmetric two-column layout (roughly 55/45), left-aligned text,
   NOT centered, NOT a generic gradient-blob-behind-big-number layout.
   - Left: headline "Today's milk, booked in under a minute." Subhead
     explaining the daily-batch model in one sentence. Two CTAs: "See
     today's batch" (primary, scrolls to or links toward the offer preview)
     and "Sign in" (secondary, goes to /login).
   - Right: an animated live "batch card" widget — a stylised bottle/jug
     glyph with a liquid fill level, a pulsing "Active" status dot, a large
     number for "litres remaining" that gently ticks/counts on a loop for
     demo purposes, and a small cut-off countdown. This is a live preview of
     the actual product mechanic, not decoration — animate the liquid level
     and the number subtly and continuously using framer-motion.

3. HOW IT WORKS — a horizontal 5-stage path: Factory → Publish → Book →
   Deliver → Collect. On scroll into view, animate a token/dot travelling
   along the connecting line, lighting up each stage node as it arrives.
   One short line of copy per stage, in plain language (what actually
   happens, not marketing fluff).

4. CAPABILITIES / SERVICES — five role cards: Employee, Factory Operator,
   Head Office Coordinator, Finance, System Admin. Each has an icon (use
   lucide-react), a one-line value prop written from that person's
   perspective (e.g. "Book your litres before the cut-off, see your order
   code instantly" — not "Streamline your milk procurement workflow").
   Present these in a horizontally auto-scrolling strip (continuous slow
   marquee, pausing on hover) so they are genuinely moving, not just cards
   in a static grid. Give the Employee card slightly more visual weight
   since it's the largest audience — vary size, don't make all five
   identical.

5. STATS STRIP — 4 numbers that count up when scrolled into view: "<60s
   average booking time", "0 overbooking incidents", "100% of changes
   audited", "1 batch, fully reconciled daily".

6. Footer: Anwar Fresh wordmark, "An Anwar Agro Farms system", copyright.

LOGIN SCREEN ("/login") — mock company SSO, nothing functional needs to
authenticate: a card with "Continue with Microsoft" and "Continue with
Google" buttons (styled realistically, non-functional), then below a divider,
a small "Preview a role" section with 5 buttons — Employee, Factory Operator,
Head Office Coordinator, Finance, System Admin — clicking one sets that role
in shared app state and navigates into the app. This is the ONLY sign-in
mechanism this prototype needs.

APP SHELL (everything under "/app/...") — build the shell and routing now;
individual pages can be simple "coming in the next step" placeholders for
now, EXCEPT they must already be real routes with the correct URL, correct
sidebar entry, and correct page title, so nothing 404s:
- Persistent left sidebar, nav items scoped to the active role (pull the
  active role from shared React Context).
- Top bar: current role name/badge, a role-switcher dropdown (for this demo,
  anyone can switch roles anytime from here — label it clearly as a demo
  control), and a notification bell icon (visual only for now).
- Routes to scaffold: /app/offer, /app/order/new,
  /app/order/confirmation/:orderId, /app/my-orders (Employee) · /app/operator,
  /app/operator/new-batch, /app/operator/publish (Factory Operator) ·
  /app/orders, /app/fulfillment (Coordinator) · /app/collections (Finance) ·
  /app/admin/employees, /app/admin/delivery-points, /app/admin/settings,
  /app/admin/audit-log (Admin) · /app/reports (shared).
- Smooth, quick route-transition animation (fade/slide, under 200ms) —
  subtle, not showy.

Do NOT connect Supabase, Firebase, or any backend. Set up a single React
Context ("AppDataProvider") holding all mock data in memory, with functions
to mutate it (confirm an order, publish a batch, change a status, etc.) so
later steps can wire real interactions to it. Seed it with a *small* starter
set for now (a handful of employees, one active batch) — richer fixtures
come in the next prompt.


RIGHT AFTER PROMPT 1 — paste into Project Settings → Knowledge (free)

Do this before sending Prompt 2. Open your new project, go to Project Settings → Knowledge, and paste the entire block below. It is a settings field, not a chat message — it costs nothing, and it's automatically included with every future prompt, so Prompts 2–4 don't need to repeat any of this.

PROJECT: Anwar Fresh — internal employee milk ordering & distribution
prototype for Anwar Agro Farms (a concern of Anwar Group of Industries).
Frontend-only demo with realistic mock data. No backend, no Supabase, no real
authentication — everything lives in the shared AppDataProvider React Context
set up in the first build step.

AUDIENCE & TONE: two audiences in one product. Employees book milk on their
phone in under a minute — copy for them is warm, plain, zero jargon. Ops
staff (Factory Operator, Coordinator, Finance, Admin) run a daily operation —
their screens are calm, dense, numbers-first, fast to scan. Landing page can
be lively; everything inside /app should be quiet and clear. Currency is
Bangladeshi Taka (৳). Names, departments and delivery points should read as a
real Bangladeshi company, never placeholder text like "John Doe" or "Company
A".

ROLES (switchable from the demo role-switcher in the top bar, no real login):
1. Employee — views today's offer, books litres, gets a confirmation +
   order code, views/cancels own orders before cut-off.
2. Factory Operator — creates & publishes the daily batch, owns the operator
   dashboard, can pause/close a batch.
3. Head Office Coordinator — manages incoming orders (search/filter/adjust/
   cancel), runs fulfillment grouped by delivery point.
4. Finance / Collection — tracks amount due/collected, payment status &
   reference. (In the real org this can be the same person as the
   Coordinator — a small "lean staffing" note is fine somewhere subtle like
   a tooltip, not a big banner.)
5. System Admin — manages employees, delivery points, daily caps; views the
   audit log.

MOCK DATA MODEL — keep these as typed objects/interfaces:
- Employee: id, name, companyEmail, phone, department, site, active.
  Departments: Production, Finance, HR, Sales, IT, Admin, Procurement.
  Sites: Head Office – Gulshan, Savar Factory. Use real-sounding Bangladeshi
  names throughout (e.g. Rahim Uddin, Nusrat Jahan, Kamal Hossain, Fatima
  Akter, Shakil Ahmed, Ayesha Siddika, Tanvir Rahman, Sultana Razia, Imran
  Kabir, Mahmuda Khatun — vary freely, keep it realistic, roughly 20-24
  employees total so lists never look sparse).
- DailyMilkBatch: batchNo, productionDate, product ("Fresh Whole Milk"),
  producedLitres, saleableLitres, ratePerLitre (৳), minOrder, maxOrder,
  employeeCap, bookingCutoff, deliveryDate, deliveryWindow, deliveryPoints[],
  note, status (Draft | Active | Paused | SoldOut | Closed).
- DeliveryPoint: id, name, address/instructions, coordinatorName, active.
  Use: Head Office – Gulshan, Factory Gate – Savar, Regional Office –
  Chattogram, Depot – Ashulia.
- Order: orderNo, employeeId, batchNo, litres, rate, amount, deliveryPointId,
  status (Confirmed | Packed | OutForDelivery | Delivered | Cancelled |
  NotCollected), createdAt.
- DeliveryRecord: orderNo, recipientName, contact, dateTime, location,
  quantity, receiverName, remarks.
- CollectionRecord: orderNo, amountDue, amountCollected, method (Cash |
  bKash | Payroll deduction), reference, status (Paid | Unpaid | Partial),
  collectorName, date.
- AuditLog: id, user, action, record, oldValue, newValue, timestamp. Every
  meaningful action taken anywhere in the app (publish, adjust, cancel,
  status change, config change) should push a real entry here so the audit
  log page is never empty or fake-looking.

BUSINESS RULES — the mock state must actually behave this way, not just look
like it does:
1. First-confirmed-first-allocated; an order only counts once confirmed.
2. remainingLitres = saleableLitres − sum(active confirmed litres),
   recalculated the instant a booking confirms or cancels — never let
   confirmed litres exceed saleable litres.
3. One active order per employee per batch. Respect the batch's own
   min/max order size AND the configurable employeeCap.
4. Quantity increments of 1 litre.
5. Booking is blocked (with a clear closed state, not just a disabled
   button) at cut-off time, when remaining stock drops below the minimum
   order, or when an operator pauses the batch.
6. Employees can cancel only before cut-off; cancelling returns litres to
   available stock live.
7. Any Coordinator/Admin adjustment requires a reason before it saves, and
   writes an audit log entry.
8. Collection only records status/method/reference — there is intentionally
   no payment form or gateway.
9. A Closed batch never accepts new orders.

STATUS MODELS:
- Batch: Draft → Active → (Paused | Sold Out) → Closed.
- Order: Confirmed → Packed → Out for Delivery → Delivered, with Cancelled
  and Not Collected as branch/exception states.
Give each status a consistent colored badge used identically everywhere:
Draft/neutral grey, Active/primary green, Paused/accent gold, Sold Out/info
blue, Closed/dark neutral · Confirmed/info blue, Packed/accent gold, Out for
Delivery/light green, Delivered/solid green, Cancelled/muted red, Not
Collected/red outline.

VOICE & MICROCOPY: active voice, plain language, name things the way a user
would ("your order", not "the transaction record"). A button's label matches
the toast it produces ("Publish batch" → "Batch published"). Empty states are
an invitation to act ("No batches yet — create today's batch to get
started"), not an apology. Errors say exactly what happened and how to fix
it, never "Something went wrong."

TECHNICAL: React + TypeScript + Vite + Tailwind + shadcn/ui + React Router +
framer-motion (animation) + recharts (charts, used on the Reports page). No
backend. All state in the shared AppDataProvider Context set up in step one.


PROMPT 2 (1 credit)

Employee flow + Factory Operator flow

Continuing the Anwar Fresh project. Build these pages fully and wire every
interaction to the shared AppDataProvider — actions should visibly change
state, not just look static.

EMPLOYEE EXPERIENCE
- /app/offer — today's Active batch: a large live "litres remaining"
  indicator, price per litre, a real countdown to the booking cut-off,
  delivery window and delivery point options, and a prominent "Book now"
  button. If the batch is sold out or past cut-off, replace the CTA with a
  clear closed state and explain why, don't just grey out a button.
- /app/order/new — employee details prefilled from the active demo user; a
  litre stepper that respects the increment, min/max order size, employee
  cap and live remaining stock (disable going higher than what's actually
  left); a delivery point picker limited to points assigned to this batch;
  a running total (litres × rate); "Confirm order" button.
- /app/order/confirmation/:orderId — order code + a QR-style code visual,
  full order summary, delivery instructions, link to "View my orders". Give
  this moment one small, clean success animation on arrival (a checkmark or
  similar) — a single deliberate moment, not a flurry of effects.
- /app/my-orders — the employee's order history with status badges; a
  "Cancel" action, enabled only on Confirmed orders before cut-off, that
  live-updates the order to Cancelled and returns the litres to available
  stock.

FACTORY OPERATOR EXPERIENCE
- /app/operator — today's dashboard: available / booked / delivered /
  unsold litres and collection value as stat cards that count up on load
  (framer-motion), current batch status badge, and a compact recent-activity
  feed pulled from the audit log.
- /app/operator/new-batch — full form for every DailyMilkBatch field
  (production date, product, produced/saleable litres, rate, min/max order,
  employee cap, booking cut-off, delivery date & window, delivery points,
  note). Validate required fields. Submitting creates the batch in Draft
  status and moves to Review & Publish.
- /app/operator/publish — preview of the batch exactly as employees will
  see it, plus recipient-group summary (how many eligible employees).
  Actions: Publish (moves batch to Active, shows a mocked "emailed to N
  employees" confirmation), Pause bookings, Close batch — each should
  visibly change the batch's status everywhere it's shown.

Expand the mock fixtures now: roughly 20-24 employees across all
departments, today's Active batch plus 8-10 historical Closed batches with
varied, internally-consistent numbers (produced/booked/delivered/unsold
should actually add up per batch), and 35-50 orders distributed realistically
across them with timestamps clustered before each batch's cut-off.


PROMPT 3 (1 credit)

Coordinator + Finance + Admin + Reports

Continuing the Anwar Fresh project. Build out the remaining role experiences,
wired to the same shared mock data.

HEAD OFFICE COORDINATOR
- /app/orders — a searchable, filterable table of orders (by employee,
  department, delivery point, status). Row actions to adjust an order
  (requires a reason, writes an audit entry, updates totals live) or cancel
  it.
- /app/fulfillment — orders grouped by delivery point, with one-tap status
  progression (Packed → Out for Delivery → Delivered / Not Collected).
  Marking Delivered opens a small capture step for receiver name and
  remarks (the DeliveryRecord).

FINANCE / COLLECTION
- /app/collections — orders needing payment tracking: amount due, amount
  collected, a status control (Paid / Unpaid / Partial), payment method
  (Cash / bKash / Payroll deduction) and a reference field. Show an
  outstanding-balance summary at the top of the page. This only records
  status — there is no payment form or gateway anywhere in this app.

SYSTEM ADMIN
- /app/admin/employees — manage the employee list: add, edit, deactivate;
  filter by department and site.
- /app/admin/delivery-points — manage the fixed delivery point list.
- /app/admin/settings — default employee cap, default quantity increment,
  and similar configuration values.
- /app/admin/audit-log — a clean, filterable, chronological feed of every
  action taken anywhere in the app so far (user, action, old → new value,
  timestamp). It should visibly contain real entries generated by
  everything built in Prompts 1 and 2, proving the trail actually works.

REPORTS (/app/reports — visible to Operator, Admin and Finance)
Make this the most polished data screen in the app: implement the 8
reconciliation metrics — produced/saleable litres, transferred vs received
variance, booked/delivered/uncollected/unsold litres, number of ordering
employees, gross sales value, collected vs outstanding value, average
litres per order, and sell-through rate (delivered ÷ saleable) — using
"recharts" (install it, name it explicitly). Mix stat cards, a bar or area
chart trending the last 7-10 closed batches, and a donut or radial progress
visual for sell-through rate. This is the "impressive dashboard" moment —
give it real hierarchy and breathing room, not a wall of equal-sized boxes.


PROMPT 4 (1 credit)

Polish & the "impressive" pass

Continuing the Anwar Fresh project. This is a refinement pass — improve
what exists rather than rebuilding it.

1. Landing page: confirm the hero liquid/counter animation, the how-it-works
   travelling-token animation, and the services marquee all run smoothly,
   feel intentional and staggered (not simultaneous), and respect
   prefers-reduced-motion.
2. Every list/table screen: add a real empty state (not a blank flash) and
   a loading skeleton for first paint.
3. Consistency pass across the whole app: only design-system tokens, no
   stray colors; ৳ currency and date formatting identical everywhere; every
   status badge uses the exact color mapping defined in project knowledge,
   with no exceptions.
4. Full responsiveness down to a 375px viewport — the Employee booking flow
   (/app/offer → /app/order/new → confirmation) is the one that most needs
   to feel effortless on mobile, since the real-world target is a
   sub-one-minute mobile booking.
5. Visible keyboard focus states on every interactive element; accessible
   labels on icon-only buttons.
6. Re-check every screen's mock data for realism: names, numbers and dates
   should be varied and internally consistent everywhere — nothing should
   read as repeated placeholder or Lorem-ipsum-style content.


After Prompt 4 — spend the last credit wisely

Run Try-to-fix (free) on anything that visibly breaks before you spend your reserved credit on a directed fix prompt.

Use inline text edits (click any text directly) for copy tweaks, and comments for pointing at something specific — both free.

If everything works, save credit 5 for one focused follow-up once you've actually clicked through the app and found the one thing that bugs you most — that's a much better use of it than a vague "make it better" prompt.

Full sitemap, for reference

Route Role Built in / Public Prompt 1 /login Public Prompt 1 /app/offer, /app/order/new, /app/order/confirmation/:id, /app/my-orders Employee Prompt 2 /app/operator, /app/operator/new-batch, /app/operator/publish Factory Operator Prompt 2 /app/orders, /app/fulfillment HO Coordinator Prompt 3 /app/collections Finance Prompt 3 /app/admin/employees, /app/admin/delivery-points, /app/admin/settings, /app/admin/audit-log Admin Prompt 3 /app/reports Operator / Admin / Finance Prompt 3

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://daily-farm-dash.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f67a2a73-084d-4432-8f21-762904dfa73f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

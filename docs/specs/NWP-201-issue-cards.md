# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code, against files that were read first.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** jacob.schwartz@teradyne.com
**Status:** built — see *Departures from this plan* at the end for where the code and this document differ, and why

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, it happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a Slack thread. Marcus Bell wants issuing in the console: a form that creates the card, a list of what has been issued, and a detail view to check one.

The failure mode the ticket is actually paying to remove is the wrong limit. That is what pushes validation to the server and the limit into integer minor units — a Slack thread and a float both lose cents.

## Current state

Read before planning. Cards do not exist in this codebase yet; everything below is what they have to fit into.

- `merchant-console/src/data/types.ts` — `Currency = "USD" | "EUR" | "GBP"` already exists and is the allowlist the ticket asks for. `Payment` documents `amount` as "Integer minor units. Never a float." and `createdAt` as "ISO 8601, always UTC." **No `Card` type, no `CardStatus`.**
- `merchant-console/src/data/store.ts` — `Store` interface holds `merchants`, `payments`, `refunds`, `disputes`, `payouts`. Built once by `createStore()` and pinned to `globalThis.__northwindStore` so the dev server's module reloading does not hand each request a fresh copy. **A `cards` array has to join the interface and `createStore`, or writes will not survive a request.**
- `merchant-console/src/data/queries.ts` — the one payment query builder: `parseFilters` allowlists `status`/`sort`/`direction`, `filterPayments` narrows, `paginate` slices at `PAGE_SIZE = 20`, `queryPayments` composes all three. `paymentById` is a plain `find`. Cards need their own reads; they must not be routed through the *payment* builder, and the payment builder must not be copied.
- `merchant-console/src/lib/money.ts` — `formatMoney(minorUnits, currency)` is the single display formatter. `parseAmountToMinorUnits(input)` **already exists** and is documented "Boundary only": it rejects anything that is not `\d+(\.\d{1,2})?` and returns `null`. That is exactly the limit-field converter this ticket needs — do not write a second one.
- `merchant-console/src/lib/dates.ts` — `formatDate(iso)` (UTC, for tables), `formatInZone(iso, tz)` (merchant timezone, for detail). Both already do what the card list and card detail need.
- `merchant-console/src/app/payments/page.tsx` — the list pattern to copy: server component, `TableRoot`/`Table`/`TableHead`/`TableRow`, a written empty state in a `colSpan` row ("No payments match these filters"), `formatMoney` called in the cell, `formatDate` in the date cell, `Link` to the detail route.
- `merchant-console/src/app/payments/[id]/page.tsx` — the detail pattern: `await params`, `notFound()` when the record is missing, a local `Field` helper over a `<dl>`, `formatMoney` in the heading, both UTC and merchant-timezone timestamps shown.
- `merchant-console/src/components/ui/payments/ExportDialog.tsx` — the only modal in the app, and the precedent for this ticket's issue form. It is built on `Drawer` (`@radix-ui/react-dialog`), holds its own `open` state, uses `<label>` per control.
- `merchant-console/src/components/ui/payments/StatusBadge.tsx` — `AnyStatus = PaymentStatus | DisputeStatus | PayoutStatus` with three lookup maps (`LABELS`, `DOTS`, `VARIANTS`). Extending it with `CardStatus` is reuse; a second badge component would be a second implementation.
- `merchant-console/src/components/ui/navigation/AppSidebar.tsx` + `merchant-console/src/app/siteConfig.ts` — nav is a `navigation` array of `{name, href, icon}` reading `siteConfig.baseLinks`. `CreditCard` from `lucide-react` is **already imported** there for Payments, so Cards needs a different icon.
- `merchant-console/vitest.config.ts` — `environment: "node"`, `include: ["src/**/*.test.ts"]`. **`.test.tsx` is not collected**, so tests go in `.test.ts` next to plain-TS logic. `npm test` is `vitest run`.

### Where the ticket and the code disagree

- **`•••• 4242` is an example, not a literal.** `.claude/rules/cards.md` says "Mask everywhere else as `•••• 4242`", and the ticket repeats it. Taken literally it would print the *BIN* as the last four for every card, which is wrong the moment two cards exist. The rule that actually governs is "Store the last four and the generated number's reference" — so the mask is `•••• ${last4}`, rendered from stored `last4`. For a number ending 4242 it prints exactly `•••• 4242`.
- **There is no `Dialog.tsx`.** `.claude/rules/components.md` claims `src/components/` has one; it does not. `Drawer.tsx` is the only `@radix-ui/react-dialog` primitive, and `ExportDialog.tsx` is the precedent for using it as a modal. The issue form uses `Drawer`.
- **"Seed data is JSON" is aspirational.** `merchant-console/src/data/merchants.ts` is a typed TS array and `generate.ts` builds the rest at boot; there is no seed `.json`. Card seed data follows `merchants.ts`, the pattern that actually exists.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. `$250.00` is `25000`." | `merchant-console/CLAUDE.md` | The exact defect the ticket was filed over: a wrong limit |
| "Never parse a currency string into a number… validated and converted at the boundary, once." | `.claude/rules/money.md` | A float limit, and cents that drift |
| "Format at the edge… A second formatter is how the two halves of an app start disagreeing." | `.claude/rules/money.md` | List and detail disagree about the same card |
| "Every generated number starts `4242` and carries a valid Luhn check digit." | `.claude/rules/cards.md` | Something in the repo resembles a real PAN |
| "Generate on the server. A card number produced in the browser is a bug." | `.claude/rules/cards.md` | The PAN exists in client code and in the bundle |
| "Reveal once… not on the card record, not in a list or detail payload, not left in client state after the success screen closes." | `.claude/rules/cards.md` | A full PAN is re-readable forever |
| "Status is a state machine… `cancelled` is terminal. Guard the transition on the server, not only in the UI." | `.claude/rules/cards.md` | A cancelled card comes back to life via curl |
| "Validate everything from the client against an allowlist… Client-side checks are a convenience, never the enforcement." | `.claude/rules/api-routes.md` | `<select>`-bypassed currency, negative limits |
| "Return the same error shape everywhere… a body with a message safe to show a user." | `.claude/rules/api-routes.md` | The form has nothing to display |
| "Reject early and return." | `.claude/rules/api-routes.md` | Cases go missing in nested branches |
| "One query builder." | `merchant-console/CLAUDE.md` | A copied payment filter |
| "No database, no ORM, no migrations." | ticket + `merchant-console/CLAUDE.md` | Out of scope; costs the clock |

## Approach

Card logic splits in two, and the split is what keeps the PAN off the record.

`src/lib/cards.ts` is **pure, dependency-free, and unit-tested**: the Luhn generator on the `4242` BIN, the mask, the state machine's legal-transition table, and the limit/currency/merchant validator. Nothing in it touches the store or Next, which is why it can be covered by a plain-node `.test.ts` and why the generator can be asserted over a thousand iterations.

`src/data/cards.ts` is the store-facing layer: reads (`listCards`, `cardById`), and two commands (`issueCard`, `transitionCard`). `issueCard` is the *only* place a full number exists — it generates, derives `last4` and a `reference`, stores the record **without the PAN**, and returns the PAN beside the record as a separate field so the type system itself says the reveal is not part of `Card`. `transitionCard` calls the pure `canTransition` before writing, so the guard lives on the server whatever the UI does.

The routes stay thin, the way `src/app/api/payments/route.ts` is thin. `POST /api/cards` validates and returns `201` with `{card, fullNumber}`; `GET /api/cards` and `GET /api/cards/[id]` return records that structurally cannot carry a PAN; `PATCH /api/cards/[id]` transitions and returns the updated record, which is what lets freeze/unfreeze repaint a row without a reload.

Money crosses the boundary exactly once: the dialog sends the limit as the string the user typed, and the route converts it with the existing `parseAmountToMinorUnits` and then range-checks the integer. The client never does arithmetic on it.

The two representations get **two field names**, not one field that changes meaning with its JSON type. `spendLimit` is a string in major units — what a form sends — and `spendLimitMinorUnits` is an integer count of minor units, the canonical machine form. Sending both is a 400. One field accepting either would make `spendLimit: 250` and `spendLimit: "250"` differ by a factor of a hundred, and a caller who meant $250.00 would silently get a $2.50 card, which is the exact wrong-limit failure the ticket was filed to remove.

**Considered and rejected:** generating the number in the dialog to skip a round trip — `.claude/rules/cards.md` names that as a bug outright. Also rejected: a Server Action for issuing, which would be idiomatic Next 15 but leaves the one-time reveal in a component's state rather than in a single HTTP response, and gives the grader no route to curl.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `merchant-console/src/lib/cards.ts` | Add | Pure: Luhn generator on the `4242` BIN, `maskCardNumber`, `groupCardNumber`, transition table, validator, `MAX_SPEND_LIMIT_MINOR_UNITS` and `maxSpendLimitLabel`, `CATEGORY_LABELS` |
| `merchant-console/src/lib/cards.test.ts` | Add | Generator (BIN, length, Luhn, 1000 iterations, hostile digit sources), transitions incl. terminal `cancelled`, spend ratio and the 80% threshold, both limit forms, every validation boundary |
| `merchant-console/src/data/types.ts` | Change | `CardStatus`, `MerchantCategory`, `Card`, `CardStatusEvent`; reuse existing `Currency` |
| `merchant-console/src/data/cards-seed.ts` | Add | Seed rows and the boot-time number generation. Separate from `cards.ts` — see departures |
| `merchant-console/src/data/cards.ts` | Add | `listCards`, `cardById`, `countCards`, `parseCardFilters`, `issueCard`, `transitionCard`. The only place a PAN exists |
| `merchant-console/src/data/cards.test.ts` | Add | `issueCard`/`transitionCard` against the real store, the filter allowlist, and the list's ordering tie-break |
| `merchant-console/src/data/store.ts` | Change | `cards: Card[]` on `Store` and in `createStore()`, so writes survive dev-server reloads |
| `merchant-console/src/app/api/cards/route.ts` | Add | `GET` list (narrowed through `parseCardFilters`), `POST` issue — validates, returns `201 {card, fullNumber}` |
| `merchant-console/src/app/api/cards/[id]/route.ts` | Add | `GET` detail, `PATCH` status transition, guarded server-side, `409` on an illegal move |
| `merchant-console/src/app/cards/page.tsx` | Add | `/cards` list: the six columns, status tabs, a zero-JS GET search form, and two distinct empty states |
| `merchant-console/src/app/cards/[id]/page.tsx` | Add | Detail: full record, spend against limit, status history, two-step cancel |
| `merchant-console/src/components/ui/cards/IssueCardDialog.tsx` | Add | Client form on `Drawer`, labelled inputs, field-level server errors, one-time reveal |
| `merchant-console/src/components/ui/cards/CardStatusControl.tsx` | Add | Client freeze/unfreeze via `PATCH`, no reload; cancel on detail only |
| `merchant-console/src/components/ui/cards/SpendProgress.tsx` | Add | Bar, amber past 80%, exposed as a `progressbar` |
| `merchant-console/src/components/ui/payments/StatusBadge.tsx` | Change | Extend `AnyStatus` with `CardStatus` rather than adding a second badge |
| `merchant-console/src/app/siteConfig.ts` | Change | `baseLinks.cards = "/cards"` |
| `merchant-console/src/components/ui/navigation/Breadcrumbs.tsx` | Change | `cards: "Cards"` in `LABELS`, or the new route renders its raw path segment |

## Plan

Server first, checked, then the UI — a dialog over a route that does not work yet is wasted clock.

1. `src/lib/cards.ts` pure module, then `src/lib/cards.test.ts`, then `npm test`. The generator is provable before anything renders.
2. Types, `cards` on the store, `src/data/cards.ts` with seed rows (varied status, one seeded past 80% spend so the amber threshold is visible without clicking).
3. The two route files. Verify with `curl`: a good `POST` returns `201` with a `4242…` number, and each rejected case returns `400` with a message.
4. `/cards` list, then `/cards/[id]` detail, then the issue dialog with its one-time reveal, then the freeze control.
5. Read the diff. `org-standards` on it, `/ship-ready`, `npm test`, `npm run lint`, `npm run build`.

## Acceptance criteria → where it lives

| Criterion | Implemented in | Verified by |
| --- | --- | --- |
| Issue a card; it appears in the list | `IssueCardDialog.tsx` → `POST /api/cards` → `issueCard` | curl + browser |
| `/cards` list with the six columns | `src/app/cards/page.tsx` | browser |
| Card detail with spend against limit | `src/app/cards/[id]/page.tsx`, `SpendProgress.tsx` | browser |
| Numbers server-side, `4242` BIN, valid Luhn | `generateCardNumber` in `src/lib/cards.ts` | `cards.test.ts`, 1000 iterations |
| Reveal once, mask forever | `issueCard` returns the PAN outside the `Card`; `maskCardNumber` everywhere | `data/cards.test.ts` asserts no value on the record equals the PAN; curl `GET` |
| Server-side validation (merchant, limit ≤ 5,000,000, currency) | `validateIssueInput` in `src/lib/cards.ts`, called by the route | `cards.test.ts` + curl per case |
| Empty and error states | Two states in `cards/page.tsx`; field errors in the dialog | reachable via `?search=` with no match |

## Out of scope

Persistence (NWP-203), auth, real issuer calls, editing a limit after issue (NWP-202). No database, no ORM, no migrations.

## Departures from this plan

Written after the build. A departure is not a failure; an unexplained one is.

- **The seed moved to its own module.** The file map put it in `src/data/cards.ts`. The store has to import the seed while the query module imports the store, so keeping both in one file is an import cycle. Seed rows and the boot-time generation live in `src/data/cards-seed.ts`, mirroring how `merchants.ts` is data and `queries.ts` is reads.
- **`CATEGORY_LABELS` lives in `src/lib/cards.ts`, not the dialog.** It started in `IssueCardDialog.tsx`, but the list and detail pages are server components and importing a constant across a `"use client"` boundary to get it is the wrong direction. It sits beside `MERCHANT_CATEGORIES`, the list it labels.
- **`maxSpendLimitLabel` and `groupCardNumber` were not in the plan.** Both came out of review. The first exists because the form hint and the rejection message were two hardcoded spellings of one constant and had already drifted into different units; the second because a card-number formatter in a component is the thing `maskCardNumber` in `src/lib/` exists not to be.
- **The limit takes two field names.** The plan said the limit "crosses as the string that was typed". It still does from the form, but the route also accepts `spendLimitMinorUnits`, because a single field that reads a string as major units and a number as minor units is a hundredfold ambiguity on the one value this ticket is about. See *Approach*.
- **Status tabs and a search box were added to the list.** Not in the ticket. Both go through `parseCardFilters`, an allowlist in the shape of `parseFilters` in `queries.ts`, and they are what makes the "no cards match" empty state reachable at all — with four seed cards the list is otherwise never empty, so the written state could never be seen.
- **`src/data/cards.test.ts` was added.** The plan only listed `lib/cards.test.ts`. `transitionCard` is the guard rule 3 actually rests on, and it was covered by curl but not by a test.

## Open questions

- **Spend is seeded, never incremented.** Nothing in this app links a payment to a card, and wiring authorizations into spend is not in the ticket. Spend is a stored minor-units field on the card, seeded for existing rows and `0` for newly issued ones, which is enough for the detail view's progress bar.
- **Cancel is built but kept off the list.** The state machine has to implement `→ cancelled` and guard its terminality; the list only exposes freeze/unfreeze, since an irreversible action behind a one-click row button in an ops tool is how a card gets killed by accident. It is exposed on the detail page instead.

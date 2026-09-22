import { Card, CardStatus, Currency, MerchantCategory } from "@/data/types"
import { formatMoney, parseAmountToMinorUnits } from "./money"

/**
 * Card rules, with no store and no framework behind them.
 *
 * Everything here is pure so it can be asserted directly in `cards.test.ts`:
 * the generator over a thousand iterations, the transition table in both
 * directions, and every validation boundary. The store-facing half lives in
 * `src/data/cards.ts`.
 */

/**
 * The test BIN, and it is not optional. Every generated number starts here so
 * nothing in this repository can resemble a real PAN.
 */
export const TEST_BIN = "4242"

export const CARD_NUMBER_LENGTH = 16

/** The ticket's ceiling, in minor units: 5,000,000 is $50,000.00. */
export const MAX_SPEND_LIMIT_MINOR_UNITS = 5_000_000

/**
 * The ceiling as a user reads it. The form hint and the rejection message both
 * come from here: a number shown twice has to be derived once, or changing the
 * constant leaves one of them lying.
 */
export function maxSpendLimitLabel(currency: Currency): string {
  return formatMoney(MAX_SPEND_LIMIT_MINOR_UNITS, currency)
}

/** The currency allowlist. Anything else from the client is rejected. */
export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

export const CARD_STATUSES: readonly CardStatus[] = [
  "active",
  "frozen",
  "cancelled",
]

export const MERCHANT_CATEGORIES: readonly MerchantCategory[] = [
  "advertising",
  "software",
  "travel",
  "office_supplies",
  "contractors",
  "utilities",
]

export const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  advertising: "Advertising",
  software: "Software & subscriptions",
  travel: "Travel",
  office_supplies: "Office supplies",
  contractors: "Contractors",
  utilities: "Utilities",
}

/** Nicknames are how ops finds a card later; an unbounded one breaks the table. */
export const MAX_NICKNAME_LENGTH = 60

/** The share of the limit at which spend stops being comfortable. */
export const SPEND_WARNING_RATIO = 0.8

// --- Luhn -------------------------------------------------------------------

/** Double a digit the way Luhn does: 8 → 16 → 7. */
function doubleDigit(digit: number): number {
  const doubled = digit * 2
  return doubled > 9 ? doubled - 9 : doubled
}

/**
 * Check digit for a payload that is missing its last digit.
 *
 * The payload's rightmost digit sits second-from-right in the finished number,
 * which is a doubling position — hence the even offsets double here, and the
 * odd ones do in `isValidLuhn`.
 */
export function luhnCheckDigit(payload: string): number {
  let sum = 0
  for (let offset = 0; offset < payload.length; offset++) {
    const digit = Number(payload[payload.length - 1 - offset])
    sum += offset % 2 === 0 ? doubleDigit(digit) : digit
  }
  return (10 - (sum % 10)) % 10
}

/** Whether a complete number carries a valid Luhn check digit. */
export function isValidLuhn(cardNumber: string): boolean {
  if (!/^\d+$/.test(cardNumber)) return false
  let sum = 0
  for (let offset = 0; offset < cardNumber.length; offset++) {
    const digit = Number(cardNumber[cardNumber.length - 1 - offset])
    sum += offset % 2 === 1 ? doubleDigit(digit) : digit
  }
  return sum % 10 === 0
}

/**
 * A 16-digit number on the test BIN with a valid Luhn check digit.
 *
 * Server-side only — a number generated in the browser is a bug. The digit
 * source is injectable so tests can pin it; nothing else should pass it.
 */
export function generateCardNumber(
  randomDigit: () => number = () => Math.floor(Math.random() * 10),
): string {
  let payload = TEST_BIN
  while (payload.length < CARD_NUMBER_LENGTH - 1) {
    payload += String(Math.abs(Math.trunc(randomDigit())) % 10)
  }
  return payload + String(luhnCheckDigit(payload))
}

/** The last four of a generated number. The only part of it that is ever stored. */
export function lastFour(cardNumber: string): string {
  return cardNumber.slice(-4)
}

/**
 * How a card number is displayed anywhere that is not the creation response.
 * Reads from the stored last four, which is all there is to read from.
 */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}

/** Groups of four, for the one screen that shows a whole number. */
export function groupCardNumber(cardNumber: string): string {
  return cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")
}

// --- Status -----------------------------------------------------------------

/**
 * `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal.
 * The empty array is the whole point: nothing comes back from cancelled.
 */
const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function allowedTransitions(from: CardStatus): readonly CardStatus[] {
  return TRANSITIONS[from]
}

/** Guarded on the server, not only in the UI. */
export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** The status the freeze control toggles to, or null when there is no toggle. */
export function freezeToggleTarget(status: CardStatus): CardStatus | null {
  if (status === "active") return "frozen"
  if (status === "frozen") return "active"
  return null
}

// --- Spend ------------------------------------------------------------------

/**
 * Spend as a share of the limit, clamped to 0–1 so a bar cannot overflow its
 * track. Integer minor units in, ratio out; no money is created here.
 */
export function spendRatio(spend: number, spendLimit: number): number {
  if (spendLimit <= 0) return 0
  return Math.min(1, Math.max(0, spend / spendLimit))
}

/** Past the warning threshold, where the bar turns amber. */
export function isSpendElevated(spend: number, spendLimit: number): boolean {
  return spendRatio(spend, spendLimit) > SPEND_WARNING_RATIO
}

// --- Validation -------------------------------------------------------------

/** The fields an issue request resolves to once it is trusted. */
export interface IssueCardFields {
  nickname: string
  merchantId: string
  /** Integer minor units. */
  spendLimit: number
  currency: Currency
  categoryLock: MerchantCategory | null
}

export interface FieldError {
  field: string
  message: string
}

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; error: FieldError }

function invalid(field: string, message: string): Validated<never> {
  return { ok: false, error: { field, message } }
}

/**
 * Resolve the spend limit a request is asking for, in integer minor units.
 *
 * The two forms are deliberately separate fields rather than one field that
 * changes meaning with its JSON type. `spendLimit: 250` and
 * `spendLimit: "250"` would otherwise differ by a factor of a hundred, and a
 * caller who meant $250.00 would silently get a $2.50 card — which is the
 * wrong-limit failure this ticket exists to remove.
 *
 * - `spendLimit` is a string in major units, what the form sends. It goes
 *   through `parseAmountToMinorUnits`, the codebase's one boundary parser.
 * - `spendLimitMinorUnits` is the canonical machine form: an integer count of
 *   minor units. `250.5` is not a limit, it is a float that lost an argument.
 */
function resolveSpendLimit(
  body: Record<string, unknown>,
): Validated<number> {
  const major = body.spendLimit
  const minor = body.spendLimitMinorUnits

  const hasMajor = major !== undefined && major !== null && major !== ""
  const hasMinor = minor !== undefined && minor !== null

  if (hasMajor && hasMinor) {
    return invalid(
      "spendLimit",
      "Send spendLimit or spendLimitMinorUnits, not both.",
    )
  }

  if (hasMinor) {
    if (typeof minor !== "number" || !Number.isInteger(minor)) {
      return invalid(
        "spendLimitMinorUnits",
        "spendLimitMinorUnits must be a whole number of minor units.",
      )
    }
    return { ok: true, value: minor }
  }

  if (typeof major !== "string") {
    return invalid("spendLimit", "Enter a limit like 250 or 250.00.")
  }

  const parsed = parseAmountToMinorUnits(major)
  if (parsed === null) {
    return invalid("spendLimit", "Enter a limit like 250 or 250.00.")
  }
  return { ok: true, value: parsed }
}

/**
 * Validate an issue request. Rejects early and returns the first problem, so
 * the form can point at one field with a message safe to show a user.
 *
 * Merchant IDs are passed in rather than read from the store, which is what
 * keeps this module pure and testable.
 */
export function validateIssueInput(
  raw: unknown,
  merchantIds: readonly string[],
): Validated<IssueCardFields> {
  if (typeof raw !== "object" || raw === null) {
    return invalid("body", "Expected a JSON object.")
  }
  const body = raw as Record<string, unknown>

  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim() : ""
  if (!nickname) {
    return invalid("nickname", "Give the card a nickname.")
  }
  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return invalid(
      "nickname",
      `Keep the nickname under ${MAX_NICKNAME_LENGTH} characters.`,
    )
  }

  const merchantId =
    typeof body.merchantId === "string" ? body.merchantId.trim() : ""
  if (!merchantId) {
    return invalid("merchantId", "Choose a merchant.")
  }
  if (!merchantIds.includes(merchantId)) {
    return invalid("merchantId", "That merchant does not exist.")
  }

  const currency = body.currency
  if (!CARD_CURRENCIES.includes(currency as Currency)) {
    return invalid(
      "currency",
      `Currency must be one of ${CARD_CURRENCIES.join(", ")}.`,
    )
  }

  const limit = resolveSpendLimit(body)
  if (!limit.ok) return limit
  const spendLimit = limit.value
  if (spendLimit <= 0) {
    return invalid("spendLimit", "The limit must be greater than zero.")
  }
  if (spendLimit > MAX_SPEND_LIMIT_MINOR_UNITS) {
    return invalid(
      "spendLimit",
      `The limit cannot exceed ${maxSpendLimitLabel(currency as Currency)}.`,
    )
  }

  let categoryLock: MerchantCategory | null = null
  if (body.categoryLock !== undefined && body.categoryLock !== null && body.categoryLock !== "") {
    if (!MERCHANT_CATEGORIES.includes(body.categoryLock as MerchantCategory)) {
      return invalid("categoryLock", "That category is not one we support.")
    }
    categoryLock = body.categoryLock as MerchantCategory
  }

  return {
    ok: true,
    value: {
      nickname,
      merchantId,
      spendLimit,
      currency: currency as Currency,
      categoryLock,
    },
  }
}

/** Validate a status change from the client before it reaches the store. */
export function validateStatusInput(raw: unknown): Validated<CardStatus> {
  if (typeof raw !== "object" || raw === null) {
    return invalid("body", "Expected a JSON object.")
  }
  const status = (raw as Record<string, unknown>).status
  if (!CARD_STATUSES.includes(status as CardStatus)) {
    return invalid("status", `Status must be one of ${CARD_STATUSES.join(", ")}.`)
  }
  return { ok: true, value: status as CardStatus }
}

/**
 * The shape a card is allowed to leave the server in.
 *
 * `Card` has no full-number field to begin with, so this is a belt-and-braces
 * alias rather than a filter: it exists so route signatures can say out loud
 * that a list or detail payload is not the creation response.
 */
export type CardPayload = Card

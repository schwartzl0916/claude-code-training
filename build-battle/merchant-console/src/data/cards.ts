import {
  CARD_STATUSES,
  IssueCardFields,
  canTransition,
  generateCardNumber,
  lastFour,
} from "@/lib/cards"
import { merchantById } from "./merchants"
import { store } from "./store"
import { Card, CardStatus } from "./types"

/**
 * Card reads and commands against the in-memory store.
 *
 * This is the only module where a full card number ever exists, and it exists
 * for the length of `issueCard`. It is returned beside the record rather than
 * on it, so the type system says out loud that the reveal is not part of a
 * `Card` and cannot be read back.
 *
 * Payment filtering has one query builder and this is not a second one — these
 * are card reads, a different entity, and nothing here touches payments.
 */

export interface CardFilters {
  status?: CardStatus | "all"
  search?: string
}

const FILTER_STATUSES: readonly (CardStatus | "all")[] = [
  "all",
  ...CARD_STATUSES,
]

/**
 * Narrowing that arrives from the client, checked against an allowlist before
 * it reaches a read. Shaped after `parseFilters` in `queries.ts` rather than
 * inventing a second convention for the same job.
 */
export function parseCardFilters(
  params: Record<string, string | undefined>,
): CardFilters {
  const status = params.status
  const search = params.search?.trim()
  return {
    status: FILTER_STATUSES.includes(status as CardStatus)
      ? (status as CardStatus)
      : "all",
    search: search || undefined,
  }
}

/**
 * The one card filter. Searches the things ops actually types: the nickname
 * they chose, the merchant, the last four off a statement line, and the id.
 */
function filterCards(filters: CardFilters): Card[] {
  const { status, search } = filters
  const needle = search?.toLowerCase()

  return store.cards.filter((card) => {
    if (status && status !== "all" && card.status !== status) return false

    if (needle) {
      const merchant = merchantById(card.merchantId)
      const haystack = [
        card.nickname,
        card.last4,
        card.id,
        merchant?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    return true
  })
}

/** Every issued card, unnarrowed. For counts and for the empty-state copy. */
export function countCards(): number {
  return store.cards.length
}

/**
 * Newest first, which is the order ops wants to see an issue log in.
 *
 * Two cards issued in the same millisecond tie on `createdAt`, so the id
 * breaks the tie: ids ascend with issue order, and without this the stable
 * sort would leave the newer of the pair below the older one.
 */
export function listCards(filters: CardFilters = {}): Card[] {
  return filterCards(filters).sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt)
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id)
  })
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

function nextCardId(): string {
  const highest = store.cards.reduce((max, card) => {
    const suffix = Number(card.id.slice("card_".length))
    return Number.isFinite(suffix) && suffix > max ? suffix : max
  }, 0)
  return `card_${String(highest + 1).padStart(4, "0")}`
}

/**
 * A handle for the generated number, for support to quote in a ticket.
 * Random, not derived from the number — a reversible reference would be the
 * stored PAN wearing a hat.
 */
function cardReference(): string {
  let reference = ""
  while (reference.length < 12) {
    reference += Math.floor(Math.random() * 16).toString(16)
  }
  return `cref_${reference}`
}

export interface IssuedCard {
  card: Card
  /**
   * The full number, for the creation response and nothing else. It is not
   * stored, not logged, and not readable from any other route.
   */
  fullNumber: string
}

/** Issue a card from already-validated fields. */
export function issueCard(fields: IssueCardFields): IssuedCard {
  const fullNumber = generateCardNumber()
  const now = new Date().toISOString()

  const card: Card = {
    id: nextCardId(),
    nickname: fields.nickname,
    merchantId: fields.merchantId,
    spendLimit: fields.spendLimit,
    spend: 0,
    currency: fields.currency,
    status: "active",
    last4: lastFour(fullNumber),
    reference: cardReference(),
    categoryLock: fields.categoryLock,
    createdAt: now,
    statusHistory: [{ from: null, to: "active", at: now }],
  }

  store.cards.push(card)
  return { card, fullNumber }
}

export type TransitionResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "illegal"; from: CardStatus; to: CardStatus }

/**
 * Move a card to a new status, refusing anything the state machine does not
 * allow. The guard is here, on the server, not only in the UI — a cancelled
 * card stays cancelled however the request arrives.
 */
export function transitionCard(id: string, to: CardStatus): TransitionResult {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found" }

  const from = card.status
  if (!canTransition(from, to)) return { ok: false, reason: "illegal", from, to }

  card.status = to
  card.statusHistory.push({ from, to, at: new Date().toISOString() })
  return { ok: true, card }
}

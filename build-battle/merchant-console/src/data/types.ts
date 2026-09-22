export type Currency = "USD" | "EUR" | "GBP"

export type PaymentStatus =
  | "authorized"
  | "captured"
  | "refunded"
  | "failed"
  | "disputed"

export type DisputeStatus = "needs_response" | "under_review" | "won" | "lost"

export type PayoutStatus = "paid" | "in_transit" | "pending"

export interface Merchant {
  id: string
  name: string
  country: string
  /** IANA timezone. Display converts to this; storage never does. */
  timezone: string
  currency: Currency
  riskTier: "low" | "standard" | "elevated"
}

export interface Payment {
  id: string
  merchantId: string
  /** Integer minor units. Never a float. */
  amount: number
  currency: Currency
  status: PaymentStatus
  method: "card" | "wallet" | "bank_transfer"
  cardBrand: "visa" | "mastercard" | "amex" | null
  last4: string | null
  /** ISO 8601, always UTC. */
  createdAt: string
  description: string
}

export interface Refund {
  id: string
  paymentId: string
  amount: number
  currency: Currency
  reason: "requested_by_customer" | "duplicate" | "fraudulent"
  createdAt: string
}

export interface Dispute {
  id: string
  paymentId: string
  merchantId: string
  amount: number
  currency: Currency
  reasonCode: string
  status: DisputeStatus
  openedAt: string
  /** Evidence deadline, UTC. */
  evidenceDueAt: string
}

export interface Payout {
  id: string
  merchantId: string
  periodStart: string
  periodEnd: string
  gross: number
  fees: number
  net: number
  currency: Currency
  status: PayoutStatus
  paymentIds: string[]
}

export interface PaymentFilters {
  status?: PaymentStatus | "all"
  merchantId?: string
  search?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
  sort?: "createdAt" | "amount"
  direction?: "asc" | "desc"
}

export type CardStatus = "active" | "frozen" | "cancelled"

/** The categories a card can be locked to at issue time. */
export type MerchantCategory =
  | "advertising"
  | "software"
  | "travel"
  | "office_supplies"
  | "contractors"
  | "utilities"

/**
 * One step in a card's status history. Exists so "what happened to this card
 * last Tuesday" has an answer that is not a guess.
 */
export interface CardStatusEvent {
  /** Null on the issuing event, which has nothing before it. */
  from: CardStatus | null
  to: CardStatus
  /** ISO 8601, always UTC. */
  at: string
}

/**
 * A virtual card.
 *
 * There is deliberately no field for the full number. It exists in exactly one
 * place — the creation response — and the type is what enforces that: a list or
 * detail payload structurally cannot carry a PAN.
 */
export interface Card {
  id: string
  nickname: string
  merchantId: string
  /** Integer minor units. Never a float. */
  spendLimit: number
  /** Integer minor units, in the same currency as the limit. */
  spend: number
  currency: Currency
  status: CardStatus
  /** Last four of the generated number. All that is ever stored of it. */
  last4: string
  /** Opaque handle for the generated number. Not the number, not derived from it. */
  reference: string
  /** Category the card is locked to. Null means no lock. */
  categoryLock: MerchantCategory | null
  /** ISO 8601, always UTC. */
  createdAt: string
  statusHistory: CardStatusEvent[]
}

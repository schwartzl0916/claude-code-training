import { generateCardNumber, lastFour } from "@/lib/cards"
import { Card } from "./types"

/**
 * Seed cards, so the list, the detail view, and the spend bar have something
 * to show before anyone clicks Issue.
 *
 * Fictional, like every other record in this app. The numbers are generated at
 * boot by the same generator issuing uses, and the full number is discarded on
 * the next line — a seeded PAN would be a stored PAN.
 *
 * Kept separate from `cards.ts` so the store can import the seed without the
 * store and the query module importing each other.
 */

interface CardSeed {
  nickname: string
  merchantId: string
  /** Integer minor units. */
  spendLimit: number
  /** Integer minor units, same currency as the limit. */
  spend: number
  currency: Card["currency"]
  status: Card["status"]
  categoryLock: Card["categoryLock"]
  /** ISO 8601, always UTC. */
  createdAt: string
  /** When the card left `active`, for the two that have. */
  changedAt?: string
}

const SEEDS: CardSeed[] = [
  {
    // Sits at 87% of its limit, which is what the amber threshold is for.
    nickname: "Ad spend — Lumen",
    merchantId: "mch_01",
    spendLimit: 250_000,
    spend: 217_500,
    currency: "USD",
    status: "active",
    categoryLock: "advertising",
    createdAt: "2026-08-14T09:12:00.000Z",
  },
  {
    nickname: "Design tooling",
    merchantId: "mch_04",
    spendLimit: 60_000,
    spend: 18_400,
    currency: "GBP",
    status: "active",
    categoryLock: "software",
    createdAt: "2026-08-28T14:41:00.000Z",
  },
  {
    nickname: "Contractor — Q3 build",
    merchantId: "mch_05",
    spendLimit: 500_000,
    spend: 122_000,
    currency: "EUR",
    status: "frozen",
    categoryLock: "contractors",
    createdAt: "2026-09-02T11:05:00.000Z",
    changedAt: "2026-09-15T16:20:00.000Z",
  },
  {
    // Terminal, and the list has to keep showing it as such.
    nickname: "Offsite travel",
    merchantId: "mch_02",
    spendLimit: 150_000,
    spend: 96_250,
    currency: "USD",
    status: "cancelled",
    categoryLock: "travel",
    createdAt: "2026-07-21T08:30:00.000Z",
    changedAt: "2026-09-09T10:00:00.000Z",
  },
]

/** Build the seed cards. Called once, from the store. */
export function seedCards(): Card[] {
  return SEEDS.map((seed, index) => {
    const fullNumber = generateCardNumber()
    return {
      id: `card_${String(index + 1).padStart(4, "0")}`,
      nickname: seed.nickname,
      merchantId: seed.merchantId,
      spendLimit: seed.spendLimit,
      spend: seed.spend,
      currency: seed.currency,
      status: seed.status,
      // The only part of the generated number that survives this function.
      last4: lastFour(fullNumber),
      reference: `cref_seed_${String(index + 1).padStart(4, "0")}`,
      categoryLock: seed.categoryLock,
      createdAt: seed.createdAt,
      statusHistory: [
        { from: null, to: "active" as const, at: seed.createdAt },
        ...(seed.status !== "active" && seed.changedAt
          ? [{ from: "active" as const, to: seed.status, at: seed.changedAt }]
          : []),
      ],
    }
  })
}

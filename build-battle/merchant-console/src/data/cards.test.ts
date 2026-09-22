import {
  IssueCardFields,
  TEST_BIN,
  isValidLuhn,
  lastFour,
} from "@/lib/cards"
import { describe, expect, it } from "vitest"
import {
  cardById,
  issueCard,
  listCards,
  parseCardFilters,
  transitionCard,
} from "./cards"

/**
 * The store-facing half of cards.
 *
 * `src/lib/cards.test.ts` proves the rules in isolation; this proves the two
 * commands actually apply them — that issuing keeps the PAN off the record,
 * and that the transition guard is enforced here rather than only in the UI.
 *
 * These run against the real in-memory store, so each case issues its own
 * card rather than reaching for a fixture id.
 */

const fields = (overrides: Partial<IssueCardFields> = {}): IssueCardFields => ({
  nickname: "Test card",
  merchantId: "mch_01",
  spendLimit: 25_000,
  currency: "USD",
  categoryLock: null,
  ...overrides,
})

describe("issueCard", () => {
  it("returns the full number beside the record, never on it", () => {
    const { card, fullNumber } = issueCard(fields())

    expect(fullNumber).toHaveLength(16)
    expect(fullNumber.startsWith(TEST_BIN)).toBe(true)
    expect(isValidLuhn(fullNumber)).toBe(true)

    // The reveal is not a field you can re-read. If any value on the record
    // ever equals the PAN, reveal-once is broken however the routes behave.
    expect(Object.values(card)).not.toContain(fullNumber)
    expect(JSON.stringify(card)).not.toContain(fullNumber)
  })

  it("stores only the last four", () => {
    const { card, fullNumber } = issueCard(fields())
    expect(card.last4).toBe(lastFour(fullNumber))
    expect(card.last4).toHaveLength(4)
  })

  it("gives the reference no relationship to the number", () => {
    const { card, fullNumber } = issueCard(fields())
    expect(card.reference.startsWith("cref_")).toBe(true)
    expect(card.reference).not.toContain(card.last4)
    expect(fullNumber).not.toContain(card.reference.slice("cref_".length))
  })

  it("opens active, unspent, and with one history entry", () => {
    const { card } = issueCard(fields({ spendLimit: 500_000 }))
    expect(card.status).toBe("active")
    expect(card.spend).toBe(0)
    expect(card.spendLimit).toBe(500_000)
    expect(Number.isInteger(card.spendLimit)).toBe(true)
    expect(card.statusHistory).toEqual([
      { from: null, to: "active", at: card.createdAt },
    ])
  })

  it("timestamps in UTC", () => {
    const { card } = issueCard(fields())
    expect(card.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  })

  it("puts the card in the list and makes it findable by id", () => {
    const before = listCards().length
    const { card } = issueCard(fields({ nickname: "Findable" }))

    expect(listCards()).toHaveLength(before + 1)
    expect(cardById(card.id)).toEqual(card)
    expect(listCards().map((c) => c.id)).toContain(card.id)
  })

  it("issues distinct ids", () => {
    const first = issueCard(fields()).card
    const second = issueCard(fields()).card
    expect(first.id).not.toBe(second.id)
  })

  it("keeps a category lock when one is chosen", () => {
    const { card } = issueCard(fields({ categoryLock: "advertising" }))
    expect(card.categoryLock).toBe("advertising")
  })
})

describe("transitionCard", () => {
  it("moves active to frozen and back, appending history each time", () => {
    const { card } = issueCard(fields())

    const frozen = transitionCard(card.id, "frozen")
    expect(frozen.ok).toBe(true)
    if (!frozen.ok) return
    expect(frozen.card.status).toBe("frozen")
    expect(frozen.card.statusHistory).toHaveLength(2)
    expect(frozen.card.statusHistory[1]).toMatchObject({
      from: "active",
      to: "frozen",
    })

    const thawed = transitionCard(card.id, "active")
    expect(thawed.ok && thawed.card.status).toBe("active")
    expect(thawed.ok && thawed.card.statusHistory).toHaveLength(3)
  })

  it("cancels from either side", () => {
    const fromActive = issueCard(fields()).card
    expect(transitionCard(fromActive.id, "cancelled").ok).toBe(true)

    const fromFrozen = issueCard(fields()).card
    transitionCard(fromFrozen.id, "frozen")
    expect(transitionCard(fromFrozen.id, "cancelled").ok).toBe(true)
  })

  it("refuses to bring a cancelled card back, whatever the caller asks for", () => {
    const { card } = issueCard(fields())
    transitionCard(card.id, "cancelled")

    for (const target of ["active", "frozen", "cancelled"] as const) {
      const result = transitionCard(card.id, target)
      expect(result.ok, `cancelled -> ${target}`).toBe(false)
      expect(!result.ok && result.reason).toBe("illegal")
    }

    // And the store still says cancelled afterwards.
    expect(cardById(card.id)?.status).toBe("cancelled")
  })

  it("leaves the record untouched when it refuses", () => {
    const { card } = issueCard(fields())
    transitionCard(card.id, "cancelled")
    const historyLength = cardById(card.id)!.statusHistory.length

    transitionCard(card.id, "active")
    expect(cardById(card.id)!.statusHistory).toHaveLength(historyLength)
  })

  it("refuses a no-op transition", () => {
    const { card } = issueCard(fields())
    const result = transitionCard(card.id, "active")
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe("illegal")
  })

  it("reports an unknown card rather than creating one", () => {
    const result = transitionCard("card_does_not_exist", "frozen")
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe("not_found")
    expect(cardById("card_does_not_exist")).toBeNull()
  })

  it("never exposes a full number on the transition result", () => {
    const { card, fullNumber } = issueCard(fields())
    const result = transitionCard(card.id, "frozen")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(JSON.stringify(result.card)).not.toContain(fullNumber)
  })
})

describe("parseCardFilters", () => {
  it("defaults to every status and no search", () => {
    expect(parseCardFilters({})).toEqual({ status: "all", search: undefined })
  })

  it("accepts the three statuses and the explicit all", () => {
    for (const status of ["all", "active", "frozen", "cancelled"]) {
      expect(parseCardFilters({ status }).status).toBe(status)
    }
  })

  it("falls back to all rather than passing an unknown status to the read", () => {
    // The allowlist is the point: nothing from the client reaches the filter
    // without being checked first.
    for (const status of ["deleted", "ACTIVE", "", "'; drop table --"]) {
      expect(parseCardFilters({ status }).status, status).toBe("all")
    }
  })

  it("trims a search and treats whitespace as absent", () => {
    expect(parseCardFilters({ search: "  ad spend  " }).search).toBe("ad spend")
    expect(parseCardFilters({ search: "   " }).search).toBeUndefined()
    expect(parseCardFilters({ search: "" }).search).toBeUndefined()
  })
})

describe("listCards filtering", () => {
  it("narrows by status", () => {
    const { card } = issueCard(fields({ nickname: "Filter probe" }))
    transitionCard(card.id, "frozen")

    const frozen = listCards({ status: "frozen" })
    expect(frozen.map((c) => c.id)).toContain(card.id)
    expect(frozen.every((c) => c.status === "frozen")).toBe(true)
    expect(listCards({ status: "active" }).map((c) => c.id)).not.toContain(
      card.id,
    )
  })

  it("searches the nickname, the last four, and the id", () => {
    const { card } = issueCard(fields({ nickname: "Unmistakable nickname" }))
    expect(
      listCards({ search: "unmistakable" }).map((c) => c.id),
    ).toContain(card.id)
    expect(listCards({ search: card.last4 }).map((c) => c.id)).toContain(
      card.id,
    )
    expect(listCards({ search: card.id }).map((c) => c.id)).toContain(card.id)
  })

  it("returns nothing for a search that matches nothing, so the empty state is reachable", () => {
    expect(listCards({ search: "zzz-no-such-card-zzz" })).toEqual([])
  })

  it("does not mutate the stored order while sorting", () => {
    const before = listCards().map((c) => c.id)
    listCards({ status: "active" })
    expect(listCards().map((c) => c.id)).toEqual(before)
  })

  it("puts the newer of two cards issued in the same millisecond first", () => {
    const first = issueCard(fields({ nickname: "Tie A" })).card
    const second = issueCard(fields({ nickname: "Tie B" })).card
    // Same-millisecond issuance is what a double submit looks like.
    second.createdAt = first.createdAt

    const ids = listCards().map((c) => c.id)
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id))
  })
})

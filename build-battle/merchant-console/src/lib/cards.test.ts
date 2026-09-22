import { describe, expect, it } from "vitest"
import {
  CARD_NUMBER_LENGTH,
  MAX_SPEND_LIMIT_MINOR_UNITS,
  TEST_BIN,
  allowedTransitions,
  canTransition,
  freezeToggleTarget,
  generateCardNumber,
  groupCardNumber,
  isSpendElevated,
  isValidLuhn,
  lastFour,
  luhnCheckDigit,
  maskCardNumber,
  maxSpendLimitLabel,
  spendRatio,
  validateIssueInput,
  validateStatusInput,
} from "./cards"

const MERCHANT_IDS = ["mch_01", "mch_04"]

/** A valid issue body, so each case can change exactly one thing. */
const validBody = (overrides: Record<string, unknown> = {}) => ({
  nickname: "Ad spend — Q3",
  merchantId: "mch_01",
  spendLimit: "250.00",
  currency: "USD",
  ...overrides,
})

describe("generateCardNumber", () => {
  it("produces 16 digits on the 4242 test BIN with a valid Luhn check digit", () => {
    const number = generateCardNumber()
    expect(number).toHaveLength(CARD_NUMBER_LENGTH)
    expect(number.startsWith(TEST_BIN)).toBe(true)
    expect(number).toMatch(/^\d{16}$/)
    expect(isValidLuhn(number)).toBe(true)
  })

  it("holds over a thousand numbers", () => {
    // The check digit is derived, so a generator that is wrong is wrong
    // intermittently. One number passing proves very little.
    for (let i = 0; i < 1000; i++) {
      const number = generateCardNumber()
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(number).toHaveLength(CARD_NUMBER_LENGTH)
      expect(isValidLuhn(number)).toBe(true)
    }
  })

  it("is deterministic when the digit source is", () => {
    const allZeros = generateCardNumber(() => 0)
    expect(allZeros).toBe("4242000000000000")
    expect(isValidLuhn(allZeros)).toBe(true)

    const allNines = generateCardNumber(() => 9)
    expect(allNines.startsWith("4242")).toBe(true)
    expect(isValidLuhn(allNines)).toBe(true)
  })

  it("never emits a number that is not on the test BIN", () => {
    // A digit source that misbehaves must not be able to move the BIN.
    const number = generateCardNumber(() => 42)
    expect(number.startsWith(TEST_BIN)).toBe(true)
    expect(number).toMatch(/^\d{16}$/)
    expect(isValidLuhn(number)).toBe(true)
  })
})

describe("isValidLuhn", () => {
  it("accepts known-good test numbers", () => {
    expect(isValidLuhn("4242424242424242")).toBe(true)
    expect(isValidLuhn("79927398713")).toBe(true)
  })

  it("rejects a number with a wrong check digit", () => {
    expect(isValidLuhn("4242424242424243")).toBe(false)
    expect(isValidLuhn("79927398714")).toBe(false)
  })

  it("rejects anything that is not all digits", () => {
    expect(isValidLuhn("4242-4242-4242-4242")).toBe(false)
    expect(isValidLuhn("")).toBe(false)
    expect(isValidLuhn("424242424242424x")).toBe(false)
  })
})

describe("luhnCheckDigit", () => {
  it("completes a payload into a valid number", () => {
    const payload = "424242424242424"
    const digit = luhnCheckDigit(payload)
    expect(digit).toBe(2)
    expect(isValidLuhn(payload + digit)).toBe(true)
  })

  it("returns a single digit for every payload it is given", () => {
    for (let i = 0; i < 200; i++) {
      let payload = TEST_BIN
      while (payload.length < CARD_NUMBER_LENGTH - 1) {
        payload += String(Math.floor(Math.random() * 10))
      }
      const digit = luhnCheckDigit(payload)
      expect(digit).toBeGreaterThanOrEqual(0)
      expect(digit).toBeLessThanOrEqual(9)
    }
  })
})

describe("masking", () => {
  it("keeps only the last four of a generated number", () => {
    expect(lastFour("4242000000001234")).toBe("1234")
  })

  it("renders the mask from the stored last four", () => {
    expect(maskCardNumber("1234")).toBe("•••• 1234")
    expect(maskCardNumber("4242")).toBe("•••• 4242")
  })
})

describe("groupCardNumber", () => {
  it("groups a generated number into fours for the one-time reveal", () => {
    expect(groupCardNumber("4242000000001234")).toBe("4242 0000 0000 1234")
  })

  it("leaves a trailing group of four ungrouped, with no trailing space", () => {
    expect(groupCardNumber("42420000")).toBe("4242 0000")
    expect(groupCardNumber("4242")).toBe("4242")
  })
})

describe("maxSpendLimitLabel", () => {
  it("states the ceiling in the currency being issued", () => {
    // The form hint and the rejection message both read from here, so they
    // cannot drift apart or disagree about units.
    expect(maxSpendLimitLabel("USD")).toBe("$50,000.00")
    expect(maxSpendLimitLabel("EUR")).toBe("€50,000.00")
    expect(maxSpendLimitLabel("GBP")).toBe("£50,000.00")
  })

  it("is derived from the constant the validator enforces", () => {
    const rejected = validateIssueInput(
      validBody({ spendLimit: MAX_SPEND_LIMIT_MINOR_UNITS + 1 }),
      MERCHANT_IDS,
    )
    expect(rejected.ok).toBe(false)
    expect(!rejected.ok && rejected.error.message).toContain(
      maxSpendLimitLabel("USD"),
    )
  })
})

describe("status transitions", () => {
  it("moves active ⇄ frozen", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("lets either side cancel", () => {
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
    expect(allowedTransitions("cancelled")).toEqual([])
  })

  it("rejects a transition to the status a card is already in", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })

  it("toggles freeze only where there is something to toggle", () => {
    expect(freezeToggleTarget("active")).toBe("frozen")
    expect(freezeToggleTarget("frozen")).toBe("active")
    expect(freezeToggleTarget("cancelled")).toBeNull()
  })
})

describe("spend against the limit", () => {
  it("is a ratio of integer minor units", () => {
    expect(spendRatio(12_500, 25_000)).toBe(0.5)
    expect(spendRatio(0, 25_000)).toBe(0)
  })

  it("clamps rather than overflowing its track", () => {
    expect(spendRatio(30_000, 25_000)).toBe(1)
    expect(spendRatio(-100, 25_000)).toBe(0)
  })

  it("does not divide by a zero limit", () => {
    expect(spendRatio(100, 0)).toBe(0)
  })

  it("turns elevated past 80 percent and not at it", () => {
    expect(isSpendElevated(20_000, 25_000)).toBe(false)
    expect(isSpendElevated(20_001, 25_000)).toBe(true)
    expect(isSpendElevated(24_000, 25_000)).toBe(true)
  })
})

describe("validateIssueInput", () => {
  it("accepts a good request and converts the limit to minor units", () => {
    const result = validateIssueInput(validBody(), MERCHANT_IDS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.spendLimit).toBe(25_000)
    expect(Number.isInteger(result.value.spendLimit)).toBe(true)
    expect(result.value.currency).toBe("USD")
    expect(result.value.categoryLock).toBeNull()
  })

  it("trims the nickname", () => {
    const result = validateIssueInput(
      validBody({ nickname: "  Contractor tools  " }),
      MERCHANT_IDS,
    )
    expect(result.ok && result.value.nickname).toBe("Contractor tools")
  })

  it("rejects a missing merchant", () => {
    const missing = validateIssueInput(
      validBody({ merchantId: "" }),
      MERCHANT_IDS,
    )
    expect(missing.ok).toBe(false)
    expect(!missing.ok && missing.error.field).toBe("merchantId")

    const unknown = validateIssueInput(
      validBody({ merchantId: "mch_99" }),
      MERCHANT_IDS,
    )
    expect(unknown.ok).toBe(false)
    expect(!unknown.ok && unknown.error.field).toBe("merchantId")
  })

  it("rejects a missing nickname", () => {
    const result = validateIssueInput(
      validBody({ nickname: "   " }),
      MERCHANT_IDS,
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.field).toBe("nickname")
  })

  it("rejects a zero or negative limit", () => {
    for (const spendLimit of ["0", "0.00", 0, -1, -25_000]) {
      const result = validateIssueInput(validBody({ spendLimit }), MERCHANT_IDS)
      expect(result.ok, `spendLimit ${spendLimit}`).toBe(false)
      expect(!result.ok && result.error.field).toBe("spendLimit")
    }
  })

  it("rejects a limit above 5,000,000 minor units but accepts the ceiling", () => {
    const over = validateIssueInput(
      validBody({ spendLimit: MAX_SPEND_LIMIT_MINOR_UNITS + 1 }),
      MERCHANT_IDS,
    )
    expect(over.ok).toBe(false)
    expect(!over.ok && over.error.field).toBe("spendLimit")

    const at = validateIssueInput(
      validBody({ spendLimit: MAX_SPEND_LIMIT_MINOR_UNITS }),
      MERCHANT_IDS,
    )
    expect(at.ok).toBe(true)
  })

  it("rejects a limit that is not an integer count of minor units", () => {
    const result = validateIssueInput(
      validBody({ spendLimit: 250.5 }),
      MERCHANT_IDS,
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.field).toBe("spendLimit")
  })

  it("rejects a limit dressed up as money", () => {
    for (const spendLimit of ["$250.00", "250.000", "abc", "", "1e5"]) {
      const result = validateIssueInput(validBody({ spendLimit }), MERCHANT_IDS)
      expect(result.ok, `spendLimit ${spendLimit}`).toBe(false)
    }
  })

  it("rejects any currency outside USD, EUR, GBP", () => {
    for (const currency of ["JPY", "usd", "", null, 840]) {
      const result = validateIssueInput(validBody({ currency }), MERCHANT_IDS)
      expect(result.ok, `currency ${currency}`).toBe(false)
      expect(!result.ok && result.error.field).toBe("currency")
    }
  })

  it("accepts each allowed currency", () => {
    for (const currency of ["USD", "EUR", "GBP"]) {
      const result = validateIssueInput(validBody({ currency }), MERCHANT_IDS)
      expect(result.ok, `currency ${currency}`).toBe(true)
    }
  })

  it("accepts a known category lock and rejects an invented one", () => {
    const good = validateIssueInput(
      validBody({ categoryLock: "advertising" }),
      MERCHANT_IDS,
    )
    expect(good.ok && good.value.categoryLock).toBe("advertising")

    const empty = validateIssueInput(
      validBody({ categoryLock: "" }),
      MERCHANT_IDS,
    )
    expect(empty.ok && empty.value.categoryLock).toBeNull()

    const bad = validateIssueInput(
      validBody({ categoryLock: "crypto" }),
      MERCHANT_IDS,
    )
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.error.field).toBe("categoryLock")
  })

  it("rejects a body that is not an object", () => {
    for (const body of [null, undefined, "nickname=x", 7, []]) {
      // An array is an object, so it falls through to the nickname check —
      // either way it must not validate.
      expect(validateIssueInput(body, MERCHANT_IDS).ok).toBe(false)
    }
  })
})

describe("validateStatusInput", () => {
  it("accepts the three statuses", () => {
    for (const status of ["active", "frozen", "cancelled"]) {
      expect(validateStatusInput({ status }).ok).toBe(true)
    }
  })

  it("rejects anything else", () => {
    for (const status of ["deleted", "", null, 1, undefined]) {
      const result = validateStatusInput({ status })
      expect(result.ok, `status ${status}`).toBe(false)
      expect(!result.ok && result.error.field).toBe("status")
    }
    expect(validateStatusInput(null).ok).toBe(false)
  })
})

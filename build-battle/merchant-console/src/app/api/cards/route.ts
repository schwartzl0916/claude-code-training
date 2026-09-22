import { issueCard, listCards } from "@/data/cards"
import { merchants } from "@/data/merchants"
import { validateIssueInput } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/** The merchant allowlist. Checked before anything reaches the store. */
const MERCHANT_IDS = merchants.map((merchant) => merchant.id)

/**
 * Every issued card. No full numbers here — `Card` has no field for one, so a
 * list payload structurally cannot leak a PAN.
 */
export function GET() {
  return NextResponse.json({ cards: listCards() })
}

/**
 * Issue a card.
 *
 * This is the one response in the application that contains a full card
 * number. Nothing stores it and no other route can return it.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Expected a JSON body." },
      { status: 400 },
    )
  }

  // The client's checks are a convenience; this is the enforcement.
  const validated = validateIssueInput(body, MERCHANT_IDS)
  if (!validated.ok) {
    return NextResponse.json(
      { message: validated.error.message, field: validated.error.field },
      { status: 400 },
    )
  }

  const { card, fullNumber } = issueCard(validated.value)
  return NextResponse.json({ card, fullNumber }, { status: 201 })
}

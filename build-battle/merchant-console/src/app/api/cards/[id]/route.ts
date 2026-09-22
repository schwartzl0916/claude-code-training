import { cardById, transitionCard } from "@/data/cards"
import { validateStatusInput } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

type Context = { params: Promise<{ id: string }> }

/** One card. Masked, like everywhere that is not the creation response. */
export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const card = cardById(id)
  if (!card) {
    return NextResponse.json({ message: "No card with that id." }, { status: 404 })
  }
  return NextResponse.json({ card })
}

/**
 * Change a card's status.
 *
 * The state machine is enforced here rather than in the UI, so `cancelled`
 * stays terminal whether the request comes from the console or from curl.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Expected a JSON body." },
      { status: 400 },
    )
  }

  const validated = validateStatusInput(body)
  if (!validated.ok) {
    return NextResponse.json(
      { message: validated.error.message, field: validated.error.field },
      { status: 400 },
    )
  }

  const result = transitionCard(id, validated.value)
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { message: "No card with that id." },
        { status: 404 },
      )
    }
    return NextResponse.json(
      {
        message: `A ${result.from} card cannot become ${result.to}.`,
        field: "status",
      },
      { status: 409 },
    )
  }

  return NextResponse.json({ card: result.card })
}

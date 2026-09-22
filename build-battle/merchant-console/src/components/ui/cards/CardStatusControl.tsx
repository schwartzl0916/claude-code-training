"use client"

import { Button } from "@/components/Button"
import { CardStatus } from "@/data/types"
import { freezeToggleTarget } from "@/lib/cards"
import { useRouter } from "next/navigation"
import * as React from "react"

/**
 * Freeze and unfreeze without a page reload.
 *
 * The status flips from the route's own response so the control cannot get
 * ahead of the server, then `router.refresh()` re-renders the server component
 * around it. The state machine is still enforced in the route; this is the
 * convenience layer, and a 409 from it is shown rather than swallowed.
 */
export function CardStatusControl({
  cardId,
  status,
  nickname,
  allowCancel = false,
}: {
  cardId: string
  status: CardStatus
  /** Names the card in the control's label: ten rows of "Freeze" name nothing. */
  nickname: string
  /** Cancelling is irreversible, so it is opt-in and two-step. */
  allowCancel?: boolean
}) {
  const router = useRouter()
  const [current, setCurrent] = React.useState<CardStatus>(status)
  const [pending, setPending] = React.useState<CardStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = React.useState(false)

  /**
   * Set only when this control drove the card into its terminal state. The
   * button holding focus unmounts on that transition, so the replacement has
   * to take focus or it falls to the document — and the live region is scoped
   * to the same flag, so statically rendered cancelled rows are not announced.
   */
  const [justCancelled, setJustCancelled] = React.useState(false)
  const terminalRef = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    if (justCancelled) terminalRef.current?.focus()
  }, [justCancelled])

  // A server refresh is the authority; follow it if it disagrees.
  React.useEffect(() => {
    setCurrent(status)
  }, [status])

  const move = async (to: CardStatus) => {
    setPending(to)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body.message ?? "Could not change the card's status.")
        return
      }
      setCurrent(body.card.status)
      setConfirmingCancel(false)
      if (body.card.status === "cancelled") setJustCancelled(true)
      router.refresh()
    } catch {
      setError("Could not reach the server. The card is unchanged.")
    } finally {
      setPending(null)
    }
  }

  const freezeTarget = freezeToggleTarget(current)

  if (!freezeTarget) {
    return (
      <span
        ref={terminalRef}
        tabIndex={-1}
        role={justCancelled ? "status" : undefined}
        className="text-sm text-gray-500 outline-none"
      >
        Cancelled — no further changes
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="py-1"
          onClick={() => move(freezeTarget)}
          isLoading={pending === freezeTarget}
          aria-label={`${
            freezeTarget === "frozen" ? "Freeze" : "Unfreeze"
          } ${nickname}`}
        >
          {freezeTarget === "frozen" ? "Freeze" : "Unfreeze"}
        </Button>

        {allowCancel &&
          (confirmingCancel ? (
            <>
              <Button
                variant="destructive"
                className="py-1"
                onClick={() => move("cancelled")}
                isLoading={pending === "cancelled"}
                aria-label={`Confirm cancelling ${nickname}`}
              >
                Confirm cancel
              </Button>
              <Button
                variant="ghost"
                className="py-1"
                onClick={() => setConfirmingCancel(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="py-1"
              onClick={() => setConfirmingCancel(true)}
              aria-label={`Cancel ${nickname}`}
            >
              Cancel card
            </Button>
          ))}
      </div>

      {confirmingCancel && !error && (
        <p className="text-xs text-gray-500">
          Cancelling is permanent. The card cannot be reactivated.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}

import { Divider } from "@/components/Divider"
import { CardStatusControl } from "@/components/ui/cards/CardStatusControl"
import { SpendProgress } from "@/components/ui/cards/SpendProgress"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { cardById } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { CardStatus } from "@/data/types"
import { CATEGORY_LABELS, maskCardNumber } from "@/lib/cards"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import Link from "next/link"
import { notFound } from "next/navigation"

/** In-memory store, and freezing a card has to show on the next render. */
export const dynamic = "force-dynamic"

const STATUS_VERBS: Record<CardStatus, string> = {
  active: "Activated",
  frozen: "Frozen",
  cancelled: "Cancelled",
}

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)!

  // Oldest first, so the card's life reads top to bottom.
  const history = [...card.statusHistory].sort((a, b) =>
    a.at.localeCompare(b.at),
  )

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
              {card.nickname}
            </h1>
            <StatusBadge status={card.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-gray-500">
            {maskCardNumber(card.last4)} · {card.id}
          </p>
        </div>
        <CardStatusControl
          cardId={card.id}
          status={card.status}
          nickname={card.nickname}
          allowCancel
        />
      </div>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Spend against limit
      </h2>
      <div className="mt-4 max-w-xl">
        <SpendProgress
          spend={card.spend}
          spendLimit={card.spendLimit}
          currency={card.currency}
        />
      </div>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Merchant">
          {merchant.name}
          <span className="ml-2 text-gray-500">{merchant.country}</span>
        </Field>
        <Field label="Spend limit">
          <span className="tabular-nums">
            {formatMoney(card.spendLimit, card.currency)}
          </span>
          <span className="ml-2 text-gray-500">{card.currency}</span>
        </Field>
        <Field label="Spent">
          <span className="tabular-nums">
            {formatMoney(card.spend, card.currency)}
          </span>
        </Field>
        <Field label="Card number">
          <span className="font-mono">{maskCardNumber(card.last4)}</span>
          <span className="ml-2 text-gray-500">shown once, at issue</span>
        </Field>
        <Field label="Reference">
          <span className="font-mono text-sm">{card.reference}</span>
        </Field>
        <Field label="Category lock">
          {card.categoryLock ? (
            CATEGORY_LABELS[card.categoryLock]
          ) : (
            <span className="text-gray-500">No lock</span>
          )}
        </Field>
        <Field label="Created (UTC)">
          <span className="font-mono text-sm">{card.createdAt}</span>
        </Field>
        <Field label={`Created (${merchant.timezone})`}>
          {formatInZone(card.createdAt, merchant.timezone)}
        </Field>
        <Field label="Type">
          Virtual · single merchant
        </Field>
      </dl>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Status history
      </h2>
      <ol className="mt-4 space-y-4">
        {history.map((entry, index) => (
          <li key={index} className="flex gap-3">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-gray-300 dark:bg-gray-700"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                {entry.from === null
                  ? "Card issued"
                  : `${STATUS_VERBS[entry.to]} from ${entry.from}`}
              </p>
              <p className="text-sm text-gray-500">
                {formatInZone(entry.at, merchant.timezone)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">
        {children}
      </dd>
    </div>
  )
}

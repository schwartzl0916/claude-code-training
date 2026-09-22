import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { CardStatusControl } from "@/components/ui/cards/CardStatusControl"
import { IssueCardDialog } from "@/components/ui/cards/IssueCardDialog"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { listCards } from "@/data/cards"
import { merchantById, merchants } from "@/data/merchants"
import { CATEGORY_LABELS, maskCardNumber } from "@/lib/cards"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import Link from "next/link"

/**
 * The store is in memory and changes while the server runs, so this page is
 * never prerendered — a cached card list would go stale the first time
 * anyone issued one.
 */
export const dynamic = "force-dynamic"

export default function CardsPage() {
  const cards = listCards()
  const options = merchants.map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
    currency: merchant.currency,
  }))

  return (
    <section aria-label="Virtual cards">
      <div className="flex flex-col justify-between gap-3 px-4 py-6 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Virtual cards
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {cards.length === 0
              ? "No cards issued yet."
              : `${cards.length.toLocaleString()} issued · single merchant, always virtual`}
          </p>
        </div>
        <IssueCardDialog merchants={options} />
      </div>

      <TableRoot className="border-t border-gray-200 dark:border-gray-800">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Nickname</TableHeaderCell>
              <TableHeaderCell>Merchant</TableHeaderCell>
              <TableHeaderCell>Card</TableHeaderCell>
              <TableHeaderCell className="text-right">
                Spend limit
              </TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Created</TableHeaderCell>
              <TableHeaderCell className="text-right">
                <span className="sr-only">Actions</span>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cards.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <p className="font-medium text-gray-900 dark:text-gray-50">
                    No cards issued yet
                  </p>
                  <p className="mt-1 text-gray-500">
                    Issue one and it appears here with its limit and status. Ops
                    no longer has to ask the platform team.
                  </p>
                </TableCell>
              </TableRow>
            )}
            {cards.map((card) => {
              const merchant = merchantById(card.merchantId)
              return (
                <TableRow key={card.id}>
                  <TableCell>
                    <Link
                      href={`/cards/${card.id}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-500"
                    >
                      {card.nickname}
                    </Link>
                    {card.categoryLock && (
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {CATEGORY_LABELS[card.categoryLock]} only
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{merchant?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {maskCardNumber(card.last4)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-gray-900 dark:text-gray-50">
                    {formatMoney(card.spendLimit, card.currency)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={card.status} />
                  </TableCell>
                  <TableCell>{formatDate(card.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <CardStatusControl cardId={card.id} status={card.status} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableRoot>
    </section>
  )
}

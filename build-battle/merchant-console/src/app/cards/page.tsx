import { inputStyles } from "@/components/Input"
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
import { countCards, listCards, parseCardFilters } from "@/data/cards"
import { merchantById, merchants } from "@/data/merchants"
import { CardStatus } from "@/data/types"
import { CARD_STATUSES, CATEGORY_LABELS, maskCardNumber } from "@/lib/cards"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx, focusRing } from "@/lib/utils"
import Link from "next/link"

/**
 * The store is in memory and changes while the server runs, so this page is
 * never prerendered — a cached card list would go stale the first time
 * anyone issued one.
 */
export const dynamic = "force-dynamic"

const TABS: (CardStatus | "all")[] = ["all", ...CARD_STATUSES]

const TAB_LABELS: Record<CardStatus | "all", string> = {
  all: "All",
  active: "Active",
  frozen: "Frozen",
  cancelled: "Cancelled",
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  // Narrowing from the client goes through the allowlist, never straight to a read.
  const filters = parseCardFilters(params)

  const cards = listCards(filters)
  const total = countCards()

  const options = merchants.map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
    currency: merchant.currency,
  }))

  const tabHref = (status: CardStatus | "all") => {
    const query = new URLSearchParams()
    if (status !== "all") query.set("status", status)
    if (filters.search) query.set("search", filters.search)
    const suffix = query.toString()
    return suffix ? `/cards?${suffix}` : "/cards"
  }

  const narrowed = filters.status !== "all" || Boolean(filters.search)

  return (
    <section aria-label="Virtual cards">
      <div className="flex flex-col justify-between gap-3 px-4 py-6 sm:flex-row sm:items-start sm:p-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Virtual cards
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {total === 0
              ? "No cards issued yet."
              : narrowed
                ? `${cards.length.toLocaleString()} of ${total.toLocaleString()} cards`
                : `${total.toLocaleString()} issued · single merchant, always virtual`}
          </p>
        </div>
        <IssueCardDialog merchants={options} />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
          {TABS.map((status) => {
            const current = filters.status === status
            return (
              <Link
                key={status}
                href={tabHref(status)}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium transition",
                  focusRing,
                  current
                    ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-50",
                )}
              >
                {TAB_LABELS[status]}
              </Link>
            )
          })}
        </nav>

        {/*
          A plain GET form: no client JavaScript, and the resulting URL is
          shareable, which is what ops does with a filtered view.
        */}
        <form method="get" action="/cards" className="flex items-center gap-2">
          {filters.status !== "all" && (
            <input type="hidden" name="status" value={filters.status} />
          )}
          <label htmlFor="card-search" className="sr-only">
            Search cards by nickname, merchant, or last four
          </label>
          <input
            id="card-search"
            type="search"
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Nickname, merchant, last four"
            className={cx(inputStyles(), "sm:w-64")}
          />
          <button
            type="submit"
            className={cx(
              "rounded-md border border-gray-300 px-2.5 py-2 text-sm font-medium text-gray-900 transition",
              "hover:bg-gray-50 dark:border-gray-800 dark:text-gray-50 dark:hover:bg-gray-900",
              focusRing,
            )}
          >
            Search
          </button>
        </form>
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
                  {total === 0 ? (
                    <>
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        No cards issued yet
                      </p>
                      <p className="mt-1 text-gray-500">
                        Issue one and it appears here with its limit and status.
                        Ops no longer has to ask the platform team.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        No cards match these filters
                      </p>
                      <p className="mt-1 text-gray-500">
                        Clear the search or pick a different status.{" "}
                        <Link
                          href="/cards"
                          className="text-blue-600 hover:underline dark:text-blue-500"
                        >
                          Show all {total.toLocaleString()} cards
                        </Link>
                        .
                      </p>
                    </>
                  )}
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
                    <CardStatusControl
                      cardId={card.id}
                      status={card.status}
                      nickname={card.nickname}
                    />
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

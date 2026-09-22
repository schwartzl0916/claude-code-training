import { Currency } from "@/data/types"
import { SPEND_WARNING_RATIO, isSpendElevated, spendRatio } from "@/lib/cards"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"

/**
 * Spend against the limit.
 *
 * Widths come from this static map rather than an inline `style`, because
 * `.claude/rules/components.md` is Tailwind-only and an interpolated
 * `w-[${n}%]` is a class Tailwind never sees and never compiles. The bar is
 * therefore drawn to the nearest 5%; the exact figure is in the text beside it.
 */
const BAR_WIDTHS = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
] as const

export function SpendProgress({
  spend,
  spendLimit,
  currency,
}: {
  /** Integer minor units. */
  spend: number
  /** Integer minor units. */
  spendLimit: number
  currency: Currency
}) {
  const ratio = spendRatio(spend, spendLimit)
  const percent = Math.round(ratio * 100)
  const elevated = isSpendElevated(spend, spendLimit)
  const remaining = Math.max(0, spendLimit - spend)

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-900 dark:text-gray-50">
          <span className="font-semibold tabular-nums">
            {formatMoney(spend, currency)}
          </span>
          <span className="text-gray-500"> of </span>
          <span className="font-medium tabular-nums">
            {formatMoney(spendLimit, currency)}
          </span>
        </p>
        <p
          className={cx(
            "text-sm font-medium tabular-nums",
            elevated
              ? "text-amber-700 dark:text-amber-500"
              : "text-gray-500 dark:text-gray-500",
          )}
        >
          {percent}% used
        </p>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${formatMoney(spend, currency)} of ${formatMoney(
          spendLimit,
          currency,
        )} spent, ${percent}% of the limit`}
        aria-label="Spend against limit"
      >
        <div
          className={cx(
            "h-full rounded-full transition-all",
            BAR_WIDTHS[Math.round(percent / 5)],
            elevated
              ? "bg-amber-500 dark:bg-amber-500"
              : "bg-blue-500 dark:bg-blue-500",
          )}
        />
      </div>

      <p className="mt-2 text-sm text-gray-500">
        {formatMoney(remaining, currency)} remaining
        {elevated && (
          <span className="text-amber-700 dark:text-amber-500">
            {" "}
            · past {Math.round(SPEND_WARNING_RATIO * 100)}% of the limit
          </span>
        )}
      </p>
    </div>
  )
}

"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Card, Currency } from "@/data/types"
import {
  CARD_CURRENCIES,
  CATEGORY_LABELS,
  MERCHANT_CATEGORIES,
  maskCardNumber,
} from "@/lib/cards"
import { formatMoney } from "@/lib/money"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"

type MerchantOption = { id: string; name: string; currency: Currency }

/** Groups of four, for the one screen that shows the whole number. */
function groupDigits(cardNumber: string): string {
  return cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")
}

const labelStyles =
  "text-sm font-medium text-gray-900 dark:text-gray-50"

export function IssueCardDialog({
  merchants,
}: {
  merchants: MerchantOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const [nickname, setNickname] = React.useState("")
  const [merchantId, setMerchantId] = React.useState("")
  const [spendLimit, setSpendLimit] = React.useState("")
  const [currency, setCurrency] = React.useState<Currency>("USD")
  const [categoryLock, setCategoryLock] = React.useState<string>("")

  const [error, setError] = React.useState<{
    field?: string
    message: string
  } | null>(null)

  /**
   * The one-time reveal. Held here only while the success screen is open and
   * dropped on close — the rule is that it is not left in client state.
   */
  const [issued, setIssued] = React.useState<{
    card: Card
    fullNumber: string
  } | null>(null)

  const reset = () => {
    setNickname("")
    setMerchantId("")
    setSpendLimit("")
    setCurrency("USD")
    setCategoryLock("")
    setError(null)
    setIssued(null)
    setSubmitting(false)
  }

  const close = () => {
    setOpen(false)
    // Drop the number before the drawer's close animation finishes.
    reset()
    router.refresh()
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      reset()
      router.refresh()
    }
  }

  /** Picking a merchant proposes its own currency; ops can still override it. */
  const onMerchantChange = (id: string) => {
    setMerchantId(id)
    const merchant = merchants.find((candidate) => candidate.id === id)
    if (merchant) setCurrency(merchant.currency)
    if (error?.field === "merchantId") setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      // The limit crosses as the string that was typed. The server converts it
      // to minor units once, at the boundary; nothing here does money math.
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          merchantId,
          spendLimit,
          currency,
          categoryLock,
        }),
      })
      const body = await response.json()

      if (!response.ok) {
        setError({
          field: body.field,
          message: body.message ?? "Could not issue the card.",
        })
        return
      }

      setIssued({ card: body.card, fullNumber: body.fullNumber })
      router.refresh()
    } catch {
      setError({
        message: "Could not reach the server. Nothing was issued — try again.",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const fieldError = (field: string) =>
    error?.field === field ? error.message : undefined

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DrawerTrigger>

      <DrawerContent className="sm:max-w-md">
        {issued ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription>
                This is the only time the full number is shown. Copy it now.
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="flex flex-col gap-6 overflow-y-auto">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Card number
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                  {groupDigits(issued.fullNumber)}
                </p>
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-500">
                  Once you close this, the console shows{" "}
                  {maskCardNumber(issued.card.last4)} and nothing else.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Nickname</dt>
                  <dd className="text-gray-900 dark:text-gray-50">
                    {issued.card.nickname}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Spend limit</dt>
                  <dd className="tabular-nums text-gray-900 dark:text-gray-50">
                    {formatMoney(issued.card.spendLimit, issued.card.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Reference</dt>
                  <dd className="font-mono text-xs text-gray-900 dark:text-gray-50">
                    {issued.card.reference}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Card</dt>
                  <dd className="font-mono text-gray-900 dark:text-gray-50">
                    {issued.card.id}
                  </dd>
                </div>
              </dl>
            </DrawerBody>

            <DrawerFooter>
              <Button onClick={close}>Done</Button>
            </DrawerFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader>
              <DrawerTitle>Issue a virtual card</DrawerTitle>
              <DrawerDescription>
                Single merchant, always virtual, with a limit from the moment it
                exists.
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="flex flex-col gap-5 overflow-y-auto">
              <div className="flex flex-col gap-2">
                <label htmlFor="card-nickname" className={labelStyles}>
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  name="nickname"
                  value={nickname}
                  onChange={(event) => {
                    setNickname(event.target.value)
                    if (error?.field === "nickname") setError(null)
                  }}
                  placeholder="Ad spend — Q4"
                  hasError={Boolean(fieldError("nickname"))}
                  aria-describedby={
                    fieldError("nickname") ? "card-nickname-error" : undefined
                  }
                />
                {fieldError("nickname") && (
                  <p
                    id="card-nickname-error"
                    className="text-sm text-red-600 dark:text-red-500"
                  >
                    {fieldError("nickname")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="card-merchant" className={labelStyles}>
                  Merchant
                </label>
                <Select value={merchantId} onValueChange={onMerchantChange}>
                  <SelectTrigger
                    id="card-merchant"
                    hasError={Boolean(fieldError("merchantId"))}
                  >
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("merchantId") && (
                  <p className="text-sm text-red-600 dark:text-red-500">
                    {fieldError("merchantId")}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="card-limit" className={labelStyles}>
                    Spend limit
                  </label>
                  <Input
                    id="card-limit"
                    name="spendLimit"
                    inputMode="decimal"
                    value={spendLimit}
                    onChange={(event) => {
                      setSpendLimit(event.target.value)
                      if (error?.field === "spendLimit") setError(null)
                    }}
                    placeholder="2500.00"
                    hasError={Boolean(fieldError("spendLimit"))}
                    aria-describedby="card-limit-hint"
                  />
                  <p id="card-limit-hint" className="text-xs text-gray-500">
                    In {currency}, up to 50,000.00
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="card-currency" className={labelStyles}>
                    Currency
                  </label>
                  <Select
                    value={currency}
                    onValueChange={(next) => setCurrency(next as Currency)}
                  >
                    <SelectTrigger
                      id="card-currency"
                      hasError={Boolean(fieldError("currency"))}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_CURRENCIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {fieldError("spendLimit") && (
                <p className="-mt-2 text-sm text-red-600 dark:text-red-500">
                  {fieldError("spendLimit")}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <label htmlFor="card-category" className={labelStyles}>
                  Category lock{" "}
                  <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <Select value={categoryLock} onValueChange={setCategoryLock}>
                  <SelectTrigger
                    id="card-category"
                    hasError={Boolean(fieldError("categoryLock"))}
                  >
                    <SelectValue placeholder="No lock" />
                  </SelectTrigger>
                  <SelectContent>
                    {MERCHANT_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  The card declines anything outside the category it is locked
                  to.
                </p>
              </div>

              {error && !error.field && (
                <p
                  role="alert"
                  className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400"
                >
                  {error.message}
                </p>
              )}
            </DrawerBody>

            <DrawerFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={submitting}>
                {submitting ? "Issuing" : "Issue card"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  )
}

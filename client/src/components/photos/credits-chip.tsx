/**
 * CreditsChip — header pill showing the current org's photo credit balance,
 * with a "Buy credits" button that opens the pack-picker modal.
 *
 * Shows in every /photos/* page header. Balance is fetched via TanStack
 * Query so it stays fresh across tabs (refetchOnWindowFocus default) and
 * gets invalidated by post-purchase redirect handling + successful downloads.
 *
 * Design notes:
 *  - We keep this compact (icon + number + button) so it fits next to other
 *    page-level CTAs without pushing the primary action offscreen on mobile.
 *  - Low-balance state (< 10) shows an amber tint to nudge a top-up before
 *    the user hits zero mid-delivery.
 *  - Zero-balance state shows red and auto-opens the modal on click of the
 *    chip body, not just the button, to reduce friction.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Coins, Plus, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type BalanceResponse = { orgId: string; balance: number };

interface CreditPack {
  id: "starter" | "growth" | "agency";
  name: string;
  credits: number;
  displayPriceUsd: number;
  priceId: string;
  description: string;
}

type PacksResponse = { packs: CreditPack[] };

type CheckoutResponse = { sessionId: string; url: string };

// ─────────────────────────────────────────────────────────────────────────────
// Chip
// ─────────────────────────────────────────────────────────────────────────────

export function CreditsChip() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data, isLoading } = useQuery<BalanceResponse>({
    queryKey: ["/api/photo/credits/balance"],
  });

  const balance = data?.balance ?? 0;
  const tone = toneForBalance(balance, isLoading);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={[
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
          tone.border,
          tone.bg,
          tone.text,
          "hover:shadow-sm",
        ].join(" ")}
        data-testid="credits-chip"
        aria-label={`Photo credits: ${balance}`}
      >
        <Coins className="w-4 h-4" />
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
          </span>
        ) : (
          <>
            <span className="tabular-nums">{balance.toLocaleString()}</span>
            <span className="opacity-70">credits</span>
          </>
        )}
        <span className="mx-1 opacity-40">·</span>
        <span className="inline-flex items-center gap-0.5">
          <Plus className="w-3 h-3" />
          Buy
        </span>
      </button>

      <BuyCreditsModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}

function toneForBalance(balance: number, loading: boolean) {
  if (loading) {
    return {
      bg: "bg-gray-50",
      border: "border-gray-200",
      text: "text-ailldoit-muted",
    };
  }
  if (balance <= 0) {
    return {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
    };
  }
  if (balance < 10) {
    return {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-800",
    };
  }
  return {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

function BuyCreditsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState<CreditPack["id"]>("growth");

  const { data: packsData, isLoading: packsLoading } = useQuery<PacksResponse>({
    queryKey: ["/api/photo/credits/packs"],
    enabled: open,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (packId: CreditPack["id"]) => {
      const res = await apiRequest("POST", "/api/photo/credits/checkout", {
        packId,
      });
      return (await res.json()) as CheckoutResponse;
    },
    onSuccess: (data) => {
      // Hard navigation — Stripe Checkout is a separate domain.
      window.location.href = data.url;
    },
  });

  const packs = packsData?.packs ?? [];
  const noPacksConfigured = !packsLoading && packs.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buy photo credits</DialogTitle>
          <DialogDescription>
            Credits are spent only when you download a full-resolution, unwatermarked image.
            Watermarked previews are always free.
          </DialogDescription>
        </DialogHeader>

        {packsLoading ? (
          <div className="py-10 flex items-center justify-center text-ailldoit-muted">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading credit packs…
          </div>
        ) : noPacksConfigured ? (
          <div className="py-10 text-center text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4">
            Credit packs are not configured yet. Please check back shortly.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {packs.map((pack) => {
              const isSelected = selected === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelected(pack.id)}
                  className={[
                    "text-left rounded-lg border p-4 transition-all",
                    isSelected
                      ? "border-ailldoit-accent ring-2 ring-ailldoit-accent/30 bg-ailldoit-accent/5"
                      : "border-gray-200 hover:border-gray-300",
                  ].join(" ")}
                  data-testid={`pack-${pack.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-ailldoit-black">{pack.name}</div>
                      <div className="text-2xl font-bold mt-1">
                        ${pack.displayPriceUsd}
                      </div>
                      <div className="text-xs text-ailldoit-muted mt-0.5">
                        ${(pack.displayPriceUsd / pack.credits).toFixed(2)} / credit
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-ailldoit-accent flex-shrink-0" />
                    )}
                  </div>
                  <div className="mt-3 text-sm font-medium">
                    {pack.credits.toLocaleString()} credits
                  </div>
                  <div className="mt-1 text-xs text-ailldoit-muted leading-snug">
                    {pack.description}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={checkoutMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => checkoutMutation.mutate(selected)}
            disabled={
              packsLoading ||
              noPacksConfigured ||
              checkoutMutation.isPending
            }
            className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white"
          >
            {checkoutMutation.isPending ? (
              <span className="inline-flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redirecting to Stripe…
              </span>
            ) : (
              "Continue to checkout"
            )}
          </Button>
        </DialogFooter>

        {checkoutMutation.isError && (
          <p className="text-sm text-red-700 mt-2">
            Couldn't start checkout:{" "}
            {checkoutMutation.error instanceof Error
              ? checkoutMutation.error.message
              : "unknown error"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

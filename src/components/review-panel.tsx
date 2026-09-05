"use client";

import { useEffect, useState } from "react";
import {
  LANDLORD_REVIEW_CATEGORIES,
  TENANT_REVIEW_CATEGORIES,
  categoriesForRatee,
} from "@/lib/reviews";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  categoryRatings: Record<string, number> | null;
  raterIsTenant: boolean;
  raterName: string;
};

function Stars({ value }: { value: number }) {
  return (
    <span>
      {"★".repeat(value)}
      {"☆".repeat(5 - value)}
    </span>
  );
}

function CategoryBreakdown({ categoryRatings }: { categoryRatings: Record<string, number> }) {
  const allCategories = [...LANDLORD_REVIEW_CATEGORIES, ...TENANT_REVIEW_CATEGORIES];
  return (
    <dl className="mt-2 space-y-1">
      {Object.entries(categoryRatings).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 text-xs">
          <dt className="text-muted-foreground">
            {allCategories.find((c) => c.key === key)?.label ?? key}
          </dt>
          <dd className="text-accent">
            <Stars value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ReviewPanel({
  applicationId,
  viewerIsTenant,
}: {
  applicationId: string;
  viewerIsTenant: boolean;
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  // The viewer is leaving a review ABOUT the other party, so the category
  // set is keyed by the ratee's role — a tenant viewer rates a landlord.
  const categories = categoriesForRatee(viewerIsTenant);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>(
    Object.fromEntries(categories.map((c) => [c.key, 5])),
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/reviews?applicationId=${applicationId}`);
    setReviews(res.ok ? await res.json() : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, categoryRatings, comment: comment || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not submit review.");
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (reviews === null) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Loading review…
      </p>
    );
  }

  const myReview = reviews.find((r) => r.raterIsTenant === viewerIsTenant);
  const otherReview = reviews.find((r) => r.raterIsTenant !== viewerIsTenant);

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      {myReview ? (
        <div className="text-sm">
          <span className="eyebrow">Your review</span>
          <p className="mt-1">
            <Stars value={myReview.rating} />
          </p>
          {myReview.categoryRatings && (
            <CategoryBreakdown categoryRatings={myReview.categoryRatings} />
          )}
          {myReview.comment && (
            <p className="mt-1 text-muted-foreground italic">&ldquo;{myReview.comment}&rdquo;</p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <span className="eyebrow">Leave a review</span>
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCategoryRatings((prev) => ({ ...prev, [c.key]: n }))}
                      aria-label={`${c.label}: ${n} star${n > 1 ? "s" : ""}`}
                      className={`text-lg ${
                        n <= categoryRatings[c.key] ? "text-accent" : "text-muted-foreground"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Optional comment"
            className="w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </form>
      )}

      {otherReview && (
        <div className="text-sm">
          <span className="eyebrow">{otherReview.raterName}&apos;s review</span>
          <p className="mt-1">
            <Stars value={otherReview.rating} />
          </p>
          {otherReview.categoryRatings && (
            <CategoryBreakdown categoryRatings={otherReview.categoryRatings} />
          )}
          {otherReview.comment && (
            <p className="mt-1 text-muted-foreground italic">&ldquo;{otherReview.comment}&rdquo;</p>
          )}
        </div>
      )}
    </div>
  );
}

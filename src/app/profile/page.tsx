import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import Link from "next/link";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "./sign-out-button";
import { DeleteButton } from "./delete-button";
import { VerifyIdentity } from "./verify-identity";
import { ReviewPanel } from "@/components/review-panel";
import { PayRentForm } from "./pay-rent-form";
import { MoveOutPanel } from "@/components/move-out-panel";
import { ImprovementCostLog } from "@/components/improvement-cost-log";
import { ActivityTimeline } from "@/components/activity-timeline";
import { TenantAnalyticsSection } from "@/components/analytics-dashboard";
import { Signal, VerificationProgressBar } from "@/components/trust";
import { getTenantHistory } from "@/lib/tenant-history.server";
import { getTenantTrustSignals } from "@/lib/trust-signals.server";
import { formatLastActive } from "@/lib/trust-signals";
import { tenantVerificationProgress } from "@/lib/verification-progress";
import { SavedListingsCompare } from "@/components/saved-listings-compare";
import { getTenantLeaseTimelines } from "@/lib/lease-timeline.server";
import { LeaseTimelineBar } from "@/components/lease-timeline-bar";

type RoommateSessionProfileData = {
  budget?: number;
  sleep?: string;
  smoking?: string;
  smokingNonNegotiable?: boolean;
  study?: string;
  visitors?: string;
};

const paymentBannerCopy: Record<string, string> = {
  success: "Payment received — thanks! A receipt has been emailed to you.",
  failed: "That payment failed. No charge was made — you can try again from your application.",
  cancelled: "Payment cancelled. No charge was made.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth");

  const { payment } = await searchParams;
  const paymentBanner = payment ? (paymentBannerCopy[payment] ?? null) : null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { profile: { include: { tenantVerification: true } } },
  });

  if (!user?.profile) redirect("/auth");

  const [
    savedListings,
    applications,
    roommateSessions,
    agreementDrafts,
    reviewsReceived,
    history,
    leaseTimelines,
  ] = await Promise.all([
    // Only the count is used here now — the detailed comparison table
    // (rent, Trust Score, Match %, distance) fetches its own data client-side.
    prisma.savedListing.count({ where: { profileId: user.profile.id } }),
    prisma.application.findMany({
      where: { profileId: user.profile.id },
      include: { listing: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.roommateSession.findMany({
      where: { profileId: user.profile.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agreementDraft.findMany({
      where: { profileId: user.profile.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.findMany({
      where: {
        application: { profileId: user.profile.id },
        raterProfileId: { not: user.profile.id },
      },
      include: { application: { include: { listing: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    getTenantHistory(user.profile.id),
    getTenantLeaseTimelines(user.profile.id),
  ]);

  const profile = user.profile;
  const trustSignals =
    profile.accountType === "tenant" ? await getTenantTrustSignals(profile.id) : null;

  const acceptedListingIds = applications
    .filter((a) => a.status === "accepted")
    .map((a) => a.listingId);
  const activityEvents = acceptedListingIds.length
    ? await prisma.activityEvent.findMany({
        where: { tenantProfileId: profile.id, listingId: { in: acceptedListingIds } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const activityByListing = new Map<string, typeof activityEvents>();
  for (const event of activityEvents) {
    const list = activityByListing.get(event.listingId);
    if (list) list.push(event);
    else activityByListing.set(event.listingId, [event]);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <p className="eyebrow">Profile</p>
          <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
            {profile.displayName || session.user.email}
          </h1>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {session.user.email} · {String(session.user.role).toLowerCase()}
            {profile.accountType && ` · ${profile.accountType}`}
          </p>
        </div>
        <SignOutButton />
      </header>

      {paymentBanner && (
        <p
          className={`mt-6 border-l-2 pl-3 text-sm ${payment === "success" ? "border-primary text-primary" : "border-destructive text-destructive"}`}
        >
          {paymentBanner}
        </p>
      )}

      {/* Overview */}
      <section className="mt-10">
        <h2 className="text-2xl mb-6">Overview</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Email", session.user.email],
            ["Account type", profile.accountType || "—"],
            ["Saved listings", savedListings],
            ["Applications", applications.length],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-2xl border border-border bg-[var(--card)] p-6"
            >
              <p className="eyebrow">{label}</p>
              <p className="mt-2 font-mono text-sm">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Identity verification (tenants only) */}
      {profile.accountType === "tenant" && (
        <section className="mt-12">
          <h2 className="text-2xl mb-6">Identity verification</h2>
          <VerifyIdentity
            initialStatus={profile.tenantVerification?.status ?? null}
            initialNote={profile.tenantVerification?.reviewNote ?? null}
          />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl border border-border bg-[var(--card)] p-6">
              <VerificationProgressBar
                progress={tenantVerificationProgress(profile.tenantVerification)}
              />
            </div>
            {trustSignals && (
              <div className="grid grid-cols-2 gap-5 rounded-2xl border border-border bg-[var(--card)] p-6 sm:grid-cols-3">
                <Signal label="Completed rentals" value={`${trustSignals.completedRentals}`} />
                <Signal
                  label="Avg. response time"
                  value={
                    trustSignals.avgResponseHours != null
                      ? `${trustSignals.avgResponseHours}h`
                      : "No data yet"
                  }
                />
                <Signal label="Activity" value={formatLastActive(trustSignals.lastActiveAt)} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Lease timeline (tenants only) */}
      {profile.accountType === "tenant" && leaseTimelines.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl mb-1">Lease timeline</h2>
          <p className="mb-6 text-xs text-muted-foreground">
            Move-in, elapsed tenancy, and the renewal-decision window — the same dates the expiry
            reminder emails use.
          </p>
          <div className="space-y-6">
            {leaseTimelines.map((t) => (
              <div
                key={t.applicationId}
                className="rounded-2xl border border-border bg-[var(--card)] p-6"
              >
                <p className="mb-3 text-sm font-medium">{t.listingTitle}</p>
                <LeaseTimelineBar timeline={t} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Analytics (tenants only) */}
      {profile.accountType === "tenant" && (
        <section className="mt-12">
          <h2 className="text-2xl">Your insights</h2>
          <TenantAnalyticsSection />
        </section>
      )}

      {/* History (tenants only) */}
      {profile.accountType === "tenant" && (
        <section className="mt-12">
          <h2 className="text-2xl mb-1">Your history</h2>
          <p className="mb-6 text-xs text-muted-foreground">
            A transparent, browsable version of what your Trust Score already uses internally.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Signal label="Confirmed tenancies" value={`${history.confirmedTenancyCount}`} />
            <Signal
              label="On-time payment rate"
              value={
                history.onTimePaymentRate != null ? `${history.onTimePaymentRate}%` : "No data yet"
              }
            />
            <Signal label="Disputes resolved" value={`${history.resolvedDisputeCount}`} />
            <Signal label="Disputes on record" value={`${history.disputeCount}`} />
          </div>
        </section>
      )}

      {/* Saved Listings / Shortlist */}
      <section className="mt-12">
        <h2 className="text-2xl mb-1">Saved listings ({savedListings})</h2>
        <p className="mb-6 text-xs text-muted-foreground">
          Compare your shortlist side by side — rent, landlord Trust Score, Match %, and distance to
          a landmark of your choice.
        </p>
        <SavedListingsCompare />
      </section>

      {/* Applications */}
      <section className="mt-12">
        <h2 className="text-2xl mb-6">Applications ({applications.length})</h2>
        {applications.length === 0 ? (
          <Empty message="No applications yet." cta="Find properties" href="/" />
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="rounded-2xl border border-border bg-[var(--card)] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-medium">{app.listing.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{app.listing.area}</p>
                    {app.note && (
                      <p className="mt-2 text-sm italic text-muted-foreground">
                        &quot;{app.note}&quot;
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {app.status}
                    </span>
                    <DeleteButton id={app.id} type="application" />
                  </div>
                </div>
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  Applied {new Date(app.createdAt).toLocaleDateString()}
                </p>
                {app.status === "accepted" && (
                  <>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                      <Link
                        href={`/agreement?applicationId=${app.id}`}
                        className="text-sm underline underline-offset-4"
                      >
                        View agreement →
                      </Link>
                      <Link href="/maintenance" className="text-sm underline underline-offset-4">
                        Maintenance →
                      </Link>
                      <Link
                        href={`/messages/${app.id}`}
                        className="text-sm underline underline-offset-4"
                      >
                        Message →
                      </Link>
                      <Link href="/disputes" className="text-sm underline underline-offset-4">
                        File a dispute →
                      </Link>
                    </div>
                    <PayRentForm listingId={app.listingId} rent={app.listing.rent} />
                    <MoveOutPanel applicationId={app.id} viewerIsLandlord={false} />
                    <ImprovementCostLog applicationId={app.id} viewerIsLandlord={false} />
                    <div className="mt-5 border-t border-border pt-5">
                      <p className="eyebrow mb-4">Activity timeline</p>
                      <ActivityTimeline events={activityByListing.get(app.listingId) ?? []} />
                    </div>
                  </>
                )}
                {app.status === "completed" && (
                  <>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                      <Link
                        href={`/messages/${app.id}`}
                        className="text-sm underline underline-offset-4"
                      >
                        Message →
                      </Link>
                      <Link href="/disputes" className="text-sm underline underline-offset-4">
                        File a dispute →
                      </Link>
                    </div>
                    <ReviewPanel applicationId={app.id} viewerIsTenant={true} />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reviews received */}
      <section className="mt-12">
        <h2 className="text-2xl mb-6">Reviews received ({reviewsReceived.length})</h2>
        {reviewsReceived.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reviews yet — these come from landlords once a tenancy ends.
          </p>
        ) : (
          <div className="space-y-4">
            {reviewsReceived.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-[var(--card)] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.application.listing.title}
                    </p>
                    {r.comment && (
                      <p className="mt-2 text-sm italic text-muted-foreground">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Roommate Sessions */}
      <section className="mt-12">
        <h2 className="text-2xl mb-6">Matching sessions ({roommateSessions.length})</h2>
        {roommateSessions.length === 0 ? (
          <Empty
            message="No matching sessions saved yet."
            cta="Start compatibility matcher"
            href="/roommates"
          />
        ) : (
          <div className="space-y-4">
            {roommateSessions.map((s) => {
              const pd = s.profileData as RoommateSessionProfileData;
              const results = s.results as unknown[];
              return (
                <div key={s.id} className="rounded-2xl border border-border bg-[var(--card)] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium">{s.label}</h3>
                      <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                        <span>Budget: ৳{(pd?.budget || 0).toLocaleString()}</span>
                        <span>Sleep: {pd?.sleep || "—"}</span>
                        <span>
                          Smoking: {pd?.smoking || "—"}
                          {pd?.smokingNonNegotiable ? " (non-neg.)" : ""}
                        </span>
                        <span>Study: {pd?.study || "—"}</span>
                        <span>Visitors: {pd?.visitors || "—"}</span>
                        <span>{results.length} candidates scored</span>
                      </div>
                    </div>
                    <DeleteButton id={s.id} type="roommateSession" />
                  </div>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    Saved {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4">
          <Link href="/roommates" className="text-sm underline underline-offset-4">
            Run a new matching session →
          </Link>
        </div>
      </section>

      {/* Agreement Drafts */}
      <section className="mt-12">
        <h2 className="text-2xl mb-6">Agreement drafts ({agreementDrafts.length})</h2>
        {agreementDrafts.length === 0 ? (
          <Empty message="No agreement drafts yet." cta="Go to agreement page" href="/agreement" />
        ) : (
          <div className="space-y-4">
            {agreementDrafts.map((d) => (
              <div key={d.id} className="rounded-2xl border border-border bg-[var(--card)] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-medium font-mono">{d.reference}</h3>
                    <p className="mt-1 text-sm text-muted-foreground capitalize">
                      {d.source} · {(d.clausesJson as unknown[]).length} clauses
                    </p>
                  </div>
                  <DeleteButton id={d.id} type="agreementDraft" />
                </div>
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  Generated {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Empty({ message, cta, href }: { message: string; cta: string; href: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href={href} className="mt-4 inline-block text-sm underline underline-offset-4">
        {cta}
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { CircleUserRound } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const staticNav = [
  { to: "/", label: "Search" },
  { to: "/landlord", label: "Landlord desk" },
  { to: "/agreement", label: "Agreement" },
] as const;

export function SiteHeader() {
  const { data: session, status } = useSession();
  const isLandlord =
    session?.user?.role === "LANDLORD" || session?.user?.accountType === "landlord";
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-bold leading-none tracking-tight">
            rentFindr
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {staticNav.map((item) => (
            <Link
              key={item.to}
              className="border-b-2 border-transparent px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:px-3"
              href={item.to}
            >
              {item.label}
            </Link>
          ))}
          {!isLandlord && (
            <Link
              className="border-b-2 border-transparent px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:px-3"
              href="/matches"
            >
              Matches
            </Link>
          )}
          {!isLandlord && (
            <Link
              className="border-b-2 border-transparent px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:px-3"
              href="/roommates"
            >
              Roommates
            </Link>
          )}
          {status === "authenticated" && (
            <Link
              className="border-b-2 border-transparent px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:px-3"
              href="/maintenance"
            >
              Maintenance
            </Link>
          )}
          {status === "authenticated" && (
            <Link
              className="border-b-2 border-transparent px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:px-3"
              href="/messages"
            >
              Messages
            </Link>
          )}
          {status === "authenticated" && (
            <Link
              className="border-b-2 border-transparent px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:px-3"
              href="/disputes"
            >
              Disputes
            </Link>
          )}
          {isAdmin && (
            <Link
              className="border-b-2 border-transparent px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:px-3"
              href="/admin"
            >
              Admin
            </Link>
          )}
          <ThemeToggle />
          {status === "authenticated" ? (
            <Link
              href="/profile"
              aria-label="Your profile"
              className="ml-1 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-85"
            >
              <CircleUserRound className="size-5" />
            </Link>
          ) : (
            <Link
              href="/auth"
              className="ml-1 rounded-full bg-primary px-3.5 py-1.5 text-[13px] text-primary-foreground transition-opacity hover:opacity-85 sm:px-4"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-chrome";
import { ActivityPing } from "@/components/activity-ping";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { Providers } from "./providers";
import "@/styles.css";

export const metadata: Metadata = {
  title: "rentFindr — find your somewhere",
  description:
    "Verified listings, trust signals, ranked applications and evidence-first rental agreements for Bangladesh.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <ActivityPing />
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

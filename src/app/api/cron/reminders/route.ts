import { NextResponse, NextRequest } from "next/server";
import { runScheduledReminders } from "@/lib/reminders.server";

/**
 * Not user-authenticated — meant to be hit by an external scheduler (cron,
 * Windows Task Scheduler, a GitHub Action, etc.), not a logged-in browser
 * session. Guarded by a shared secret instead of a user session.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runScheduledReminders();
  return NextResponse.json(summary);
}

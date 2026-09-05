"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { extractInviteCode } from "@/lib/admin-invite";

const MAX_PHOTO_BYTES = 1_500_000; // ~1.5MB raw, stays under the server's base64 char limit

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("adminInvite");
  const [mode, setMode] = useState<"signin" | "signup">(inviteCode ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState(inviteCode ? "admin" : "tenant");
  const [adminCode, setAdminCode] = useState(inviteCode ?? "");
  const [nidNumber, setNidNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [nidPhoto, setNidPhoto] = useState<File | null>(null);
  const [ownershipProof, setOwnershipProof] = useState<File | null>(null);
  const [selfiePhoto, setSelfiePhoto] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handlePhoto(file: File | null, setter: (f: File | null) => void) {
    if (file && file.size > MAX_PHOTO_BYTES) {
      setMessage(
        `That photo is too large — please use one under ${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB.`,
      );
      return;
    }
    setter(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const isLandlord = accountType === "landlord";
        const isAdmin = accountType === "admin";
        if (
          isLandlord &&
          (!nidNumber || !phone || !propertyAddress || !nidPhoto || !ownershipProof || !selfiePhoto)
        ) {
          throw new Error(
            "Landlord accounts need NID number, phone, property address, both document photos, and a selfie with your NID for admin verification.",
          );
        }
        if (isAdmin && !adminCode) {
          throw new Error("Admin accounts need the invite code.");
        }

        const payload: Record<string, unknown> = {
          email,
          password,
          displayName: displayName || email.split("@")[0],
          accountType: isAdmin ? "tenant" : accountType,
        };
        if (isLandlord) {
          payload.nidNumber = nidNumber;
          payload.phone = phone;
          payload.propertyAddress = propertyAddress;
          payload.nidPhoto = await fileToBase64(nidPhoto!);
          payload.ownershipProof = await fileToBase64(ownershipProof!);
          payload.selfiePhoto = await fileToBase64(selfiePhoto!);
        }
        if (isAdmin) {
          payload.requestAdmin = true;
          payload.adminCode = extractInviteCode(adminCode);
        }

        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Registration failed.");
        setMessage(
          isLandlord
            ? "Profile created. Your verification documents are pending admin review — you can browse and manage draft listings while you wait. Sign in to continue."
            : "Profile created. Sign in to continue.",
        );
        setMode("signin");
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error(result.error);
      router.push("/profile");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="grid gap-14 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="eyebrow">Profiles</p>
          <h1 className="mt-4 max-w-lg font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight sm:text-5xl">
            Keep your record with you.
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-[var(--card)] p-8">
          <div className="flex">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setMessage(null);
                }}
                className={`flex-1 border px-3 py-2 text-xs transition-colors first:rounded-l-full last:rounded-r-full ${mode === m ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-secondary"}`}
              >
                {m === "signin" ? "Sign in" : "Create profile"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-5">
            {mode === "signup" && (
              <>
                <label className="block">
                  <span className="eyebrow">Display name</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputCls}
                    placeholder="Tanzila Rahman"
                  />
                </label>
                <div>
                  <span className="eyebrow">I am a</span>
                  <div className="mt-3 flex">
                    {["tenant", "landlord", "admin"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAccountType(t)}
                        className={`flex-1 border px-3 py-2 text-xs capitalize transition-colors first:rounded-l-full last:rounded-r-full ${accountType === t ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-secondary"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {accountType === "admin" && (
                  <div className="space-y-5 border-t border-border pt-5">
                    <p className="text-xs text-muted-foreground">
                      Admin accounts review landlord and tenant verification documents. Creating one
                      requires an invite code from an existing admin.
                    </p>
                    <label className="block">
                      <span className="eyebrow">Admin invite code</span>
                      <input
                        type="password"
                        value={adminCode}
                        onChange={(e) => setAdminCode(e.target.value)}
                        className={inputCls}
                        placeholder="Ask an existing admin for this"
                      />
                    </label>
                  </div>
                )}

                {accountType === "landlord" && (
                  <div className="space-y-5 border-t border-border pt-5">
                    <p className="text-xs text-muted-foreground">
                      Landlord accounts require admin verification before listings can go active.
                      Submit these once — an admin reviews them, and you can still create draft
                      listings while pending.
                    </p>
                    <label className="block">
                      <span className="eyebrow">NID number</span>
                      <input
                        value={nidNumber}
                        onChange={(e) => setNidNumber(e.target.value)}
                        className={inputCls}
                        placeholder="1994 7712 8830"
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow">Phone</span>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={inputCls}
                        placeholder="+880 1XXX XXXXXX"
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow">Property address</span>
                      <input
                        value={propertyAddress}
                        onChange={(e) => setPropertyAddress(e.target.value)}
                        className={inputCls}
                        placeholder="House, road, area, city"
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow">NID photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhoto(e.target.files?.[0] ?? null, setNidPhoto)}
                        className="mt-2 w-full text-xs file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
                      />
                      {nidPhoto && <p className="mt-1 text-xs text-primary">✓ {nidPhoto.name}</p>}
                    </label>
                    <label className="block">
                      <span className="eyebrow">Property ownership proof</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handlePhoto(e.target.files?.[0] ?? null, setOwnershipProof)
                        }
                        className="mt-2 w-full text-xs file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
                      />
                      {ownershipProof && (
                        <p className="mt-1 text-xs text-primary">✓ {ownershipProof.name}</p>
                      )}
                    </label>
                    <label className="block">
                      <span className="eyebrow">Selfie with your NID</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhoto(e.target.files?.[0] ?? null, setSelfiePhoto)}
                        className="mt-2 w-full text-xs file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
                      />
                      {selfiePhoto && (
                        <p className="mt-1 text-xs text-primary">✓ {selfiePhoto.name}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        A photo of you holding your NID next to your face, for admin liveness
                        checks.
                      </p>
                    </label>
                  </div>
                )}
              </>
            )}
            <label className="block">
              <span className="eyebrow">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="eyebrow">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create profile"}
            </button>
          </form>

          {message && (
            <p className="mt-5 border-l-2 border-accent pl-3 text-xs text-muted-foreground">
              {message}
            </p>
          )}

          <p className="mt-8 text-xs text-muted-foreground">
            Browsing without an account still works —{" "}
            <Link href="/" className="underline underline-offset-4">
              search listings
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground";

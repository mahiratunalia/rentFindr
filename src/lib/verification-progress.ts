export type VerificationStep = { label: string; done: boolean };
export type VerificationProgress = {
  percent: number;
  steps: VerificationStep[];
  status: "not_started" | "pending" | "verified" | "rejected";
};

export function landlordVerificationProgress(
  v: {
    nidPhotoUrl: string | null;
    ownershipProofUrl: string | null;
    selfiePhotoUrl: string | null;
    status: "pending" | "verified" | "rejected";
  } | null,
): VerificationProgress {
  if (!v) {
    return {
      percent: 0,
      status: "not_started",
      steps: [
        { label: "NID submitted", done: false },
        { label: "Ownership proof submitted", done: false },
        { label: "Selfie with NID submitted", done: false },
        { label: "Admin review complete", done: false },
      ],
    };
  }
  const steps: VerificationStep[] = [
    { label: "NID submitted", done: !!v.nidPhotoUrl },
    { label: "Ownership proof submitted", done: !!v.ownershipProofUrl },
    { label: "Selfie with NID submitted", done: !!v.selfiePhotoUrl },
    { label: "Admin review complete", done: v.status !== "pending" },
  ];
  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  return { percent, status: v.status, steps };
}

export function tenantVerificationProgress(
  v: { nidPhotoUrl: string | null; status: "pending" | "verified" | "rejected" } | null,
): VerificationProgress {
  if (!v) {
    return {
      percent: 0,
      status: "not_started",
      steps: [
        { label: "NID submitted", done: false },
        { label: "Admin review complete", done: false },
      ],
    };
  }
  const steps: VerificationStep[] = [
    { label: "NID submitted", done: !!v.nidPhotoUrl },
    { label: "Admin review complete", done: v.status !== "pending" },
  ];
  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  return { percent, status: v.status, steps };
}

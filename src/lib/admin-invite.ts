// Accepts either the bare code ("XXXXX-XXXXX") or a pasted full invite link
// (".../auth?adminInvite=XXXXX-XXXXX") and returns just the code either way —
// pasting the whole link is an easy mistake and shouldn't produce "invalid code".
export function extractInviteCode(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/[?&]adminInvite=([^&]+)/);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return trimmed;
}

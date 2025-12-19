import type { Snapshot } from "../collab/loadSnapshot.js";

export type VerificationStatus = "unverified" | "verified" | "invalid";

export type VerifiedEvent = {
  path: string;
  kind: string;
  id: string;
  status: VerificationStatus;
  reason?: string;
};

export function verify(snapshot: Snapshot): VerifiedEvent[] {
  // Phase 2/early Phase 3 baseline: verification is permissive and returns "unverified" for all.
  // Future: pluggable signature verifiers (ssh/gpg/etc) + policy evaluation.
  const out: VerifiedEvent[] = [];
  const all = [...snapshot.collabEvents, ...(snapshot.inbox?.events ?? [])];
  for (const ef of all) {
    out.push({
      path: ef.path,
      kind: ef.kind,
      id: (ef.event as any).id ?? "",
      status: "unverified"
    });
  }
  return out;
}



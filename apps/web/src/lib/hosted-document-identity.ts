import { sha256 } from "@noble/hashes/sha2.js";

// These fixed public IDs carry source-kind semantics in existing guided consumers.
// Arbitrary guided-prefixed input must not receive this exception.
const publicGuidedDocumentIds = new Set([
  "guided:w2", "guided:1099-nec", "guided:schedule-c", "guided:1099-oid",
  "guided:1099-da", "guided:1099-int", "guided:1099-div", "guided:1099-b",
  "guided:1099-r", "guided:ssa-1099", "guided:1099-g",
]);
const hostedDocumentIdPattern = /^hdoc:v1:(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/u;

export function isCanonicalHostedDocumentId(documentId: string): boolean {
  return hostedDocumentIdPattern.test(documentId);
}

/** Pseudonymous reconciliation metadata, not a secret or authorization proof.
 * Original local IDs remain unchanged. Byte separators keep random digit runs
 * from resembling direct identifiers to the unchanged hosted privacy scanner.
 */
export function toHostedDocumentId(workspaceId: string, documentId: string): string {
  if (isCanonicalHostedDocumentId(documentId) || publicGuidedDocumentIds.has(documentId)) {
    return documentId;
  }
  const input = new TextEncoder().encode(JSON.stringify([
    "hosted-document-id", 1, workspaceId, documentId,
  ]));
  const digest = Array.from(sha256(input), byte => byte.toString(16).padStart(2, "0")).join(":");
  return `hdoc:v1:${digest}`;
}

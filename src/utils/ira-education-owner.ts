import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Bind tuition to the same normalized owner without duplicating names or a tax ID. */
export function iraEducationOwnerFingerprint(owner?: { firstName: string; middleName?: string; lastName: string; ssn: string }): string | undefined {
  const name = (value?: string) => value?.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  const first = name(owner?.firstName);
  const last = name(owner?.lastName);
  const taxId = owner?.ssn?.trim().replaceAll("-", "") ?? "";
  if (!first || !last || !/^\d{9}$/.test(taxId)) return undefined;
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([first, name(owner?.middleName), last, taxId]))));
}

import "server-only";
import type { ProviderDirectIdentifier, ProviderDirectIdentifierKind } from "@tax-engine/contracts";
import type { TaxYearInput } from "@/models/inputs";
import { collectProviderDirectIdentifiersFromTaxInput } from "@tax-engine/engine/src/provider-direct-identifiers";

/** Collect known identities from validated facts; never return this list to a client/provider. */
export function collectTransientTaxIdentifiers(input: TaxYearInput): ProviderDirectIdentifier[] {
  const identifiers = collectProviderDirectIdentifiersFromTaxInput(input);
  const seen = new Set(identifiers.map(({ kind, value }) => `${kind}:${value.toLowerCase()}`));
  function kindFor(key: string): ProviderDirectIdentifierKind | undefined {
    if (/(?:firstName|lastName|childName|beneficiaryName|recipientName|studentName|patientName)$/i.test(key)) return "person-name";
    if (/ssn$/i.test(key)) return "ssn";
    if (/(?:dateOfBirth|birthDate|deathDate)$/i.test(key)) return "date-of-birth";
    if (/(?:address|street)$/i.test(key)) return "street-address";
    if (/(?:zip|postalCode)$/i.test(key)) return "postal-code";
    if (/email$/i.test(key)) return "email";
    if (/phone$/i.test(key)) return "phone";
    if (/(?:names?|ein|tin|taxId|identifyingNumber|reference|references|identifier|identifiers|Id|Ids)$/i.test(key)
      || /^(?:payer|lender|broker|organization|institution|school|provider|employer|recipient|creditor|pse|platform|marketplace|apt|unit|vin)$/i.test(key)
      || /(?:city|county|locality|municipality|description|dueDiligenceStatement|principalBusinessActivity|principalCropOrActivity|propertyOwned|propertyReceived)$/i.test(key)
      || /(?:account|policy|routing|registration|payer|property|certificate)Numbers?$/i.test(key)) return "other";
    return undefined;
  }
  function visit(value: unknown, key: string) {
    if (typeof value === "string") {
      const kind = kindFor(key), trimmed = value.trim();
      if (!kind || !trimmed) return;
      const identity = `${kind}:${trimmed.toLowerCase()}`;
      if (!seen.has(identity)) { seen.add(identity); identifiers.push({ kind, value: trimmed }); }
    } else if (Array.isArray(value)) {
      for (const child of value) visit(child, key);
    } else if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
    }
  }
  visit(input, "");
  return identifiers;
}

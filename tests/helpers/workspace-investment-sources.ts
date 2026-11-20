import type { WorkspaceDocumentDetectedFactRecord } from "@tax-engine/contracts";

/** Fictional originals supplied by the test, independently of the sample catalog. */
export function fictionalInterestSource(): WorkspaceDocumentDetectedFactRecord {
  return {
    idSuffix: "verified-interest",
    factId: "taxable-interest",
    label: "Fictional bank interest",
    value: "Interest independently supplied by a fictional bank statement.",
    confidence: "high",
    machineValue: {
      entryKind: "1099-int-summary",
      payer: "Fictional savings bank",
      interestIncome: "20000",
      earlyWithdrawalPenalty: "0",
      federalWithheld: "0",
      taxExemptInterest: "0",
      usSavingsBondInterest: "0"
    }
  };
}

export function fictionalBrokerageSources(): WorkspaceDocumentDetectedFactRecord[] {
  return [
    {
      idSuffix: "verified-long-term",
      factId: "broker-proceeds",
      label: "Fictional long-term sale",
      value: "Long-term sale independently supplied by a fictional brokerage statement.",
      confidence: "high",
      machineValue: {
        entryKind: "1099-b-transaction",
        description: "Fictional long-term sale",
        dateAcquired: "2023-02-01",
        dateSold: "2025-09-30",
        proceeds: "40000",
        costBasis: "15000",
        adjustments: "0",
        basisReportedToIRS: true,
        holdingPeriod: "long",
        washSale: false,
        washSaleDisallowed: "0"
      }
    },
    {
      idSuffix: "verified-short-term",
      factId: "broker-proceeds",
      label: "Fictional short-term sale",
      value: "Short-term sale independently supplied by a fictional brokerage statement.",
      confidence: "high",
      machineValue: {
        entryKind: "1099-b-transaction",
        description: "Fictional short-term sale",
        dateAcquired: "2025-01-15",
        dateSold: "2025-06-15",
        proceeds: "42000",
        costBasis: "12000",
        adjustments: "0",
        basisReportedToIRS: true,
        holdingPeriod: "short",
        washSale: false,
        washSaleDisallowed: "0"
      }
    }
  ];
}

export function fictionalInterestUpload(size: number) {
  return {
    name: "f1099int.pdf",
    size,
    detectedDocument: {
      kind: "1099-int" as const,
      taxYear: 2025,
      coverage: "supported" as const,
      label: "Fictional Form 1099-INT",
      notes: "Explicit test source",
      seededFactIds: ["taxable-interest" as const],
      detectedFacts: [fictionalInterestSource()]
    }
  };
}

export function fictionalBrokerageUpload(size: number) {
  return {
    name: "f1099b--2025.pdf",
    size,
    detectedDocument: {
      kind: "1099-b" as const,
      taxYear: 2025,
      coverage: "supported" as const,
      label: "Fictional Form 1099-B",
      notes: "Explicit test source",
      seededFactIds: ["broker-proceeds" as const, "cost-basis-review" as const],
      detectedFacts: fictionalBrokerageSources()
    }
  };
}

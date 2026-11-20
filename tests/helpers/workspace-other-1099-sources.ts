import type { WorkspaceDocumentDetectedFactRecord } from "@tax-engine/contracts";

/** Explicit fictional originals for numerical workspace scenarios. */
export function fictionalDividendSources(): WorkspaceDocumentDetectedFactRecord[] {
  return [
    {
      idSuffix: "original-ordinary-dividends",
      factId: "ordinary-dividends",
      label: "Ordinary dividends",
      value: "Fictional dividend statement with $4,000 ordinary dividends.",
      confidence: "high",
      machineValue: {
        entryKind: "1099-div-summary",
        payer: "Fictional mutual fund",
        ordinaryDividends: "4000",
        qualifiedDividends: "3000",
        capitalGainDistributions: "1000",
        federalWithheld: "0",
        section199ADividends: "0",
        foreignTaxPaid: "0"
      }
    },
    {
      idSuffix: "original-qualified-dividends",
      factId: "qualified-dividends",
      label: "Qualified dividends",
      value: "Fictional dividend statement with $3,000 qualified dividends.",
      confidence: "high"
    },
    {
      idSuffix: "original-capital-gain-distributions",
      factId: "capital-gain-distributions",
      label: "Capital gain distributions",
      value: "Fictional dividend statement with $1,000 capital gain distributions.",
      confidence: "high"
    }
  ];
}

export function fictionalGovernmentPaymentsSource(): WorkspaceDocumentDetectedFactRecord {
  return {
    idSuffix: "original-government-payments",
    factId: "government-payments-review",
    label: "Government payments",
    value: "Fictional government payments statement.",
    confidence: "high",
    machineValue: {
      entryKind: "1099-g-summary",
      payer: "Fictional state agency",
      unemploymentCompensation: "6200",
      stateLocalIncomeTaxRefund: "1100",
      federalWithheld: "620",
      stateWithheld: "55",
      state: "CA"
    }
  };
}

export function fictionalOidSource(): WorkspaceDocumentDetectedFactRecord {
  return {
    idSuffix: "original-oid-income",
    factId: "taxable-interest",
    label: "Original issue discount",
    value: "Fictional original issue discount statement.",
    confidence: "high",
    machineValue: {
      entryKind: "1099-oid-summary",
      payer: "Fictional OID issuer",
      originalIssueDiscount: "1200",
      otherPeriodicInterest: "400",
      earlyWithdrawalPenalty: "25",
      federalWithheld: "40",
      acquisitionPremium: "200",
      treasuryOID: "0",
      bondPremium: "100",
      taxExemptBondPremium: "0",
      taxExemptOID: "0"
    }
  };
}

export function fictionalHsaDistributionSource(): WorkspaceDocumentDetectedFactRecord {
  return {
    idSuffix: "original-hsa-distribution",
    factId: "hsa-distribution-review",
    label: "HSA distribution",
    value: "Fictional HSA distribution statement.",
    confidence: "high",
    machineValue: {
      entryKind: "1099-sa-summary",
      payer: "Fictional HSA custodian",
      grossDistribution: "2400",
      distributionCode: "1",
      accountType: "hsa",
      accountHolder: "primary"
    }
  };
}

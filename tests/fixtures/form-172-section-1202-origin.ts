import { TaxYearInputSchema } from "@/models/inputs.js";
import { capitalOriginInput } from "./form-172-capital-origin.js";
import { qsbsReturnInput, qsbsFullExclusionFundInput } from "./section-1202.js";

/** Complete synthetic original issuer, capital and independent AMT sources. */
export function qsbsOriginInput(kind: "broker" | "fund" | "full" = "broker") {
  const base = capitalOriginInput("0", "0");
  const qsbs = kind === "full" ? qsbsFullExclusionFundInput("20000") : qsbsReturnInput(kind);
  const forms = qsbs.form1099B.map((statement, index) => ({ ...statement,
    sourceId: `original-qsbs-${index}`, taxYear: 2025, accountReference: "ORIGINAL-QSBS-ACCOUNT", federalWithheld: "0" }));
  return TaxYearInputSchema.parse({ ...base, form1099B: forms, form1099Div: qsbs.form1099Div,
    section1202Sources: qsbs.section1202Sources, scheduleDSpecialGainSources: qsbs.scheduleDSpecialGainSources,
    form172: { ...base.form172, capitalSources: { ...base.form172?.capitalSources,
      transactions: forms.flatMap((statement, index) => statement.transactions.map((transaction, row) => ({
        sourceId: `form1099B:${index}:transaction:${row}`, sourceTaxYear: 2025, sourceReference: "Original QSBS disposition and issuer records",
        accountHolder: statement.accountHolder, statementSourceId: statement.sourceId, payerName: statement.broker,
        accountReference: statement.accountReference, nonbusinessInvestmentConfirmed: true, capitalCharacter: "section1202", transaction,
      }))),
      distributions: qsbs.form1099Div.map((statement, index) => ({ sourceId: `form1099Div:${index}`,
        sourceTaxYear: 2025, sourceReference: "Original fund statement and issuer partition", accountHolder: statement.accountHolder,
        payerName: statement.payer, accountReference: statement.accountReference, nonbusinessInvestmentConfirmed: true,
        totalCapitalGainDistributions: statement.totalCapitalGainDistributions, section1202Gain: statement.section1202Gain,
        section1250Gain: statement.section1250Gain, collectiblesGain: statement.collectiblesGain,
      })),
    } },
  });
}

import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceHealthInput } from "./marketplace-health.js";
import { simpleW2Fixture } from "./simple-w2.js";

/** Original fictional C Marketplace and F non-Marketplace payment sources. */
export function separateBusinessHealthInput(binding = true) {
  const source=marketplaceHealthInput();
  const original=source.form7206?.plans?.[0];
  if (!original || !source.form7206 || !source.form8962) throw new Error("Missing synthetic source");
  const marketplace={...original,payments:original.payments?.map(row=>({...row,coverageTaxYear:2025,datePaid:row.datePaid?.replace("2026-","2025-")}))};
  const nonspecified={...marketplace,planId:"farm-medical",policyReference:"Actual separate farm medical policy",businessSourceId:"scheduleF",
    marketplaceCoverage:false,premiumTaxCreditInvolved:false,marketplacePolicySourceIds:undefined,allCoveredPersonsInCoverageFamilyConfirmed:undefined,
    payments:marketplace.payments?.map(row=>({...row,sourceId:`farm-${row.sourceId}`,grossPremium:"250",ownerOrBusinessPaid:"250",advancePremiumTaxCredit:"0",
      personAmounts:[{personId:"primary",payer:"owner_after_tax",amountPaid:"250",advancePremiumTaxCredit:"0",excludedPublicSafetyOfficerAmount:"0",otherTaxFreeFunding:"0"}]}))};
  return TaxYearInputSchema.parse({...source,taxpayer:{...source.taxpayer,taxYear:2025},
    w2s:binding?[{...simpleW2Fixture.w2s[0],accountHolder:"primary",wages:"25000",socialSecurityTips:"0",socialSecurityWages:"25000",medicareWages:"25000",federalWithheld:"0",socialSecurityWithheld:"1550",medicareWithheld:"362.50"}]:[],
    scheduleC:{...source.scheduleC,grossReceipts:binding?"5000":"50000"},
    scheduleF:{accountHolder:"primary",principalCropOrActivity:"Actual farm",salesOfProductsRaised:"20000",qbiMateriallyParticipated:true},
    form1095A:source.form1095A.map(row=>({...row,taxYear:2025,monthlyPremiums:row.monthlyPremiums.map(month=>({...month,slcsp:"500"}))})),
    form8962:{...source.form8962,monthlyReconciliation:source.form8962.monthlyReconciliation?.map(row=>({...row,slcsp:"500"}))},
    form7206:{...source.form7206,sourceTaxYear:2025,persons:[{personId:"primary",name:"Jane Doe",householdRole:"primary",attainedAgeAtYearEnd:35}],plans:[marketplace,nonspecified]}});
}

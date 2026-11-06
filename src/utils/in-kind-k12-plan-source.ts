/** Original program evidence only; no tax calculation or invented qualification. */
import type { QualifiedEducationExpenseSummary } from '@/models/inputs.js';
type Facts=NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>;
type Benefit=NonNullable<Facts['inKindBenefits']>[number];
type Beneficiary=NonNullable<Facts['beneficiaries']>[number];

// Spec: spec/federal/form-1099-q-in-kind-k12.yaml; IRC529(b)(1)/(c)(3)/(e)(3).
export function readInKindK12PlanSource(benefit:Benefit,beneficiary:Beneficiary|undefined):Record<string,string> {
  const sponsor=benefit.prepaidPlanSponsor;
  if((sponsor!=='state'&&sponsor!=='eligible_educational_institutions')
    ||benefit.prepaidPlanQualifiedConfirmed!==true||benefit.prepaidTuitionCreditRedeemed!==true
    ||!benefit.prepaidPlanSourceReference?.trim()) {
    throw new Error('K12 prepaid benefit requires actual qualified program and redeemed tuition credit source records');
  }
  if(beneficiary?.outsideK12CashOnlyConfirmed!==true)throw new Error('K12 prepaid benefit requires confirmed cash-only outside-plan distribution sources');
  if(sponsor==='eligible_educational_institutions'&&(benefit.prepaidInstitutionQualifiedTrustConfirmed!==true
    ||!benefit.prepaidInstitutionDeterminationReference?.trim())) {
    throw new Error('Institutional prepaid program requires its actual qualified trust and IRS determination source');
  }
  return {'Program sponsor':sponsor,'Qualified program':'yes','Tuition credit redeemed':'yes',
    'Program source':benefit.prepaidPlanSourceReference.trim(),'Outside distributions cash only':'yes',
    ...(sponsor==='eligible_educational_institutions'?{'Qualified institutional trust':'yes','Institutional determination':benefit.prepaidInstitutionDeterminationReference!.trim()}:{}),
  };
}

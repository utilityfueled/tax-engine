// Spec: spec/federal/rrta-payroll-review-paper.yaml.
import { rrtaTipInput } from './rrta-tip-payroll.js';

/** Fictional actual owner records. The spouse's ordinary payroll is separate
 * from primary's railroad cap; no combined excess-Social-Security claim. */
export function rrtaPaperInput(railroad = '300000', wages = '260000', rrtaWithheld = '450', wageWithheld = '3860', joint = true) {
  const input = rrtaTipInput(2025, railroad, '0', rrtaWithheld);
  required(input.w2s[0].employer).ein = '34-6182957';
  required(required(required(input.form4137).sourceFacts).employers)[0].employerEin = '57-3926418';
  if (joint) {
    input.taxpayer.filingStatus = 'married_filing_jointly';
    input.taxpayer.spouse = { ...input.taxpayer.primary, firstName: 'John', ssn: '654-28-9137' };
  }
  if (wages !== '0') {
    if (!joint) throw Error('This fixture requires separate original payroll owners');
    const actualPayroll: Record<string, { ssWages: string; ssWithheld: string }> = {
      '260000': { ssWages: '176100', ssWithheld: '10918.20' },
      '190000': { ssWages: '176100', ssWithheld: '10918.20' },
      '20000': { ssWages: '20000', ssWithheld: '1240' },
    };
    const facts = required(actualPayroll[wages]);
    const wage = rrtaTipInput(2025, '0', wages, '0').w2s[1];
    input.w2s.push({ ...wage, accountHolder: 'spouse', employer: { name: 'Fictional Restaurant', ein: '57-3926418' }, socialSecurityWages: facts.ssWages, socialSecurityWithheld: facts.ssWithheld, medicareWithheld: wageWithheld });
  }
  delete input.schedule1A; // No Schedule1-A deduction claim in this paper fixture.
  const rail = required(input.rrtaPayrollSources);
  required(rail.sources)[0].originalW2 = structuredClone(input.w2s[0]);
  rail.originalTaxpayer = structuredClone(input.taxpayer);
  required(rail.originalTipForms)[0].original = structuredClone(required(input.form4137));
  return input;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('Missing actual fictional original');
  return value;
}

/** Explicit fictional original documentary confirmation, not a model default. */
export function rrtaPaperSources(input:ReturnType<typeof rrtaPaperInput>){
 return {sourceTaxYear:2025,sourceReference:'Fictional original complete Box12 B-N review',noOrdinaryUncollectedMedicareCodesBOrNConfirmed:true,originalW2s:structuredClone(input.w2s)};
}

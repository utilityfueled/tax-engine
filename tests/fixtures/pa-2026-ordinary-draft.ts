/** Independent literal synthetic annual sources; never production defaults. */
import {paOrdinaryReturnFixture} from './pa-ordinary-return.js';
import {paOrdinaryResidencyFixture} from './pa-residency-sources.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import type {PAResidencySources} from '@/models/pa-residency.js';
import {Form1099DivSchema} from '@/models/inputs.js';
export function pa2026OrdinaryDraftFixture(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paOrdinaryReturnFixture(status,2026),w=f.input.w2s[0];
 delete f.input.eic;
 f.input.form1099Int=[];f.input.paResidencySources.interest=[];
 Object.assign(w,{wages:'75000',socialSecurityWages:'75000',socialSecurityWithheld:'4650',medicareWages:'75000',medicareWithheld:'1087.50',stateWages:status==='resident'?'75000':status==='part_year'?'39000':'9000',stateTaxWithheld:status==='resident'?'2303':status==='part_year'?'1197':'276'});
 f.input.paResidencySources.wages[0].payroll=status==='part_year'?[
 {sourceReference:'Fictional 2026 original pre-move payroll',paidOn:'2026-06-30',serviceFrom:'2026-01-01',serviceThrough:'2026-06-30',grossCompensation:'45000',paServicesCompensation:'9000',outsidePAServicesCompensation:'36000'},
 {sourceReference:'Fictional 2026 original post-move payroll',paidOn:'2026-12-31',serviceFrom:'2026-07-01',serviceThrough:'2026-12-31',grossCompensation:'30000',paServicesCompensation:'0',outsidePAServicesCompensation:'30000'},
 ]:[{sourceReference:'Fictional 2026 original annual payroll',paidOn:'2026-12-31',serviceFrom:'2026-01-01',serviceThrough:'2026-12-31',grossCompensation:'75000',paServicesCompensation:status==='resident'?'0':'9000',outsidePAServicesCompensation:status==='resident'?'75000':'66000'}];
 f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Fictional actual fully covered tax account'};
 rebindPA2026Draft(f);return f;
}
export function rebindPA2026Draft(f:ReturnType<typeof paOrdinaryReturnFixture>){
 f.input.paResidencySources.wages.forEach(row=>{if(row.originalIndex!==null)row.original=structuredClone(f.input.w2s[row.originalIndex]);});
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
}

export function pa2026OrdinaryBankInterestFixture(status: 'resident' | 'part_year' | 'nonresident' = 'part_year') {
 const f = pa2026OrdinaryDraftFixture(status);
 const bank = paOrdinaryResidencyFixture('part_year', 2026);
 const original = { ...bank.input.form1099Int[0], taxYear: 2026 };
 f.input.form1099Int = [original];
 f.input.paResidencySources.interest = [{ ...bank.sources.interest[0], original: structuredClone(original) }];
 f.input.w2s[0].stateTaxWithheld = status === 'resident' ? '2306' : status === 'part_year' ? '1199' : '276';
 rebindPA2026Draft(f);
 return f;
}

export function pa2026OrdinaryCashDividendFixture(status: 'resident' | 'part_year' | 'nonresident' = 'part_year') {
 const f = pa2026OrdinaryDraftFixture(status);
 const original = Form1099DivSchema.parse({
  taxYear: 2026, payer: 'Fictional domestic corporation', accountReference: 'fictional-personal-dividend-account', accountHolder: 'primary',
  ordinaryDividends: '120', qualifiedDividends: '30', totalCapitalGainDistributions: '0', section1250Gain: '0',
  section1202Gain: '0', collectiblesGain: '0', nondividendDistributions: '0', federalWithheld: '0',
  section199ADividends: '0', foreignTaxPaid: '0', exemptInterestDividends: '0', specifiedPrivateActivityBondInterest: '0', stateWithheld: '0',
 });
 const source = {
  originalIndex: 0, sourceTaxYear: 2026, sourceReference: 'Fictional complete original domestic dividend statement',
  sourceFactsConfirmed: true, original: structuredClone(original), ordinaryPersonalDividendIncomeConfirmed: true,
  domesticCorporateCashDividendsOnlyConfirmed: true as boolean | null,
  capitalDistributionsFromRegulatedInvestmentCompanyConfirmed: null as boolean | null, noOtherPADividendAdjustmentsConfirmed: true,
  currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
  credits: [
   { sourceReference: 'Fictional pre-move cash distribution credit', creditedOn: '2026-06-30', ordinaryDividends: '80', capitalGainDistributions: '0' },
   { sourceReference: 'Fictional move-date cash distribution credit', creditedOn: '2026-07-01', ordinaryDividends: '40', capitalGainDistributions: '0' },
  ],
 };
 f.input.form1099Div = [original];
 const residency = { ...f.input.paResidencySources, dividends: [source] };
 f.input.paResidencySources = residency;
 f.input.w2s[0].stateTaxWithheld = { resident: '2306', part_year: '1199', nonresident: '276' }[status];
 rebindPA2026Draft(f);
 return { ...f, residency };
}

export function pa2026FloridaMoveResidentFixture() {
 return pa2026InboundMoveResidentFixture('FL', 'Florida');
}

export function pa2026TexasMoveResidentFixture() {
 return pa2026InboundMoveResidentFixture('TX', 'Texas');
}

function pa2026InboundMoveResidentFixture(priorState: 'FL' | 'TX', priorStateName: string) {
 const f = pa2026OrdinaryDraftFixture('part_year');
 const residency = f.input.paResidencySources.residency;
 residency.status = 'resident';
 residency.sourceReference = `Fictional ${priorStateName}-to-PA move and permanent abodes with 200 documented PA days`;
 Object.assign(residency.domicilePeriods[0], { state: priorState, daysInPA: 40 });
 if (priorState === 'TX') residency.outsidePAPermanentAbodePeriods[0].state = priorState;
 residency.domicilePeriods[1].daysInPA = 160;
 f.input.taxpayer.address = { street: '10 Fictional Way', city: 'Pittsburgh', state: 'PA', zip: '15222' };
 for (const payroll of f.input.paResidencySources.wages[0].payroll) {
  payroll.paServicesCompensation = payroll.grossCompensation;
  payroll.outsidePAServicesCompensation = '0';
 }
 Object.assign(f.input.w2s[0], { stateWages: '75000', stateTaxWithheld: '2303' });
 Object.assign(f.sources.otherStateTaxes.jurisdictions[0], { state: priorState, sourceReference: `Fictional complete ${priorStateName} zero income-tax history` });
 rebindPA2026Draft(f);
 return f;
}

export function pa2026OutboundNonresidentFixture() {
 const f = pa2026OrdinaryDraftFixture('nonresident');
 const source = f.input.paResidencySources;
 const outsidePAPermanentAbodePeriods: PAResidencySources['residency']['outsidePAPermanentAbodePeriods'] = [{
  from: '2026-01-01', through: '2026-12-31', state: 'NY', sourceReference: 'Fictional original year-round New York lease',
 }];
 const outboundTaxResidencePeriods: PAResidencySources['residency']['outboundTaxResidencePeriods'] = [
  { from: '2026-01-01', through: '2026-06-30', sourceReference: 'Fictional original January to June income-tax residency records', noReciprocalStateIncomeTaxResidenceConfirmed: true },
  { from: '2026-07-01', through: '2026-12-31', sourceReference: 'Fictional original July to December income-tax residency records', noReciprocalStateIncomeTaxResidenceConfirmed: true },
 ];
 const residency = { ...source.residency,
  sourceReference: 'Fictional PA-to-NY domicile change and complete 30-day PA presence worksheet',
  domicilePeriods: [
   { state: 'PA', daysInPA: 20, from: '2026-01-01', through: '2026-06-30' },
   { state: 'NY', daysInPA: 10, from: '2026-07-01', through: '2026-12-31' },
  ],
  moveAbandonmentNewDomicileAndPresenceConfirmed: true,
  outsidePAPermanentAbodePeriods, outboundTaxResidencePeriods,
 };
 source.wages[0].payroll = [
  { sourceReference: 'Fictional original June payroll', paidOn: '2026-06-30', serviceFrom: '2026-01-01', serviceThrough: '2026-06-30',
   grossCompensation: '45000', paServicesCompensation: '6000', outsidePAServicesCompensation: '39000' },
  { sourceReference: 'Fictional original December payroll', paidOn: '2026-12-31', serviceFrom: '2026-07-01', serviceThrough: '2026-12-31',
   grossCompensation: '30000', paServicesCompensation: '3000', outsidePAServicesCompensation: '27000' },
 ];
 const fixture = { ...f, input: { ...f.input, paResidencySources: { ...source, residency } } };
 rebindPA2026Draft(fixture);
 return fixture;
}

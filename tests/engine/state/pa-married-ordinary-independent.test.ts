/** Independent review controls: spec/state/pa-married-ordinary-independent.yaml. */
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAMarriedOrdinaryReturn,snapshotPAMarriedOrdinaryOriginals} from '@/engine/state/pa-married-ordinary-return.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {paMarriedOrdinaryFixture} from '../../fixtures/pa-married-ordinary-return.js';
import {paOrdinaryReturnFixture} from '../../fixtures/pa-ordinary-return.js';
// Own PythonDecimal100 calculation frozen before candidate products/outputs.
const ownOracles = [
  {
    "name": "whole",
    "mode": "J",
    "rawWages": [
      "50000",
      "30000"
    ],
    "rawWithheld": [
      "1535",
      "921"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "80000",
    "SPRate": "0",
    "returns": [
      {
        "line1": "80000",
        "line12": "2456",
        "line13": "2456",
        "line21": "0",
        "line24": "2456",
        "line28": "0",
        "line29": "0"
      }
    ]
  },
  {
    "name": "whole",
    "mode": "M",
    "rawWages": [
      "50000",
      "30000"
    ],
    "rawWithheld": [
      "1535",
      "921"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "80000",
    "SPRate": "0",
    "returns": [
      {
        "line1": "50000",
        "line12": "1535",
        "line13": "1535",
        "line21": "0",
        "line24": "1535",
        "line28": "0",
        "line29": "0"
      },
      {
        "line1": "30000",
        "line12": "921",
        "line13": "921",
        "line21": "0",
        "line24": "921",
        "line28": "0",
        "line29": "0"
      }
    ]
  },
  {
    "name": "rawcents",
    "mode": "J",
    "rawWages": [
      "50000.25",
      "30000.25"
    ],
    "rawWithheld": [
      "1535.25",
      "921.25"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "80001",
    "SPRate": "0",
    "returns": [
      {
        "line1": "80001",
        "line12": "2456",
        "line13": "2457",
        "line21": "0",
        "line24": "2457",
        "line28": "0",
        "line29": "1"
      }
    ]
  },
  {
    "name": "rawcents",
    "mode": "M",
    "rawWages": [
      "50000.25",
      "30000.25"
    ],
    "rawWithheld": [
      "1535.25",
      "921.25"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "80000",
    "SPRate": "0",
    "returns": [
      {
        "line1": "50000",
        "line12": "1535",
        "line13": "1535",
        "line21": "0",
        "line24": "1535",
        "line28": "0",
        "line29": "0"
      },
      {
        "line1": "30000",
        "line12": "921",
        "line13": "921",
        "line21": "0",
        "line24": "921",
        "line28": "0",
        "line29": "0"
      }
    ]
  },
  {
    "name": "shared13001",
    "mode": "J",
    "rawWages": [
      "10000",
      "3001"
    ],
    "rawWithheld": [
      "307",
      "92"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "13001",
    "SPRate": "0.9",
    "returns": [
      {
        "line1": "13001",
        "line12": "399",
        "line13": "399",
        "line21": "359",
        "line24": "758",
        "line28": "0",
        "line29": "359"
      }
    ]
  },
  {
    "name": "shared13001",
    "mode": "M",
    "rawWages": [
      "10000",
      "3001"
    ],
    "rawWithheld": [
      "307",
      "92"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "13001",
    "SPRate": "0.9",
    "returns": [
      {
        "line1": "10000",
        "line12": "307",
        "line13": "307",
        "line21": "276",
        "line24": "583",
        "line28": "0",
        "line29": "276"
      },
      {
        "line1": "3001",
        "line12": "92",
        "line13": "92",
        "line21": "83",
        "line24": "175",
        "line28": "0",
        "line29": "83"
      }
    ]
  },
  {
    "name": "gift-edge",
    "mode": "J",
    "rawWages": [
      "8000",
      "5000"
    ],
    "rawWithheld": [
      "246",
      "154"
    ],
    "rawGifts": [
      "250.50",
      "0"
    ],
    "SP11": "13251",
    "SPRate": "0.8",
    "returns": [
      {
        "line1": "13000",
        "line12": "399",
        "line13": "400",
        "line21": "319",
        "line24": "719",
        "line28": "0",
        "line29": "320"
      }
    ]
  },
  {
    "name": "gift-edge",
    "mode": "M",
    "rawWages": [
      "8000",
      "5000"
    ],
    "rawWithheld": [
      "246",
      "154"
    ],
    "rawGifts": [
      "250.50",
      "0"
    ],
    "SP11": "13251",
    "SPRate": "0.8",
    "returns": [
      {
        "line1": "8000",
        "line12": "246",
        "line13": "246",
        "line21": "197",
        "line24": "443",
        "line28": "0",
        "line29": "197"
      },
      {
        "line1": "5000",
        "line12": "154",
        "line13": "154",
        "line21": "123",
        "line24": "277",
        "line28": "0",
        "line29": "123"
      }
    ]
  },
  {
    "name": "J-M-income-line",
    "mode": "J",
    "rawWages": [
      "10000.25",
      "3000.25"
    ],
    "rawWithheld": [
      "307",
      "92"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "13001",
    "SPRate": "0.9",
    "returns": [
      {
        "line1": "13001",
        "line12": "399",
        "line13": "399",
        "line21": "359",
        "line24": "758",
        "line28": "0",
        "line29": "359"
      }
    ]
  },
  {
    "name": "J-M-income-line",
    "mode": "M",
    "rawWages": [
      "10000.25",
      "3000.25"
    ],
    "rawWithheld": [
      "307",
      "92"
    ],
    "rawGifts": [
      "0",
      "0"
    ],
    "SP11": "13000",
    "SPRate": "1",
    "returns": [
      {
        "line1": "10000",
        "line12": "307",
        "line13": "307",
        "line21": "307",
        "line24": "614",
        "line28": "0",
        "line29": "307"
      },
      {
        "line1": "3000",
        "line12": "92",
        "line13": "92",
        "line21": "92",
        "line24": "184",
        "line28": "0",
        "line29": "92"
      }
    ]
  },
  {
    "name": "J-M-gift-line",
    "mode": "J",
    "rawWages": [
      "8000",
      "5000"
    ],
    "rawWithheld": [
      "246",
      "154"
    ],
    "rawGifts": [
      "125.25",
      "125.25"
    ],
    "SP11": "13251",
    "SPRate": "0.8",
    "returns": [
      {
        "line1": "13000",
        "line12": "399",
        "line13": "400",
        "line21": "319",
        "line24": "719",
        "line28": "0",
        "line29": "320"
      }
    ]
  },
  {
    "name": "J-M-gift-line",
    "mode": "M",
    "rawWages": [
      "8000",
      "5000"
    ],
    "rawWithheld": [
      "246",
      "154"
    ],
    "rawGifts": [
      "125.25",
      "125.25"
    ],
    "SP11": "13250",
    "SPRate": "0.9",
    "returns": [
      {
        "line1": "8000",
        "line12": "246",
        "line13": "246",
        "line21": "221",
        "line24": "467",
        "line28": "0",
        "line29": "221"
      },
      {
        "line1": "5000",
        "line12": "154",
        "line13": "154",
        "line21": "139",
        "line24": "293",
        "line28": "0",
        "line29": "139"
      }
    ]
  }
] as const;
type Packet=ReturnType<typeof paMarriedOrdinaryFixture>;
function first<T>(items:readonly T[]):T{const row=items[0];if(row===undefined)throw new Error('Independent source original missing');return row;}
function at<T>(items:readonly T[],index:number):T{const row=items[index];if(row===undefined)throw new Error('Independent indexed source original missing');return row;}
function refresh(p:Packet){p.sources.originalFederalSources=snapshotPAMarriedOrdinaryOriginals(p.input);}
function wageRefresh(p:Packet,index:number){at(p.sources.wages,index).original=structuredClone(at(p.input.w2s,index));refresh(p);}
function calc(p:Packet){return calculatePAMarriedOrdinaryReturn(p.input,p.sources);}
function addSpouseGift(p:Packet,value:string){if(value==='0')return;const c=at(p.sources.owners,1).sp.categories['5'],entry=structuredClone(first(at(p.sources.owners,0).sp.categories['5'].entries));entry.sourceReference='Independent actual other spouse gift source';entry.amount=value;entry.original.amount=value;entry.original.recipientSsn=p.input.taxpayer.spouse?.ssn??'';entry.original.donorName='Independent distinct donor';c.status='entries';c.entries=[entry];}
function oraclePacket(row:typeof ownOracles[number]){const p=paMarriedOrdinaryFixture(row.mode,[...row.rawWages],[...row.rawWithheld],row.rawGifts[0]);addSpouseGift(p,row.rawGifts[1]);p.sources.dispositions.forEach((d,i)=>{d.refundRequested=at(row.returns,i).line29;});return p;}
it.each(ownOracles.map(row=>[row.name,row.mode,row] as const))('independent-money %s %s',(_name,_mode,row)=>{
 const p=oraclePacket(row),before=JSON.stringify(p),precision=Decimal.precision,f=calculateFederalTax(p.input),r=calc(p);
 expect(f.filingStatus).toBe('married_filing_jointly');expect(f.earnedIncomeCredit.toFixed()).toBe('0');expect(r.federal.adjustedGrossIncome.eq(f.agi)).toBe(true);expect(r.federal.earnedIncomeCredit.eq(f.earnedIncomeCredit)).toBe(true);
 expect(r.filingMode).toBe(row.mode);expect(r.returns.map(v=>v.accountHolder)).toEqual(row.mode==='J'?['joint']:['primary','spouse']);expect(r.returns).toHaveLength(row.returns.length);
 r.returns.forEach((v,i)=>{const o=at(row.returns,i);expect([v.pa40.compensation.toFixed(),v.pa40.taxLiability.toFixed(),v.pa40.stateWithholding.toFixed(),v.pa40.taxForgivenessCredit.toFixed(),v.pa40.totalPaymentsAndCredits.toFixed(),v.pa40.totalAmountDue.toFixed(),v.pa40.netOverpayment.toFixed()]).toEqual([o.line1,o.line12,o.line13,o.line21,o.line24,o.line28,o.line29]);expect(v.scheduleSP.eligibilityIncome.toFixed()).toBe(row.SP11);expect(v.scheduleSP.forgivenessPercentage.div(100).toString()).toBe(row.SPRate);expect(v.scheduleSP.filingCategory).toBe('married');expect(v.refundDisposition.refund.toFixed()).toBe(o.line29);expect(v.rev1630.totalInterest.toFixed()).toBe('0');expect(v.workingCredit.credit.toFixed()).toBe('0');});
 expect(r.perOwner.map(v=>v.rawCompensation.toFixed())).toEqual([...row.rawWages]);expect(r.perOwner.map(v=>v.rawPAWithholding.toFixed())).toEqual([...row.rawWithheld]);expect(r.localBoundary.status).toBe('separate_return_required');expect(r.readiness.filingEligible).toBe(false);expect(r.readiness.formStatus).toBe('actual_2025_review_only');
 const audit=JSON.stringify(r.lines);for(const secret of [p.input.taxpayer.primary.ssn,p.input.taxpayer.spouse?.ssn??'never-secret',p.input.taxpayer.primary.firstName,p.input.taxpayer.spouse?.firstName??'never-secret',p.sources.sourceReference,first(p.sources.wages).sourceReference,p.input.taxpayer.address.street])expect(audit).not.toContain(secret);
 expect(JSON.stringify(p)).toBe(before);expect(Decimal.precision).toBe(precision);
});
it('reported-columns same-owner multiple actual W2s sum once',()=>{
 for(const mode of ['J','M'] as const){const p=paMarriedOrdinaryFixture(mode,['50000.50','30000'],['1535.50','921']);
  const original=first(p.input.w2s),source=first(p.sources.wages);original.wages='25000.25';original.stateWages='25000.25';original.socialSecurityWages='25000.25';original.medicareWages='25000.25';original.stateTaxWithheld='767.75';original.socialSecurityWithheld='1550.02';original.medicareWithheld='362.50';source.payroll[0]={...first(source.payroll),grossCompensation:'25000.25',paServicesCompensation:'25000.25'};source.original=structuredClone(original);
  const extra=structuredClone(original);extra.employer={name:'Independent actual second primary employer',ein:'91-0000444'};p.input.w2s.push(extra);const extraSource={...structuredClone(source),originalIndex:2,sourceReference:'Independent complete second primary W2',original:structuredClone(extra),payroll:[{...first(source.payroll),sourceReference:'Independent second primary cash payroll'}]};p.sources.wages.push(extraSource);refresh(p);
  first(p.sources.dispositions).refundRequested='1';const r=calc(p);expect(first(r.perOwner).rawCompensation.toFixed()).toBe('50000.5');expect(first(r.perOwner).reportedCompensation.toFixed()).toBe('50001');expect(r.returns.map(v=>v.pa40.compensation.toFixed())).toEqual(mode==='J'?['80001']:['50001','30000']);expect(r.returns.map(v=>v.pa40.stateWithholding.toFixed())).toEqual(mode==='J'?['2457']:['1536','921']);expect(r.returns.map(v=>v.pa40.netOverpayment.toFixed())).toEqual(mode==='J'?['1']:['1','0']);
 }
});
it('reported-columns same employer and same money remain distinct actual owners',()=>{
 const p=paMarriedOrdinaryFixture('M',['30000','30000'],['921','921']);at(p.input.w2s,1).employer=structuredClone(first(p.input.w2s).employer);wageRefresh(p,1);const r=calc(p);expect(r.returns.map(v=>v.pa40.taxLiability.toFixed())).toEqual(['921','921']);expect(r.perOwner.map(v=>v.accountHolder)).toEqual(['primary','spouse']);
});
const negatives:[string,(p:Packet)=>void][]=[
 ['unknown-spouse-alive',p=>{Object.assign(at(p.sources.owners,1),{aliveEntireYear:null});}],
 ['missing-spouse-owner-proof',p=>{p.sources.owners.pop();}],
 ['unknown-actual-days',p=>{Object.assign(at(p.sources.owners,1).residency,{actualDaysInPA:null});}],
 ['impossible-actual-days',p=>{at(p.sources.owners,1).residency.actualDaysInPA=366;}],
 ['noncalendar-year',p=>{at(p.sources.owners,1).taxYearFrom='2025-02-01';}],
 ['spouse-actual-support-J',p=>{at(p.sources.owners,1).individualSupportDhsLiability=true;}],
 ['unknown-individual-court',p=>{Object.assign(at(p.sources.owners,1),{individualCourtObligation:null});}],
 ['contradictory-school-J',p=>{at(p.sources.owners,1).residency.dec31SchoolDistrictCode='11111';}],
 ['unknown-worldwide',p=>{Object.assign(at(p.sources.owners,1).sp,{allWorldwideSourcesCompleteConfirmed:null});}],
 ['unknown-sp-line2',p=>{at(p.sources.owners,1).sp.categories['2'].status='';}],
 ['unsupported-sp-line10-social-security',p=>{const c=at(p.sources.owners,1).sp.categories['10'];c.status='entries';c.entries=[{sourceReference:'Actual retained excluded SSA benefit',date:'2025-04-01',amount:'100',original:{kind:'social_security',date:'2025-04-01',amount:'100',donorName:'Social Security Administration',recipientSsn:p.input.taxpayer.spouse?.ssn??'',donorInHousehold:false},notElsewhereConfirmed:true}];}],
 ['forged-sp-percentage',p=>{Reflect.set(at(p.sources.owners,1).sp,'percentage','100');}],
 ['free-spouse-income',p=>{Reflect.set(p.sources,'spouseEligibilityIncome','0');}],
 ['missing-zero-source',p=>{const w=structuredClone(at(p.input.w2s,1));w.wages='0';w.stateWages='0';p.input.w2s.push(w);refresh(p);}],
 ['stale-equal-money-payer',p=>{at(p.input.w2s,1).employer.ein='91-0000777';refresh(p);}],
 ['wrong-original-recipient',p=>{at(p.sources.wages,1).originalRecipientSsn=p.input.taxpayer.primary.ssn;}],
 ['missing-canonical-owner',p=>{Reflect.deleteProperty(at(p.input.w2s,1),'accountHolder');wageRefresh(p,1);}],
 ['wrong-canonical-year',p=>{at(p.input.w2s,1).taxYear=2024;wageRefresh(p,1);}],
 ['wage-index-duplicate',p=>{at(p.sources.wages,1).originalIndex=0;}],
 ['impossible-pay-date',p=>{first(at(p.sources.wages,1).payroll).paidOn='2025-02-29';}],
 ['cross-year-services',p=>{first(at(p.sources.wages,1).payroll).serviceFrom='2024-12-31';}],
 ['gross-cent-mismatch',p=>{first(at(p.sources.wages,1).payroll).grossCompensation='30000.01';}],
 ['unreconciled-otherstate-service',p=>{first(at(p.sources.wages,1).payroll).outsidePAServicesCompensation='1';}],
 ['missing-known-zero-childcare',p=>{Reflect.deleteProperty(at(p.input.w2s,1),'box10DependentCareBenefits');wageRefresh(p,1);}],
 ['actual-employer-benefit',p=>{at(p.input.w2s,1).box10DependentCareBenefits='100';wageRefresh(p,1);}],
 ['unknown-withholding',p=>{Reflect.deleteProperty(at(p.input.w2s,1),'stateTaxWithheld');wageRefresh(p,1);}],
 ['negative-withholding',p=>{at(p.input.w2s,1).stateTaxWithheld='-1';wageRefresh(p,1);}],
 ['foreign-state-scalar',p=>{at(p.input.w2s,1).state='OH';wageRefresh(p,1);}],
 ['nonempty-netzero-interest-originals',p=>{p.input.form1099Int=[{payer:'Actual positive source',accountHolder:'primary',interestIncome:'100'},{payer:'Actual negative source',accountHolder:'spouse',interestIncome:'-100'}];refresh(p);}],
 ['nonempty-netzero-benefit-originals',p=>{p.input.formSSA1099=[{netBenefits:'100'}];p.input.formRRB1099=[{netSocialSecurityEquivalentBenefitPortion:'-100'}];refresh(p);}],
 ['nonempty-knownzero-business',p=>{Reflect.set(p.input,'scheduleC',{accountHolder:'spouse',grossReceipts:'0'});refresh(p);}],
 ['nonempty-unknown-cod-original',p=>{Reflect.set(p.input,'form1099C',[{amountOfDebtDischarged:'0'}]);refresh(p);}],
 ['nonempty-offsetting-adjustments',p=>{Reflect.set(p.input,'adjustments',{iraDeduction:'100',otherAdjustmentsTotal:'-100'});refresh(p);}],
 ['unknown-restricted-credit-review',p=>{Object.assign(p.sources.coverage,{allRestrictedCreditsKnownNoneConfirmed:null});}],
 ['unknown-use-tax-review',p=>{Object.assign(p.sources.coverage,{allUseTaxPurchasesKnownNoneConfirmed:null});}],
 ['actual-separate-estimate-J',p=>{first(p.sources.owners).payments.estimatedPaymentsStatus='actual_receipts';first(p.sources.owners).payments.originalReceipts=[{date:'2025-04-15',amount:'50',owner:'primary'}];}],
 ['unknown-prior-credit-status',p=>{first(p.sources.owners).payments.priorCreditStatus='';}],
 ['unknown-refund-request',p=>{first(p.sources.dispositions).refundRequested='';}],
 ['unearned-refund-request',p=>{first(p.sources.dispositions).refundRequested='1';}],
 ['duplicate-disposition',p=>{p.sources.dispositions.push(structuredClone(first(p.sources.dispositions)));}],
 ['false-actual-payment-claim',p=>{first(p.sources.dispositions).remainingPayment.status='actual_payment';}],
 ['unknown-filing-status',p=>{p.sources.timing.kind='';}],
 ['invalid-filing-day',p=>{p.sources.timing.filingDate='2026-02-30';}],
 ['actual-filing-future',p=>{p.sources.timing.kind='filed';}],
 ['late-filing',p=>{p.sources.timing.filingDate='2026-04-16';}],
];
it.each(negatives)('actual-source-guards %s',(_name,mutate)=>{const p=paMarriedOrdinaryFixture();mutate(p);const before=JSON.stringify(p);expect(()=>calc(p)).toThrow();expect(JSON.stringify(p)).toBe(before);});
it('source-payments no opposing separate-owner invented settlement',()=>{
 const p=paMarriedOrdinaryFixture('M',['50000','30000'],['1545','911']);first(p.sources.dispositions).refundRequested='10';Object.assign(at(p.sources.dispositions,1).remainingPayment,{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'10'});expect(()=>calc(p)).toThrow(/opposing|117\.2/);
});
it('source-payments actual separate liability does not forbid M when support exists',()=>{
 const p=paMarriedOrdinaryFixture('M');at(p.sources.owners,1).individualSupportDhsLiability=true;expect(calc(p).returns.map(v=>v.accountHolder)).toEqual(['primary','spouse']);
});
it('prior-exemption no-return is not priorSP-ineligibility proof',()=>{
 const p=paMarriedOrdinaryFixture('J',['50000','30000'],['0','0']);Object.assign(first(p.sources.dispositions).remainingPayment,{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'2456'});
 // Both factual no-return statuses say nothing about prior eligible income/100%SP.
 expect(p.sources.owners.map(v=>v.payments.priorReturnStatus)).toEqual(['no_return','no_return']);expect(()=>calc(p)).toThrow(/prior.*(?:exemption|forgiveness|eligibility)/i);
});
it('prior-exemption current withholding independently removes need for unused prior proof',()=>{
 for(const status of ['not_used','actual_return'] as const){const p=paMarriedOrdinaryFixture();p.sources.owners.forEach(v=>{v.payments.priorReturnStatus=status;});const r=calc(p);expect(first(r.returns).rev1630.penaltyRequired).toBe(false);expect(first(r.returns).pa40.penaltiesAndInterest.toFixed()).toBe('0');}
});
it('actual-source-guards positive actual federal EIC cannot be zeroed or halved for M',()=>{
 const p=paMarriedOrdinaryFixture('M',['10000','3000'],['307','92']);p.input.taxpayer.primary.dateOfBirth='1990-04-02';if(p.input.taxpayer.spouse)p.input.taxpayer.spouse.dateOfBirth='1992-05-03';refresh(p);expect(calculateFederalTax(p.input).earnedIncomeCredit.gt(0)).toBe(true);expect(()=>calc(p)).toThrow(/positive actual joint federal EIC/);
});
it('immutable-private original commitments and canonical context',()=>{
 const p=paMarriedOrdinaryFixture(),before=JSON.stringify(p),r=calc(p),precision=Decimal.precision;expect(r.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(p)).toBe(before);
 p.sources.wages.reverse();expect(calc(p).sourceCommitment).not.toBe(r.sourceCommitment);p.sources.wages.reverse();expect(calc(p).sourceCommitment).toBe(r.sourceCommitment);
 const reordered={...p.sources,coverage:Object.fromEntries(Object.entries(p.sources.coverage).reverse())};expect(calculatePAMarriedOrdinaryReturn(p.input,reordered).sourceCommitment).toBe(r.sourceCommitment);
 Reflect.set(p.input,'paMarriedOrdinarySources',structuredClone(p.sources));expect(calc(p).sourceCommitment).toBe(r.sourceCommitment);
 const conflicting=structuredClone(p.sources);conflicting.filingMode='M';Reflect.set(p.input,'paMarriedOrdinarySources',conflicting);expect(()=>calc(p)).toThrow(/attached canonical/);Reflect.deleteProperty(p.input,'paMarriedOrdinarySources');
 p.sources.wages[0].sourceReference+=' changed actual record';expect(calc(p).sourceCommitment).not.toBe(r.sourceCommitment);
 const newIdentity=structuredClone(p);at(newIdentity.input.w2s,1).employer.name='Independent equal-cash changed employer';expect(()=>calc(newIdentity)).toThrow(/snapshot|original/);wageRefresh(newIdentity,1);expect(calc(newIdentity).sourceCommitment).not.toBe(calc(p).sourceCommitment);
 const cents=paMarriedOrdinaryFixture('M',['50000.01','30000'],['1535','921']);const cent=calc(cents);expect(cent.returns.map(v=>v.pa40.taxLiability.toFixed())).toEqual(['1535','921']);expect(cent.sourceCommitment).not.toBe(r.sourceCommitment);expect(Decimal.precision).toBe(precision);
});
it('immutable-private preserves legacy single and public2026 denial',()=>{
 const p=paMarriedOrdinaryFixture('M'),single=paOrdinaryReturnFixture();single.input.taxpayer.filingStatus='married_filing_jointly';single.input.taxpayer.spouse=structuredClone(p.input.taxpayer.spouse);expect(()=>calculatePAOrdinaryReturn(single.input,single.facts,single.sources)).toThrow();
 const next=paMarriedOrdinaryFixture('J',undefined,undefined,undefined,2026);expect(()=>calc(next)).toThrow(/2026.*incomplete/);expect(()=>calculateFederalTax(next.input)).toThrow(/2026.*incomplete/);
});

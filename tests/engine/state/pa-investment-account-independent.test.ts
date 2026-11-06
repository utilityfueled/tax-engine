// Spec: spec/state/pa-investment-account-independent.yaml, complete-known-remittances / unique-source-receipts.
// Distinct independent technical review; author V1 NY return-credit premise is separately held.
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculatePAInvestmentWithholdingAccount} from '@/engine/state/pa-investment-withholding-account';
import {currentInvestmentOriginals,settledNYInvestmentAccount} from '../../fixtures/pa-ordinary-brokerage-sources';
const cases=[
 ['1099R',{form1099R:[{payer:'Fictional actual other NY pension payer',grossDistribution:'0',taxableAmount:'0',distributionCode:'7',taxYear:2025,state:'NY',stateWithheld:'0.10'}]}],
 ['1099R alias',{form1099R:[{payer:'Fictional actual other NY pension payer',grossDistribution:'0',taxableAmount:'0',distributionCode:'7',taxYear:2025,state:'NY',stateWithheld:'0',stateTaxWithheld:'0.10'}]}],
 ['1099G',{form1099G:[{payer:'Fictional actual other NY government payer',unemploymentCompensation:'0',state:'NY',stateWithheld:'0.10'}]}],
 ['1099K',{form1099K:[{pse:'Fictional actual other NY payment payer',grossAmount:'0',state:'NY',stateWithheld:'0.10'}]}],
 ['W2G',{formW2G:[{payer:'Fictional actual other NY wager payer',reportableWinnings:'0',typeOfWager:'lottery',state:'NY',stateWithheld:'0.10'}]}],
]as const;
it.each(cases)('independent NY investment account refuses omitted known current remittance %s',(_name,extra)=>{
 const baseline=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(baseline),input=TaxYearInputSchema.parse({...baseline,...extra});
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')).toThrow(/actual|withhold|source|account|method/i);
});
it('independent NY investment account refuses semantic duplicate refund receipt',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),refund=structuredClone(packet.refunds[0]);
 packet.refunds=[{...refund,amount:'200',confirmationNumber:'fictional actual refund receipt'},{...refund,amount:'200',confirmationNumber:' FICTIONAL   ACTUAL REFUND RECEIPT '}];
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')).toThrow(/duplicate|receipt|source|account|actual/i);
});

it('independent NY investment account checks duplicate identity after exact principal allocation',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),refund=structuredClone(packet.refunds[0]);
 const left={...refund,amount:'200',confirmationNumber:'fictional actual refund receipt'},right={...refund,amount:'200',confirmationNumber:' FICTIONAL   ACTUAL REFUND RECEIPT '};
 // Keep the actual successor receipt's independently stated principal/interest allocation exact.
 // Old V1 has no such fields; never add an unknown property to its strict schema.
 if('principalAmount'in refund){Reflect.set(left,'principalAmount','200');Reflect.set(right,'principalAmount','200');}
 packet.refunds=[left,right];
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')).toThrow(/duplicat/i);
});

it('independent NY investment account cannot erase normalized known NY remittance',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input);
 input.form1099Int[0].state=' ny ';input.form1099Int[0].stateWithheld='0.10';
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')).toThrow(/actual|withhold|source|account|method|state/i);
});

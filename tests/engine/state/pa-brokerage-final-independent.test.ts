// Spec: state/pa-brokerage-final-independent.yaml. Independently specified fictional controls.
import {expect,it} from 'vitest';
import {calculatePAOrdinaryBrokerageSources} from '@/engine/state/pa-ordinary-brokerage-sources';
import {calculatePAInvestmentWithholdingAccount} from '@/engine/state/pa-investment-withholding-account';
import {brokeragePacket,paOrdinaryBrokerageFixture,currentInvestmentOriginals,settledNYInvestmentAccount} from '../../fixtures/pa-ordinary-brokerage-sources';
const resident={status:'resident' as const,residentPeriods:[{from:'2025-01-01',through:'2025-12-31'}]};
function pair(firstAccount:string,secondAccount:string){
 const f=paOrdinaryBrokerageFixture();
 const first=f.input.form1099B[0];if(!first)throw Error('Explicit original fixture required');first.accountReference=firstAccount;
 const second=structuredClone(first);second.sourceId='Fictional separately supplied source original';second.accountReference=secondAccount;f.input.form1099B.push(second);return f.input;
}
it.each([['000123','123'],['A-001','A-1']])('retains actual distinct nonnumeric account identities %s and %s',(first,second)=>{
 const input=pair(first,second),before=structuredClone(input);const result=calculatePAOrdinaryBrokerageSources(input,brokeragePacket(input),resident);
 expect(result.rawGainOrLoss.toFixed()).toBe('2000');expect(result.reportedGainOrLoss.toFixed()).toBe('2000');expect(input).toEqual(before);
});
it('accepts two independently known payer TINs with equal account and financial originals',()=>{
 const input=pair('actual account A','actual account A'),second=input.form1099B[1];if(!second)throw Error('Second original required');second.payerTin='98-7654321';
 expect(calculatePAOrdinaryBrokerageSources(input,brokeragePacket(input),resident).rawGainOrLoss.toFixed()).toBe('2000');
});
it('rejects the same known TIN digits and actual account despite source and broker display changes',()=>{
 const input=pair('actual account A','actual account A'),second=input.form1099B[1];if(!second)throw Error('Second original required');second.payerTin='12 3456790';second.broker='Different free display label';
 expect(()=>calculatePAOrdinaryBrokerageSources(input,brokeragePacket(input),resident)).toThrow(/duplicate|same.*original/i);
});
it('does not use free display labels to distinguish otherwise equal originals with unknown payer identity',()=>{
 const input=pair('same account','different free account');for(const original of input.form1099B)Reflect.deleteProperty(original,'payerTin');const second=input.form1099B[1];if(!second)throw Error('Second original required');second.broker='Different free display label';
 expect(()=>calculatePAOrdinaryBrokerageSources(input,brokeragePacket(input),resident)).toThrow(/duplicate|same.*original/i);
});
it('does not count numeric transaction formatting as a second known account original',()=>{
 const input=pair('same actual account','same actual account'),second=input.form1099B[1];if(!second)throw Error('Second original required');const transaction=second.transactions[0];if(!transaction)throw Error('Actual transaction required');transaction.proceeds='1000.00';
 expect(()=>calculatePAOrdinaryBrokerageSources(input,brokeragePacket(input),resident)).toThrow(/duplicate|same.*original/i);
});
it('separates actual principal400 from actual interest5 without mutating the recorded receipt',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),receipt=packet.refunds[0];if(!receipt)throw Error('Actual refund receipt required');receipt.amount='405';receipt.interestAmount='5';const before=structuredClone(packet);
 const result=calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')[0];if(!result)throw Error('Actual replay result required');expect(result.receivedRefunds.toFixed()).toBe('400');expect(result.netTaxPayments.toFixed()).toBe('0');expect(result.residentCredit.toFixed()).toBe('0');expect(packet).toEqual(before);
});
it('does not treat interest5 as the missing principal5 in a fully settled account claim',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),receipt=packet.refunds[0];if(!receipt)throw Error('Actual refund receipt required');receipt.principalAmount='395';receipt.interestAmount='5';
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')).toThrow(/reconcile/i);
});
it('rejects an equal-dollar but edited current original until its actual payment snapshot is supplied',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),original=input.form1099B[0];if(!original)throw Error('Original required');original.broker='Changed current original display';
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')).toThrow(/stale/i);
});
it('rejects future received principal and retains the original account history on a read',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),receipt=packet.refunds[0];if(!receipt)throw Error('Actual refund receipt required');receipt.date='2026-04-16';const before=structuredClone(packet);
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],'2026-04-15')).toThrow(/receipt|date/i);expect(packet).toEqual(before);
});

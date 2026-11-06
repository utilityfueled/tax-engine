import {describe,it,expect} from 'vitest';
import {Form4562Schema,DepreciableAssetSchema,type DepreciableAsset} from '@/models/inputs.js';
import {calculateForm4562} from '@/engine/forms/form-4562.js';
import Decimal from 'decimal.js';

// spec/federal/form-4562-asset-basis-reconciliation.yaml. Literal oracle:
// 10000*.6-1000-2000=3000; HY200DB3000*.2=600; form1000+2000+600=3600.
function asset(listed=false,gross='10000',section179='1000',bonus='2000'):DepreciableAsset{
  const costBasis=new Decimal(gross).minus(section179).toString();
  const original={description:'Synthetic equipment',costBasis,placedInServiceDate:'2026-01-01',recoveryPeriod:'5' as const,method:'200DB' as const,disposedDuringYear:false,isListedProperty:listed,isPassengerAutomobile:false,businessUsePercentage:60,firstYearBonusEligible:bonus!=='0'};
  return DepreciableAssetSchema.parse({...original,basisSources:{version:'macrs-basis-v1',system:'GDS',sourceTaxYear:2026,sourceReference:'synthetic-completed-record',grossBasisSourceReference:'synthetic-cost-record',businessUseSourceReference:'synthetic-use-log',section179SourceReference:'synthetic-election-record',bonusSourceReference:'synthetic-bonus-record',confirmed:true,calendarYear:true,usePattern:'constant_business_only',changedUseDuringYear:false,noOtherBasisAdjustmentsConfirmed:true,noConversionOrCarryoverBasisConfirmed:true,legacyCostBasisMeaning:'gross_basis_less_business_section179_before_bonus',grossCostBasis:gross,businessUsePercentage:'60',section179BusinessDeduction:section179,bonusBusinessDeduction:bonus,assetSnapshot:original}});
}
const input=(assets:DepreciableAsset[],deduction='1000',bonus='2000')=>Form4562Schema.parse({taxYear:2026,assets,section179ExpenseDeduction:deduction,specialDepreciationAllowance:bonus});
function auditLine(result:ReturnType<typeof calculateForm4562>,line:string){
  const row=result.lines.find(entry=>entry.line===line);
  if(!row)throw new Error(`Missing audit line ${line}`);
  return row;
}
describe('Form4562 actual asset bridge consistency',()=>{
  it('reconciles actual ordinary allocations without silently dropping deductions',()=>{
    const original=input([asset()]),before=JSON.stringify(original),result=calculateForm4562(original);
    expect([result.line12,result.line14,result.line19,result.line22].map(v=>v.toString())).toEqual(['1000','2000','600','3600']);
    expect(JSON.stringify(original)).toBe(before);
    for(const [section179,bonus] of [['0','2000'],['999','2000'],['1000','1999'],['1001','2001']])expect(()=>calculateForm4562(input([asset()],section179,bonus))).toThrow(/asset|allocation|basis/i);
  });
  it('keeps a documented zero listed deduction zero instead of a legacy scalar',()=>{
    const original=Form4562Schema.parse({...input([asset(true,'0','0','0')],'0','0'),listedPropertyDepreciation:'750'});
    const result=calculateForm4562(original);
    expect(result.line21.toString()).toBe('0');expect(result.line22.toString()).toBe('0');
  });
  it('denies partial source collections and unsupported listed allocations',()=>{
    const legacy=DepreciableAssetSchema.parse({costBasis:'1000',placedInServiceDate:'2026-01',recoveryPeriod:'5'});
    expect(()=>calculateForm4562(input([asset(),legacy]))).toThrow(/asset|source|basis/i);
    expect(()=>calculateForm4562(input([asset(true)]))).toThrow(/listed|Part V|allocation/i);
  });
  it('audits the remaining business basis without implying a second allocation',()=>{
    const listed=calculateForm4562(input([asset(true,'10000','0','0')],'0','0'));
    const row=auditLine(listed,'Part V');
    expect(row.value.toString()).toBe('1200');
    expect(row.formula).toBe('Remaining business MACRS basis × table percentage (business use already allocated)');
    expect(row.inputs['Gross basis'].toString()).toBe('10000');
    expect(row.inputs['Business basis'].toString()).toBe('6000');
    expect(row.inputs['Remaining business MACRS basis'].toString()).toBe('6000');
    const ordinary=calculateForm4562(input([asset()]));
    const ordinaryRow=auditLine(ordinary,'asset');
    expect(ordinaryRow.inputs['Remaining business MACRS basis'].toString()).toBe('3000');
    expect(ordinaryRow.inputs['Actual section179'].toString()).toBe('1000');
    expect(ordinaryRow.inputs['Actual bonus'].toString()).toBe('2000');
    expect(JSON.stringify([...listed.lines,...ordinary.lines])).not.toContain('synthetic-cost-record');
    const zero=calculateForm4562(input([asset(true,'0','0','0')],'0','0'));
    expect(auditLine(zero,'21').formula).toContain('Computed');
  });
});

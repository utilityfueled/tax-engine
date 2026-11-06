// Spec: spec/state/pa-personal-debt-retained-amount-independent.yaml. Additive; original18 and author13 unchanged.
import {expect,it} from 'vitest';
import {calculatePAPersonalDebtAndForeignBankSources} from '@/engine/state/pa-personal-debt-foreign-sources';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {paPersonalCodForeignFixture} from '../../fixtures/pa-personal-debt-foreign-sources';
function present<T>(x:T|null|undefined):T{if(x===null||x===undefined)throw Error('Missing explicit original source');return x;}
it.each(['actualDischargedAmount','actualDischargedInterest'] as const)('independent current retained actual discharge amounts cannot contradict PA complete charges: %s',key=>{
 const f=paPersonalCodForeignFixture(),d=present(present(present(f.input.form982NolSources).debts)[0]);
 d.personalDebt={sourceReference:'NEW independent fictional confirmed original creditor complete-discharge ledger',sourceFactsConfirmed:true,allDischargedAmountsIncluded:true,proceedsUse:'personal_living_expenses',actualDischargedAmount:'300',actualDischargedInterest:'0'};
 d.personalDebt[key]=key==='actualDischargedAmount'?'400':'30';
 const before=JSON.stringify(f),compute=()=>calculatePAPersonalDebtAndForeignBankSources(f.input,{personalDebtDischarges:f.personalDebtDischarges,foreignBankTaxSources:f.foreignBankTaxSources});
 expect(()=>compute()).toThrow();expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();expect(JSON.stringify(f)).toBe(before);
});

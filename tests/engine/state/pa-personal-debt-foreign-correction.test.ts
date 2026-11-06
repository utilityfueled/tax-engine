// Spec: state/pa-personal-debt-foreign-sources.yaml retained-debtor-security.
import {expect,it} from 'vitest';
import {calculatePAPersonalDebtAndForeignBankSources} from '@/engine/state/pa-personal-debt-foreign-sources';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {paPersonalCodForeignFixture} from '../../fixtures/pa-personal-debt-foreign-sources';
function present<T>(x:T|null|undefined):T{if(x===undefined||x===null)throw Error('Missing explicit fictional source');return x;}
type Fixture=ReturnType<typeof paPersonalCodForeignFixture>;
const debt=(f:Fixture)=>present(present(present(f.input.form982NolSources).debts)[0]);
const qualification=(f:Fixture)=>present(f.personalDebtDischarges[0]).qualification;
const compute=(f:Fixture)=>calculatePAPersonalDebtAndForeignBankSources(f.input,{personalDebtDischarges:f.personalDebtDischarges,foreignBankTaxSources:f.foreignBankTaxSources});
function explicitPA(f:Fixture,answer:boolean|null){Object.assign(qualification(f),{noCollateralOfAnyKindConfirmed:answer});}
it('actual PA-only unsecured proof accepts without federal exclusion metadata',()=>{
 const f=paPersonalCodForeignFixture();delete f.input.form982NolSources;
 // NEW explicitly fictional complete Jane loan agreement/title-search qualification.
 explicitPA(f,true);qualification(f).propertySourceReference='NEW fictional original Jane agreement and security/title search: no collateral of any kind';
 const before=JSON.stringify(f),r=compute(f);expect(r.personalDischargedAmount.toFixed()).toBe('300');expect(r.paTaxableDebtIncome.toFixed()).toBe('0');
 const p=calculatePAResidencySources(f.input,f.sources);expect(p.totalOrdinaryPATaxableIncome.toFixed()).toBe('100000');expect(p.taxBeforeCredits.toFixed()).toBe('3070');expect(JSON.stringify(f)).toBe(before);
});
it.each([null,false] as const)('PA-only unsecured status stays unknown or outside method: %s',answer=>{
 const f=paPersonalCodForeignFixture();delete f.input.form982NolSources;explicitPA(f,answer);expect(()=>compute(f)).toThrow();
});
it('missing actual unsecured evidence cannot be inferred from no transfer or no business security',()=>{
 const f=paPersonalCodForeignFixture();delete f.input.form982NolSources;expect(()=>compute(f)).toThrow();
});
it('explicit PA collateral conflict cannot be overwritten by retained federal unsecured true',()=>{
 const f=paPersonalCodForeignFixture();explicitPA(f,false);expect(()=>compute(f)).toThrow();
});
it('nullable PA security answer may use matching retained actual unsecured proof',()=>{
 const f=paPersonalCodForeignFixture();explicitPA(f,null);expect(compute(f).paTaxableDebtIncome.toFixed()).toBe('0');
});
it('absent optional federal identity and security metadata is not an explicit contradiction',()=>{
 const f=paPersonalCodForeignFixture(),d=debt(f);delete d.accountHolder;delete d.debtorName;delete d.debtorSsnLast4;delete d.personallyLiable;delete d.unsecuredPersonalDebtConfirmed;delete d.noPropertyTransferConfirmed;
 explicitPA(f,true);expect(compute(f).personalDischargedAmount.toFixed()).toBe('300');
});
it('matching retained debtor identity and original boxes preserve literal classification',()=>{
 const f=paPersonalCodForeignFixture(),d=debt(f);d.accountHolder='primary';d.debtorName='Jane Doe';d.debtorSsnLast4='6789';d.personallyLiable=true;d.fmvOfProperty='0.00';
 expect(compute(f).personalDischargedAmount.toFixed()).toBe('300');
});
it.each(['business','investment','mixed_or_other'] as const)('confirmed other proceeds use cannot be overridden by explicit PA unsecured proof: %s',use=>{
 const f=paPersonalCodForeignFixture();explicitPA(f,true);debt(f).personalDebt={sourceReference:'NEW fictional complete original proceeds ledger',sourceFactsConfirmed:true,proceedsUse:use};expect(()=>compute(f)).toThrow();
});
it.each(['unsecuredPersonalDebtConfirmed','noPropertyTransferConfirmed'] as const)('explicit retained source conflict cannot be overridden by PA proof: %s',key=>{
 const f=paPersonalCodForeignFixture();explicitPA(f,true);debt(f)[key]=false;expect(()=>compute(f)).toThrow();
});

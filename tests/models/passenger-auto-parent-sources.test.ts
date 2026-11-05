/** Spec: spec/federal/schedule-c-passenger-first-year-sources.yaml. */
import {it,expect} from 'vitest';
function required<T>(value:T|undefined|null):T{if(value===undefined||value===null)throw new Error('Required synthetic fixture or result missing');return value;}
import {TaxYearInputSchema,BusinessExpensesSchema,type TaxYearInput} from '@/models/inputs.js';
import {calculateScheduleC} from '@/engine/schedules/schedule-c.js';
import {calculateScheduleE} from '@/engine/schedules/schedule-e.js';
import {PassengerAutoParentSourcesSchema,PASSENGER_PARENT_EXPENSE_KEYS} from '@/models/passenger-auto-parent-sources.js';
import {passengerParentFixture,parentProof} from '../fixtures/passenger-auto-parent.js';
const reject=(input:TaxYearInput)=>{const before=JSON.stringify(input);expect(TaxYearInputSchema.safeParse(input).success).toBe(false);expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow();expect(()=>calculateScheduleE(input)).toThrow();expect(JSON.stringify(input)).toBe(before);};
it('closed original expense fields cover every actual canonical category with no defaults',()=>{
 expect([...PASSENGER_PARENT_EXPENSE_KEYS].sort()).toEqual(Object.keys(BusinessExpensesSchema.shape).sort());
 const input=passengerParentFixture(),proof=parentProof(input);expect(PassengerAutoParentSourcesSchema.safeParse(proof).success).toBe(true);
 type Amounts={expenses:Record<string,string>};for(const key of PASSENGER_PARENT_EXPENSE_KEYS){const copy=structuredClone(proof);delete (copy.amounts as Amounts).expenses[key];expect(PassengerAutoParentSourcesSchema.safeParse(copy).success).toBe(false);}
});
for(const [label,change] of [
 ['missing confirmation',(i:TaxYearInput)=>{parentProof(i).confirmed=null;}],
 ['unknown original scope',(i:TaxYearInput)=>{delete parentProof(i).scope;}],
 ['removed packet',(i:TaxYearInput)=>{delete required(i.form4562).passengerFirstYearSources;}],
 ['removed parent',(i:TaxYearInput)=>{delete (required(i.scheduleC).sourceFacts as unknown as Record<string,unknown>).passengerFirstYear;}],
 ['missing business',(i:TaxYearInput)=>{delete i.scheduleC;}],
 ['stale owner',(i:TaxYearInput)=>{i.taxpayer.primary.firstName='Different';}],
 ['spouse owner',(i:TaxYearInput)=>{required(i.scheduleC).accountHolder='spouse';}],
 ['joint household',(i:TaxYearInput)=>{i.taxpayer.filingStatus='married_filing_jointly';}],
 ['source year',(i:TaxYearInput)=>{parentProof(i).sourceTaxYear=2025;}],
 ['actual year',(i:TaxYearInput)=>{i.taxpayer.taxYear=2025;}],
 ['unclassified scope',(i:TaxYearInput)=>{(parentProof(i).scope as Record<string,unknown>).unreviewed=true;}],
 ['duplicate classification',(i:TaxYearInput)=>{const rows=parentProof(i).expenseClassifications as Array<{category:string}>;rows[1].category=rows[0].category;}],
 ['unknown classified zero',(i:TaxYearInput)=>{const rows=parentProof(i).expenseClassifications as Array<Record<string,unknown>>;delete rows[1].currentCashBusinessOnlyConfirmed;}],
 ['missing documentary zero',(i:TaxYearInput)=>{delete (parentProof(i).amounts as {expenses:Record<string,string>}).expenses.insurance;}],
 ['competing ordinary source',(i:TaxYearInput)=>{required(required(i.scheduleC).sourceFacts).depreciation={};}],
 ['positive unsupported expense',(i:TaxYearInput)=>{required(required(i.scheduleC).expenses).carAndTruck='1';}],
 ['changed gross',(i:TaxYearInput)=>{required(i.scheduleC).grossReceipts='15001';}],
 ['manual duplicate depreciation',(i:TaxYearInput)=>{required(required(i.scheduleC).expenses).depreciation='9225';}],
 ['arbitrary standalone income',(i:TaxYearInput)=>{required(i.form4562).section179BusinessIncomeLimit='100000';}],
] as const)it(`missing or contradictory actual source denies before all parent paths: ${label}`,()=>{const input=passengerParentFixture();change(input);reject(input);});
for(const key of ['w2s','form1099Int','form1099Div','form1099B','form1099DA','form1099Misc','form1099G','form1099OID','formW2G','form1099K','form1099C','form1099Q','scheduleK1','scheduleK1Form1041','form1098','form1098E','form1095A','donations','rentalProperties','savingsBondRedemptions','form6252','form8814','homeSales','form8824'])it(`other original source cannot be treated as absent: ${key}`,()=>{
 const input=passengerParentFixture();(input as unknown as Record<string,unknown>)[key]=[{}];expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow();expect(()=>calculateScheduleE(input)).toThrow();
});
for(const key of ['form4137','form4137ByOwner','form8919','scheduleF','royaltyPropertySources','form4797','form2555','cryptoIncome','dependentCareBenefits','priorYear','netOperatingLoss','form172','adjustments','form7206','form4684','form461','form3800','form982NolSources','form982AttributeSources','seHealthInsuranceWorksheet','qbiLossSources','unknownFutureActiveMethod'])it(`unclassified or additional method fails even when empty: ${key}`,()=>{
 const input=passengerParentFixture();(input as unknown as Record<string,unknown>)[key]={};expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow();expect(()=>calculateScheduleE(input)).toThrow();
});
it('incomplete direct E cannot borrow an otherwise complete standalone source',()=>{const input=passengerParentFixture();expect(()=>calculateScheduleE({form4562:input.form4562,scheduleK1:[],form1099Misc:[],rentalProperties:[]})).toThrow();});
it('a rental passenger packet stays absolutely denied before missing rental facts',()=>{const input=passengerParentFixture();input.rentalProperties=[{form4562:input.form4562}] as TaxYearInput['rentalProperties'];reject(input);});

it('direct APIs require complete canonical NEC inventory even for a documented empty ledger',()=>{const input=passengerParentFixture();delete (input as unknown as Record<string,unknown>).form1099Nec;expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow();expect(()=>calculateScheduleE(input)).toThrow();});
it('removing the form and omitting the business argument cannot bypass a retained canonical parent proof',()=>{const input=passengerParentFixture();delete input.form4562;expect(()=>calculateScheduleC(input)).toThrow();});

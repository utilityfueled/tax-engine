/** Spec: spec/federal/schedule-c-passenger-first-year-sources.yaml. No native, paper or filing qualification. */
import Decimal from 'decimal.js';
import {PassengerAutoParentSourcesSchema,PASSENGER_PARENT_ALLOWED_EXPENSES,PASSENGER_PARENT_EXPENSE_KEYS} from '@/models/passenger-auto-parent-sources.js';
import {calculatePassengerFirstYear} from '@/engine/forms/form-4562-passenger-first-year.js';
import type {Form4562Input} from '@/models/inputs.js';
import type {ScheduleCResult} from './schedule-c.js';
const fail=(message:string):never=>{throw new Error(`Passenger Schedule C owner/activity parent sources: ${message}`);};
function record(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return fail('complete plain original records required');
 return value as Record<string,unknown>;
}
function stable(value:unknown):unknown{
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(stable);
 return Object.fromEntries(Object.entries(record(value)).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,stable(v)]));
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
// All canonical default arrays must be present, actually reviewed and empty here.
// New optional or unclassified canonical source surfaces fail closed rather than
// becoming a silently ignored second active-business income source.
const EMPTY_ARRAYS=['w2s','form1099Int','form1099Div','form1099B','form1099DA','form1099Misc','form1099G','form1099OID','formW2G','form1099K','form1099C','form1099Q','scheduleK1','scheduleK1Form1041','form1098','form1098E','form1095A','donations','rentalProperties','savingsBondRedemptions','form6252','form8814','homeSales','form8824'] as const;
const ACTIVE_KEYS=new Set<string>(['taxpayer','scheduleC','form4562','form1099Nec',...EMPTY_ARRAYS]);
export function calculateScheduleCPassengerSources(input:unknown,business:unknown){
 const i=record(input),b=business===undefined?undefined:record(business),form=i.form4562===undefined?undefined:record(i.form4562);
 const facts=b?.sourceFacts===undefined?undefined:record(b.sourceFacts);
 const canonicalBusiness=i.scheduleC&&typeof i.scheduleC==='object'&&!Array.isArray(i.scheduleC)?i.scheduleC as Record<string,unknown>:undefined;
 const canonicalFacts=canonicalBusiness?.sourceFacts&&typeof canonicalBusiness.sourceFacts==='object'&&!Array.isArray(canonicalBusiness.sourceFacts)?canonicalBusiness.sourceFacts as Record<string,unknown>:undefined;
 const packet=form?.passengerFirstYearSources,proof=facts?.passengerFirstYear;
 if(packet===undefined&&proof===undefined&&canonicalFacts?.passengerFirstYear===undefined)return undefined;
 if(packet===undefined||proof===undefined||!b||!facts||!form)return fail('complete original business, form and parent packet required');
 const parsed=PassengerAutoParentSourcesSchema.safeParse(proof);
 if(!parsed.success)return fail('complete documentary amounts and classifications required');
 const p=parsed.data;
 if(p.confirmed!==true)return fail('original sources must be actually confirmed');
 for(const [key,value] of Object.entries(i))if(value!==undefined&&!ACTIVE_KEYS.has(key))fail('other or unclassified canonical source requires its separate income method');
 for(const key of EMPTY_ARRAYS)if(!Array.isArray(i[key])||i[key].length!==0)fail('complete reviewed no-other-income canonical context required');
 if(!Array.isArray(i.form1099Nec))return fail('complete original NEC inventory required');
 const taxpayer=record(i.taxpayer);
 if(taxpayer.taxYear!==2026||taxpayer.filingStatus!=='single'||taxpayer.spouse!==undefined||b.accountHolder!=='primary'||b.accountingMethod!=='cash'||b.allInvestmentAtRisk!==true||b.qbiMateriallyParticipated!==true)return fail('finite actual2026single primary cash active business required');
 if(!equal(taxpayer,p.originalTaxpayer))fail('original taxpayer or owner changed');
 if(!equal(i.scheduleC,b))fail('actual parent business is missing or different');
 const {passengerFirstYear:_self,...otherFacts}=facts;void _self;
 const actualBusiness={...b,sourceFacts:otherFacts};
 if(!equal(actualBusiness,p.originalBusiness)||!equal(form,p.originalForm))fail('original business or form changed');
 if(!Array.isArray(form.assets)||form.assets.length!==1||form.amortizableAssets!==undefined&&(!Array.isArray(form.amortizableAssets)||form.amortizableAssets.length!==0))return fail('one sole original asset required');
 if(facts.depreciation!==undefined||facts.amortization!==undefined||facts.interest!==undefined||facts.ordinaryExpenses!==undefined||b.homeOffice!==undefined||b.otherExpenseDescription!==undefined)return fail('competing expense or attribution method unsupported');
 if(typeof b.principalBusinessActivity!=='string'||!b.principalBusinessActivity.trim()||typeof b.businessCode!=='string'||!/^\d{6}$/.test(b.businessCode))return fail('actual service business identity required');
 // Identity/address are also validated by the existing Schedule C source helper;
 // canonical/direct-E admission must enforce those same facts before it returns.
 const owner=record(taxpayer.primary);
 if(facts.sourceTaxYear!==2026||facts.sourceFactsConfirmed!==true||facts.accountHolder!=='primary'||facts.ownerName!==`${owner.firstName} ${owner.lastName}`||typeof facts.sourceReference!=='string'||!facts.sourceReference.trim())return fail('complete actual owner and business source identity required');
 if(facts.businessNameStatus==='reported'){
  if(typeof facts.businessName!=='string'||!facts.businessName.trim()||facts.businessName!==b.businessName)fail('reported business name changed');
 }else if(facts.businessNameStatus!=='blank_original'||facts.businessName!==undefined&&facts.businessName!==''||b.businessName!==undefined&&b.businessName!=='')fail('business name blank versus unknown required');
 if(facts.businessEINStatus==='reported'){
  if(typeof facts.businessEIN!=='string'||!/^\d{2}-?\d{7}$/.test(facts.businessEIN)||facts.businessEIN!==b.ein)fail('reported business EIN changed');
 }else if(facts.businessEINStatus!=='not_issued'||facts.businessEIN!==undefined&&facts.businessEIN!==''||b.ein!==undefined&&b.ein!=='')fail('actual unissued EIN versus unknown required');
 const address=record(facts.address);
 if(address.method==='home_at_return_address'){
  if(address.homeAtReturnAddressConfirmed!==true||!equal(address.homeReturnAddress,taxpayer.address)||['street','city','state','zip','unit'].some(key=>address[key]!==undefined&&address[key]!==''))fail('actual home business address changed');
 }else if(address.method==='separate_business_address'){
  for(const key of ['street','city','state','zip'])if(typeof address[key]!=='string'||!(address[key] as string).trim())fail('complete actual separate business address required');
  if(!/^[A-Z]{2}$/.test(String(address.state))||!/^\d{5}(?:-\d{4})?$/.test(String(address.zip))||address.homeAtReturnAddressConfirmed===true||address.homeReturnAddress!==undefined)return fail('actual separate business address conflicts');
  if(address.unitStatus==='reported'){if(typeof address.unit!=='string'||!address.unit.trim())fail('actual reported unit required');}
  else if(address.unitStatus!=='blank_original'||address.unit!==undefined&&address.unit!=='')fail('actual blank unit versus unknown required');
 }else fail('actual business address required');
 const Exact=Decimal.clone({precision:256,rounding:Decimal.ROUND_HALF_UP});
 const amount=(value:unknown):Decimal=>{if(typeof value!=='string'||value.length>100||!/^\d+(\.\d+)?$/.test(value))return fail('actual finite nonnegative source amount required');return new Exact(value);};
 const exp=record(b.expenses),original=p.amounts;
 for(const key of Object.keys(exp))if(!(PASSENGER_PARENT_EXPENSE_KEYS as readonly string[]).includes(key))fail('unclassified actual expense requires a separate method');
 for(const key of ['grossReceipts','returnsAndAllowances','costOfGoodsSold','otherIncome'] as const)if(!amount(b[key]).eq(amount(original[key])))fail('actual annual ledger and canonical income disagree');
 for(const key of ['returnsAndAllowances','costOfGoodsSold','otherIncome'] as const)if(!amount(b[key]).isZero())fail('non-service or inventory income unsupported');
 for(const key of ['w2WagesPaid','ubiaQualifiedProperty'])if(!amount(b[key]).isZero())fail('other wage or capital limitation method unsupported');
 let operatingExpenses=new Exact(0);
 for(const key of PASSENGER_PARENT_EXPENSE_KEYS){
  const actual=amount(exp[key]);if(!actual.eq(amount(original.expenses[key])))fail('actual expense and original ledger disagree');
  if((PASSENGER_PARENT_ALLOWED_EXPENSES as readonly string[]).includes(key))operatingExpenses=operatingExpenses.plus(actual);
  else if(!actual.isZero())fail('other expense method or duplicate depreciation unsupported');
 }
 if(new Set(p.expenseClassifications.map(row=>row.category)).size!==6)return fail('all six unique original expense classifications required');
 if(p.necRows.length!==i.form1099Nec.length)return fail('complete original NEC coverage required');
 const indices=new Set<number>(),references=new Set<string>(),originals=new Set<string>();let receipts=amount(p.nonNecCashReceipts);
 for(const row of p.necRows){
  if(indices.has(row.index)||row.index>=i.form1099Nec.length||references.has(row.sourceReference))fail('unique original NEC coverage required');
  indices.add(row.index);references.add(row.sourceReference);
  const nec=record(i.form1099Nec[row.index]);
  if(!equal(nec,row.originalRecord)||nec.taxYear!==2026||nec.accountHolder!=='primary'||nec.cashTips!==undefined&&!amount(nec.cashTips).isZero()||nec.qualifiedOvertimeCompensation!==undefined&&!amount(nec.qualifiedOvertimeCompensation).isZero()||nec.treasuryTippedOccupationCodes!==undefined)return fail('actual same-business cash service NEC sources required');
  const originalIdentity=JSON.stringify(stable(nec));if(originals.has(originalIdentity))fail('indistinguishable duplicate NEC originals require their separate reconciled method');originals.add(originalIdentity);
  receipts=receipts.plus(amount(nec.nonemployeeCompensation));
 }
 if(!receipts.eq(amount(original.grossReceipts)))fail('actual NEC and non-NEC ledger receipts do not reconcile once');
 const completed=calculatePassengerFirstYear(form as Form4562Input,2026),section179=new Exact(completed.line12.toString()),non179=new Exact(completed.line22.toString()).minus(section179);
 const preDepreciationProfit=receipts.minus(operatingExpenses),rawActiveIncome=preDepreciationProfit.minus(non179),incomeLimit=Exact.max(0,rawActiveIncome);
 const actualPartI=record(record(packet).partI);
 if(!amount(actualPartI.businessIncomeLimit).eq(incomeLimit)||!amount(form.section179BusinessIncomeLimit).eq(incomeLimit)||section179.gt(incomeLimit))fail('actual parent raw business income does not reconcile to completed PartI');
 const totalExpenses=operatingExpenses.plus(new Exact(completed.line22.toString())),netProfit=receipts.minus(totalExpenses);
 if(netProfit.lt(0))fail('negative parent profit requires actual loss and at-risk method');
 return {receipts,operatingExpenses,preDepreciationProfit,non179,incomeLimit,totalExpenses,netProfit,completed,expenseAmounts:original.expenses};
}
export type ScheduleCPassengerSources=NonNullable<ReturnType<typeof calculateScheduleCPassengerSources>>;
/** Check actual returned money/lines, not merely a caller-supplied digest or status. */
export function assertScheduleCPassengerResult(source:ScheduleCPassengerSources,result:ScheduleCResult,sourceCommitment:string){
 const expected:Record<string,Decimal>={Advertising:new Decimal(source.expenseAmounts.advertising),Insurance:new Decimal(source.expenseAmounts.insurance),'Legal and professional':new Decimal(source.expenseAmounts.legalAndProfessional),'Office expense':new Decimal(source.expenseAmounts.officeExpense),Supplies:new Decimal(source.expenseAmounts.supplies),Utilities:new Decimal(source.expenseAmounts.utilities),'Depreciation and section 179':source.completed.line22};
 for(const [key,value] of Object.entries(result.expenseBreakdown))if(!value.eq(expected[key]??0))fail('actual final expense breakdown does not match original parent projection');
 for(const [key,value] of Object.entries(expected))if(!result.expenseBreakdown[key]?.eq(value))fail('actual final required expense is missing');
 for(const [actual,value] of [[result.grossReceipts,source.receipts],[result.grossIncome,source.receipts],[result.depreciationAndSection179Deduction,source.completed.line22],[result.totalExpenses,source.totalExpenses],[result.tentativeProfit,source.netProfit],[result.netProfit,source.netProfit],[result.homeOfficeDeduction,new Decimal(0)]] as const)if(!actual.eq(value))fail('actual final parent money does not match original projection');
 for(const [line,value] of [['1',source.receipts],['7',source.receipts],['13',source.completed.line22],['28',source.totalExpenses],['29',source.netProfit],['30',new Decimal(0)],['31',source.netProfit]] as const){const found=result.lines.filter(row=>row.form==='Sched C'&&row.line===line);if(found.length!==1||!found[0].value.eq(value))fail('actual final parent calculation line is stale');}
 if(!result.form4562)return fail('actual completed passenger form is missing');
 for(const key of ['line1','line2','line3','line4','line5','line7','line8','line9','line10','line11','line12','line13','line14','line15','line16','line17','line19','line20','line21','line22','line25','line28','line29','line42','line43','line44','section280FRecaptureIncome'] as const){const actual=result.form4562[key],expected=source.completed[key];if(!actual||!expected||!actual.eq(expected))fail('actual returned passenger allocation is stale');}
 const commitments=result.lines.filter(row=>row.form==='Sched C'&&row.line==='actual-source-commitment');
 if(commitments.length!==1||commitments[0].inputs['Original source commitment']!==sourceCommitment)fail('actual original parent source commitment is stale');
}

/** Spec: federal/schedule-c.yaml, actual ordinary cash expense and address sources. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import type {ScheduleCResult} from './schedule-c.js';
import type {TaxYearInput,ScheduleCSourceFacts} from '@/models/inputs.js';
import {AmortizableAssetSchema} from '@/models/inputs.js';
import {calculateForm4562} from '@/engine/forms/form-4562.js';
import {AuditTrail} from '@/utils/audit.js';
import {d} from '@/utils/decimal.js';

const ordinary = ['commissionsAndFees','rentOnBusinessProperty','repairsAndMaintenance','taxes','wages','bankCharges','duesAndPublications','freight','laundryAndCleaning','managementFees','postage','telephone'] as const;
const special = ['pensionAndProfitSharing','amortization','depletion','badDebts','startupCostsDirectExpense','idcsAmortization','idcsCurrentExpensing','section179Expense'] as const;
type SourceBusiness = {accountHolder?:'primary'|'spouse'; businessName?:string;ein?:string;otherExpenseDescription?:string;accountingMethod?:'cash'|'accrual';sourceFacts?:ScheduleCSourceFacts;expenses?:object};
type SourceInput = {taxpayer:Pick<TaxYearInput['taxpayer'],'taxYear'|'filingStatus'|'primary'|'spouse'|'address'>;scheduleK1?:Array<{excessBusinessInterest?:string}>;form2555?:unknown;form4562?:TaxYearInput['form4562'];dependentCareBenefits?:TaxYearInput['dependentCareBenefits'];w2s?:unknown;form3800?:{currentYearCredits?:string;passiveActivityCredits?:string}};

/** Validate the original records; split metadata never becomes a second expense. */
export function calculateScheduleCSourceFacts(input:SourceInput,business:SourceBusiness|undefined,saved?:ScheduleCResult){
 const fail=(detail:string):never=>{throw new Error(`Schedule C actual source expense method: ${detail}`);};
 const amount=(value:string|undefined,label:string)=>{if(typeof value!=='string'||!value.trim())return fail(`${label} is unknown`);if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim()))return fail(`${label} is invalid`);let n:Decimal;try{n=new Decimal(value.trim().replace(/,/g,''));}catch{return fail(`${label} is invalid`);}if(!n.isFinite()||n.lt(0))return fail(`${label} must be finite and nonnegative`);return n;};
 const ref=(value:string|undefined,label:string)=>{if(!value?.trim())fail(`${label} source reference is unknown`);};
 const truth=(value:boolean|null|undefined,label:string)=>{if(value!==true)fail(`${label} must be actually confirmed`);};
 const exp=(business?.expenses??{}) as Partial<Record<string,string>>, proof=business?.sourceFacts;
 for(const field of special)if(!d(exp[field]).isZero())fail(`${field} requires its separate supported federal source method`);
 for(const field of ['businessInterest',...ordinary])if(!d(exp[field]).isFinite()||d(exp[field]).lt(0))fail(`${field} is not a nonnegative current expense`);
 const amortizationTotal=input.form4562?calculateForm4562(input.form4562).line44:d(0);
 const interestTotal=d(exp.businessInterest),ordinaryTotal=ordinary.reduce((s,k)=>s.plus(d(exp[k])),d(0));
 if(!proof){if(amortizationTotal.gt(0))fail('positive Form4562 amortization requires actual Schedule C asset attribution sources');if(saved?.lines.some(row=>row.line==='actual-source-commitment'))fail('saved original source proof was removed');if(!interestTotal.isZero()||!ordinaryTotal.isZero())fail('positive interest or classified ordinary expenses require complete actual sources');return undefined;}
 if(d(exp.otherExpenses).gt(0)&&!business?.otherExpenseDescription?.trim())fail('actual remaining other-expense description is unknown');
 truth(proof.sourceFactsConfirmed,'original source facts');ref(proof.sourceReference,'business');
 if(![2025,2026].includes(input.taxpayer.taxYear)||proof.sourceTaxYear!==input.taxpayer.taxYear)fail('source year does not match supported return year');
 if(business?.accountHolder==='spouse'&&input.taxpayer.filingStatus!=='married_filing_jointly')fail('spouse business source requires an actual joint return');
 if(!business?.accountHolder||proof.accountHolder!==business.accountHolder)fail('actual business owner is unknown or changed');
 const owner=business.accountHolder==='primary'?input.taxpayer.primary:input.taxpayer.spouse;
 if(!owner||proof.ownerName!==`${owner.firstName} ${owner.lastName}`)fail('actual owner identity changed');
 if(proof.businessNameStatus==='reported'){if(!proof.businessName?.trim()||proof.businessName!==business.businessName)fail('actual reported business name changed');}
 else if(proof.businessNameStatus!=='blank_original'||proof.businessName?.trim()||business.businessName?.trim())fail('business name blank versus unknown is not reconciled');
 if(proof.businessEINStatus==='reported'){if(!/^\d{2}-?\d{7}$/.test(proof.businessEIN??'')||proof.businessEIN!==business.ein)fail('actual reported business EIN changed');}
 else if(proof.businessEINStatus!=='not_issued'||proof.businessEIN?.trim()||business.ein?.trim())fail('actual unissued EIN versus unknown is not reconciled');
 if((!interestTotal.isZero()||!ordinaryTotal.isZero())&&business.accountingMethod!=='cash')fail('this finite current expense source method requires actual cash accounting');
 let mortgage=d(0),vehicle=d(0),other=d(0);const rowAmounts:Record<string,Decimal>={};let partV=d(0);
 const interest=proof.interest;
 if(interest||!interestTotal.isZero()){
  if(!interest)return fail('interest sources missing');const p=interest;ref(p.sourceReference,'interest');
  mortgage=amount(p.mortgageInterest,'mortgage interest');vehicle=amount(p.vehicleLoanInterest,'vehicle loan interest');other=amount(p.otherInterest,'other interest');
  if(!mortgage.plus(vehicle).plus(other).eq(interestTotal))fail('interest split does not reconcile exactly with aggregate expense');
  for(const key of ['allInterestOrdinaryCurrentCashBusinessOnlyConfirmed','noCapitalizedPrepaidRelatedPartyOrForeignInterestConfirmed','noPersonalOrSchedule1AInterestConfirmed','notDeductedElsewhereConfirmed'] as const)truth(p[key],key);
  if(mortgage.gt(0))truth(p.mortgageBank1098OrSimilarStatementConfirmed,'mortgage bank and actual1098 or similar statement classification');
  if(!amount(p.otherExpensesExcludingInterest,'remaining noninterest expenses').eq(d(exp.otherExpenses)))fail('remaining other expenses do not reconcile');ref(p.otherExpenseSourceReference,'remaining noninterest expenses');
  if(interestTotal.gt(0)){
   if(input.form2555)fail('foreign interest composition requires a separate source allocation method');
   const g=p.grossReceiptsException;if(!g)return fail('interest gross receipts exception is unknown');
   for(const k of ['allAggregationAndPassThroughSharesIncludedConfirmed','notTaxShelterConfirmed','noPriorDisallowedInterestOrPartnershipEbieConfirmed'] as const)truth(g[k],k);
   if(input.scheduleK1?.some(k=>!d(k.excessBusinessInterest).isZero()))fail('partnership excess business interest requires a separate method');
   const history=g.history;if(history?.length!==3)return fail('three full-year aggregate gross receipts sources are required');let total=d(0);const years=new Set<number>();
   for(const row of history){if(row.taxYear===undefined||row.taxYear<input.taxpayer.taxYear-3||row.taxYear>=input.taxpayer.taxYear||years.has(row.taxYear))fail('gross receipts history years are missing, duplicated or stale');years.add(row.taxYear as number);truth(row.fullTaxYearConfirmed,'full taxable year receipts');ref(row.sourceReference,'gross receipts');total=total.plus(amount(row.grossReceipts,'aggregate gross receipts'));}
   const threshold=input.taxpayer.taxYear===2025?'31000000':'32000000';if(total.gt(d(threshold).times(3)))fail('aggregate gross receipts exceed the actual source-year interest exception');
  }
 }
 const ordinaryProof=proof.ordinaryExpenses;
 if(ordinaryProof||ordinaryTotal.gt(0)){
  if(!ordinaryProof)return fail('ordinary expense classifications are unknown');const p=ordinaryProof;truth(p.sourceFactsConfirmed,'ordinary source facts');ref(p.sourceReference,'ordinary expenses');
  for(const k of ['allCurrentCashBusinessOnlyConfirmed','notCapitalizedInventoryOrDeductedElsewhereConfirmed','rentExcludesHomeVehiclesPrepaidAndCapitalAcquisitionConfirmed','repairsExcludeCapitalImprovementsConfirmed','taxesExcludeIncomeSelfEmploymentCollectedSalesPenaltiesAndAssessmentsConfirmed','wagesAreNonownerEmployeesWithoutEmploymentCreditsConfirmed'] as const)truth(p[k],k);
  ref(p.remainingOtherExpenseSourceReference,'remaining other expenses');if(!amount(p.remainingOtherExpenses,'remaining other expenses').eq(d(exp.otherExpenses)))fail('ordinary remaining expenses do not reconcile');
  const rows=p.rows;if(!rows?.length)return fail('ordinary expense rows are unknown');
  for(const row of rows){if(!ordinary.includes(row.category as typeof ordinary[number])||!row.category||rowAmounts[row.category])fail('ordinary expense source category is unsupported or duplicated');ref(row.sourceReference,'ordinary expense row');truth(row.sourceFactsConfirmed,'ordinary expense row');const key=row.category;if(!key)return fail('ordinary source row category is missing');const value=amount(row.amount,'ordinary expense row');if(!value.eq(d(exp[key])))fail('ordinary expense row differs from actual canonical amount');rowAmounts[key]=value;}
  for(const key of ordinary)if(d(exp[key]).gt(0)&&!rowAmounts[key])fail(`${key} source row is missing`);
  for(const key of ordinary.slice(5))partV=partV.plus(rowAmounts[key]??d(0));
  if(d(exp.wages).gt(0)&&(d(input.form3800?.currentYearCredits).gt(0)||d(input.form3800?.passiveActivityCredits).gt(0)))fail('employee wages with business credit reductions require a separate source method');
 }

 const amortization=proof.amortization;
 if(amortization||amortizationTotal.gt(0)){
  if(!amortization)return fail('positive Form4562 amortization requires actual Schedule C asset sources');const p=amortization;
  truth(p.sourceFactsConfirmed,'amortization original source facts');ref(p.sourceReference,'amortization');
  for(const key of ['fullCalendarYearConfirmed','allAssetsForThisScheduleCConfirmed','notDeductedElsewhereConfirmed'] as const)truth(p[key],key);
  if(p.sourceTaxYear!==input.taxpayer.taxYear||input.form4562?.taxYear!==input.taxpayer.taxYear)fail('amortization actual Form4562 source year is unknown or different');
  if(business.accountingMethod!=='cash')fail('finite actual acquired-goodwill amortization source requires cash business');
  if(input.form2555)fail('foreign amortization allocation requires its separate source method');
  if(!amount(p.remainingOtherExpenses,'remaining nonamortization other expenses').eq(d(exp.otherExpenses)))fail('amortization remaining other expense sources do not reconcile');ref(p.remainingOtherExpenseSourceReference,'remaining nonamortization other expenses');
  const assets=input.form4562?.amortizableAssets,rows=p.rows;
  if(!assets?.length||rows?.length!==assets.length)return fail('amortization requires complete unique original per-asset sources; summary alone is unsupported');
  if(!d(input.form4562?.currentYearAmortization).isZero()||!d(input.form4562?.priorYearAmortization).isZero())fail('amortization per-asset sources contradict a separate summary method');
  const indices=new Set<number>(),originals=new Set<string>();
  const ordered=(v:unknown):unknown=>Array.isArray(v)?v.map(ordered):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,ordered(x)])):v;
  const date=(v:string|undefined,label:string):string=>{if(!v||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)return fail(`actual amortization ${label} date is unknown or invalid`);return v;};
  let actualBusinessStart:string|undefined;
  for(const row of rows){
   const index=row.assetIndex;if(index===undefined||!Number.isInteger(index)||index<0||index>=assets.length||indices.has(index))return fail('amortization original asset coverage is invalid or duplicated');indices.add(index);
   ref(row.sourceReference,'amortization asset');truth(row.sourceFactsConfirmed,'amortization asset original');if(row.accountHolder!==business.accountHolder)fail('amortization asset owner or actual business attribution is unknown or different');
   for(const key of ['acquiredGoodwillForThisBusinessConfirmed','armsLengthTaxableCashPurchaseAfter1993Confirmed','noSelfCreatedRelatedPartyAntiChurningForeignLeaseOrDispositionConfirmed','fullBusinessUseConfirmed'] as const)truth(row[key],key);
   const actual=AmortizableAssetSchema.strict().safeParse(assets[index]),original=AmortizableAssetSchema.strict().safeParse(row.originalAsset);
   if(!actual.success||!original.success||JSON.stringify(ordered(actual.data))!==JSON.stringify(ordered(original.data)))return fail('amortization actual original asset snapshot is missing or different');
   const asset=actual.data;if(asset.codeSection!=='197'||(asset.amortizationPeriodMonths!==undefined&&asset.amortizationPeriodMonths!==180))fail('amortization source requires the separately supported statutory Section197 method');
   const description=asset.description?.trim();if(!description)return fail('actual amortization asset description is unknown');const basis=amount(asset.amortizableAmount,'actual acquired-goodwill basis');
   const acquired=date(row.acquisitionDate,'acquisition'),started=date(row.businessStartDate,'business start');if(actualBusinessStart!==undefined&&actualBusinessStart!==started)fail('amortization assets contradict the one actual business start date');actualBusinessStart=started;if(acquired<'1994-01-01')fail('amortization pre1994 acquisition requires its anti-churning source method');const begin=acquired>started?acquired:started;
   if(asset.dateAmortizationBegins.length===10)date(asset.dateAmortizationBegins,'original declared start');if(begin.slice(0,4)!==String(input.taxpayer.taxYear)||asset.dateAmortizationBegins.slice(0,7)!==begin.slice(0,7))fail('amortization current start does not match later actual acquisition and business-start sources');
   const identity=JSON.stringify([description.replace(/\s+/g,' ').toLowerCase(),basis.toString(),begin.slice(0,7),'197',180]);if(originals.has(identity))fail('amortization duplicates an indistinguishable original asset');originals.add(identity);
  }
  if(p.reclassification){const r=p.reclassification;ref(r.sourceReference,'amortization reclassification');const old=amount(r.originalOtherExpenses,'original other expenses before amortization reclassification'),included=amount(r.amortizationAlreadyIncluded,'amortization already included'),remaining=amount(r.remainingOtherExpenses,'remaining nonamortization other expenses');if(!old.eq(included.plus(remaining))||!remaining.eq(d(exp.otherExpenses))||included.gt(amortizationTotal))fail('actual amortization reclassification is not conserved');if(included.gt(0)&&interest?.reclassification)fail('simultaneous historical interest and amortization reclassification requires its coherent original ledger method');}
  partV=partV.plus(amortizationTotal);
 }
 if(interest?.reclassification){const r=interest.reclassification;ref(r.sourceReference,'expense reclassification');const old=amount(r.originalOtherExpenses,'original other expenses'),i=amount(r.interestAlreadyIncluded,'interest already included'),o=amount(r.ordinaryExpensesAlreadyIncluded,'ordinary expenses already included'),remaining=amount(r.remainingOtherExpenses,'remaining other expenses');if(!old.eq(i.plus(o).plus(remaining))||!remaining.eq(d(exp.otherExpenses))||i.gt(interestTotal)||o.gt(ordinaryTotal))fail('actual expense reclassification is not conserved');}
 if(!proof.address)fail('actual business address or confirmed home omission source is unknown');
 let address:ScheduleCSourceFacts['address'];
 if(proof.address){address=proof.address;const a=address;
  if(a.method==='separate_business_address'){for(const [name,value] of Object.entries({street:a.street,city:a.city,state:a.state,zip:a.zip}))if(!value?.trim())fail(`actual business address ${name} is unknown`);if(!/^[A-Z]{2}$/.test(a.state??'')||!/^\d{5}(?:-\d{4})?$/.test(a.zip??''))fail('actual business address state or ZIP is invalid');if(a.unitStatus==='reported'){if(!a.unit?.trim())fail('reported business unit is unknown');}else if(a.unitStatus!=='blank_original'||a.unit?.trim())fail('business unit blank versus unknown is not reconciled');if(a.homeAtReturnAddressConfirmed===true||a.homeReturnAddress)fail('separate and home business address sources contradict');}
  else if(a.method==='home_at_return_address'){truth(a.homeAtReturnAddressConfirmed,'business actually conducted at the return home address');if(!a.homeReturnAddress||['street','city','state','zip','apt'].some(k=>(a.homeReturnAddress as unknown as Record<string,unknown>)[k] !== (input.taxpayer.address as unknown as Record<string,unknown>)[k]))fail('actual return home address source changed or is unknown');if([a.street,a.city,a.state,a.zip,a.unit].some(v=>!!v?.trim()))fail('home omission and separate address fields contradict');}
  else fail('business address source method is unknown');
 }
 const stable=(v:unknown,key=''):unknown=>{if(typeof v==='string'&&/(?:ssn(?:last4)?|tin|taxid|taxpayerIdLast4|accountReference)$/i.test(key))return '';if(Array.isArray(v))return v.map(x=>stable(x));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,stable(x,k)]));return v;};
 const commitment=bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable({taxpayer:input.taxpayer,business,partnershipInterest:input.scheduleK1?.map(k=>k.excessBusinessInterest),businessCredits:input.form3800,form4562:input.form4562,dependentCareBenefits:input.dependentCareBenefits,careW2Sources:input.dependentCareBenefits?input.w2s:undefined})))));
 if(saved){
  const rows=saved.lines.filter(row=>row.line==='actual-source-commitment');if(rows.length!==1||rows[0].inputs['Original source commitment']!==commitment)fail('saved original source commitment is stale');
  const expected:Array<[string,Decimal]>=[['10',rowAmounts.commissionsAndFees??d(0)],['20b',rowAmounts.rentOnBusinessProperty??d(0)],['21',rowAmounts.repairsAndMaintenance??d(0)],['23',rowAmounts.taxes??d(0)],['26',rowAmounts.wages??d(0)],['27b',d(exp.otherExpenses).plus(partV)]];
  if(interest)expected.push(['16a',mortgage],['16b',input.taxpayer.taxYear===2026?vehicle:vehicle.plus(other)],...(input.taxpayer.taxYear===2026?[['16c',other] as [string,Decimal]]:[]));
  for(const [line,value] of expected){const found=saved.lines.filter(row=>row.form==='Sched C'&&row.line===line);if(found.length!==1||!found[0].value.eq(value))fail('saved source expense calculation is stale');}
  for(const [label,key] of [['Commissions and fees','commissionsAndFees'],['Rent of business property','rentOnBusinessProperty'],['Repairs and maintenance','repairsAndMaintenance'],['Taxes and licenses','taxes'],['Wages','wages']] as const)if(!saved.expenseBreakdown[label]?.eq(rowAmounts[key]??d(0)))fail('saved source expense breakdown is stale');
  if(!saved.expenseBreakdown['Other expenses']?.eq(d(exp.otherExpenses).plus(partV))||(interest&&!saved.expenseBreakdown['Business interest']?.eq(interestTotal)))fail('saved interest or remaining other expense is stale');
 }
 const audit=new AuditTrail();audit.record('Sched C','actual-source-commitment','Actual expense and business address original source commitment',d(0),'Exact original source reconciliation; structured personal identifiers normalized for permitted review redaction',{'Original source commitment':commitment});
 return {mortgage,vehicle,other,interestTotal,rowAmounts,partV,amortizationTotal,address,commitment,lines:audit.getLines()};
}

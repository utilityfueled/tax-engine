/** Spec: state/oh-business-part-year-header.yaml. NEW fictional originals, never patched old captures. */
import type {TaxYearInput} from '@/models/inputs';
import {TaxYearInputSchema} from '@/models/inputs';
import {ohioNrcCategories} from '@/models/ohio-residency';
import type {OhioReturnHeaderSources} from '@/models/ohio-return-header-sources';
import {buildTaxInputFromGuidedData} from '../../apps/web/src/lib/guided-interview-bridge';
import {emptyOhioBusinessDraft,confirmGuidedOhioBusinessFacts} from '../../apps/web/src/lib/guided-ohio-business-facts';
import {emptyOhioResidencyOwner,confirmGuidedOhioResidencyFacts,type OhioResidencyDraft} from '../../apps/web/src/lib/guided-ohio-residency-facts';
import {emptyOhioPaymentDraft,confirmGuidedOhioPaymentFacts} from '../../apps/web/src/lib/guided-ohio-payment-facts';
import {type OhioReturnHeaderDraft} from '../../apps/web/src/lib/guided-ohio-return-header-sources';
import {buildGuidedStateOriginals} from '../../apps/web/src/lib/guided-state-engine-inputs';
import {startCompleteInterview,completeBusinessSection} from '../guided-interview/complete-facts';
import {businessPaperCases,businessPaperCells,businessPhysicalGroupSources,businessPaperWeightStrikeRegions} from './oh-business-official-review';
import {ohioHeaderLabels as L} from './oh-return-header-sources';
export function julyRequired<T>(value:T|null|undefined):T{if(value==null)throw Error('Separately authored July business source required');return value;}
export const julyCases=[
 {name:'july100k',profit:'100000',halfSE:'7065',AGI:'92935',BID:'92935',OhioAGI:'0',taxable:'0',tax:'0',NRC:'0',ratio:'0.0000',apportioned:'31250',ohioBenefit:'25000',oldName:'nr100k'},
 {name:'july400k',profit:'400000',halfSE:'16275',AGI:'383725',BID:'250000',OhioAGI:'133725',taxable:'131825',tax:'3955',NRC:'3955',ratio:'1.0000',apportioned:'125000',ohioBenefit:'100000',oldName:'nr400k'},
]as const;
export type JulyCase=typeof julyCases[number];
export const julyIdentity={firstName:'Avery',lastName:'JulyBusiness',ssn:'900-74-0421',dateOfBirth:'1990-01-15'};
export const julyAddress={street:'825 FICTIONAL JULY RESIDENCE LANE',city:'Columbus',state:'OH',zip:'43215'};
export const julyPlans={'oh-it-1040-review.pdf':2,'oh-it-nrc-review.pdf':3,'oh-schedule-business-income-review.pdf':2,'oh-schedule-adjustments-review.pdf':2,'oh-schedule-credits-review.pdf':2}as const;
/** Constructs unconfirmed entered originals from new facts; only actual confirm APIs create captures. */
export function julyNativeFixture(c:JulyCase=julyRequired(julyCases[0]),activityDescription='Fictional July Ordinary Services'){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:[],stateCode:'OH'});
 const personal=julyRequired(state.sectionData['personal-info']);Object.assign(personal,{...julyIdentity,addressLine1:'100 FICTIONAL JULY SOURCE STREET',city:'Richmond',state:'VA',zip:'23219',stateResidency:'part-year'});
 state.sectionData['income-self-employment']={...structuredClone(completeBusinessSection),manualGrossReceipts:c.profit,businessFacts:{...structuredClone(completeBusinessSection.businessFacts),businessName:'Fictional July Ordinary Services',activityDescription,businessCode:'541990',ein:'90-7400421'}};
 const input=TaxYearInputSchema.parse(julyRequired(buildTaxInputFromGuidedData(state)));
 const entered=emptyOhioBusinessDraft(),row=julyRequired(entered.facts.businesses[0]);
 Object.assign(entered,{taxYear:'2025',sourceReference:'PRIVATE-JULY212-CANONICAL-2025',sourceFactsConfirmed:null,allFederalDeductionSourcesIncludedConfirmed:true});
 Object.assign(entered.facts,{taxYear:'2025',sourceReference:'PRIVATE-JULY212-ANNUAL-BUSINESS-2025',sourceFactsConfirmed:true,allBusinessesIncludedConfirmed:true,noOtherBusinessIncomeOrAdjustmentsConfirmed:true,noFullYearResidentBusinessOwnersConfirmed:true});
 Object.assign(row,{businessSourceId:'PRIVATE-JULY212-C-2025',accountHolder:'primary',ownerResidencyStatus:'part_year_resident',sourceTaxYear:'2025',sourceReference:'PRIVATE-JULY212-CURRENT-C-2025',sourceFactsConfirmed:true,ordinarySoleProprietorshipConfirmed:true,fullCalendarYearBusinessConfirmed:true,noLowerTierEntitiesConfirmed:true,noSpecialIndustryOrAlternativeAllocationConfirmed:true,noSpecialBusinessSaleConfirmed:true,noOhioDepreciationAdjustmentsConfirmed:true,noOtherBusinessIncomeOrAdjustmentsConfirmed:true});
 row.property={sourceReference:'PRIVATE-JULY212-ANNUAL-PROPERTY-2025',originalCostAndStatutoryExclusionsConfirmed:true,ownedBeginning:{ohio:'10000',everywhere:'20000'},ownedEnd:{ohio:'10000',everywhere:'20000'},annualRent:{ohio:'0',everywhere:'0'},annualSubrent:{ohio:'0',everywhere:'0'},fullYearUnchangedRentalConfirmed:true};
 row.payroll={ohio:'0',everywhere:'0',sourceReference:'PRIVATE-JULY212-COMPLETE-ZERO-PAYROLL-2025',qualifyingEmployeeCompensationConfirmed:true,noResearchOrSpecialIndustryPayrollConfirmed:true};
 const invoice={receiptId:'PRIVATE-JULY212-INVOICE-2025',sourceReference:'PRIVATE-JULY212-SEP-NOV-SERVICES-CASH-DEC15-2025',grossReceipt:c.profit,ohioBenefitReceipt:c.ohioBenefit,purchaserBenefitSitusingConfirmed:true};
 row.sales={sourceReference:'PRIVATE-JULY212-COMPLETE-ANNUAL-RECEIPTS-2025',allReceiptsIncludedConfirmed:true,noDuplicateReceiptSourcesConfirmed:true,ordinaryServicesAndStatutoryExclusionsConfirmed:true,rows:[structuredClone(invoice)]};
 entered.receiptOriginals=[{...invoice,accountHolder:'primary',sourceTaxYear:'2025',date:'2025-12-15',originalDocumentId:'PRIVATE-JULY212-RECEIPT-2025',currentUncorrectedNonvoidConfirmed:true}];
 entered.federalDeductionSources=[{deductionId:'PRIVATE-JULY212-HALF-SE-2025',accountHolder:'primary',sourceTaxYear:'2025',deductionKind:'deductible_half_se_tax',sourceReference:'PRIVATE-JULY212-PERSONAL-ACCRUAL-2025',original:{documentId:'PRIVATE-JULY212-PERSONAL-SE-2025',documentType:'personal_federal_deduction_workpaper',accountHolder:'primary',sourceTaxYear:'2025',amount:c.halfSE,date:'2025-12-31',paidOrAccrued:'accrued',sourceReference:'PRIVATE-JULY212-PERSONAL-ACCRUAL-2025',allUnderlyingDeductionAccrualsIncludedConfirmed:true,description:'Fictional complete personal deduction accrual December31 outside Ohio domicile; actual source fact, not a default or calendar proration.'}}];
 const business=confirmGuidedOhioBusinessFacts(input,entered),owner=emptyOhioResidencyOwner('primary');
 owner.status='part_year_resident';owner.sourceReference='PRIVATE-JULY212-DOMICILE-AND-AUG01-VA-MOVE-2025';owner.periods=[{from:'2025-01-01',to:'2025-07-31',domicileState:'OH'},{from:'2025-08-01',to:'2025-12-31',domicileState:'VA'}];
 owner.amounts=Object.fromEntries(ohioNrcCategories.map(category=>[category,{federalAmount:category==='federalAdjustments'?c.halfSE:'0',residentAmount:'0',nonresidentOhioAmount:'0',sourceReference:`PRIVATE-JULY212-ACTUAL-${category}-2025`}]))as NonNullable<typeof owner.amounts>;owner.stateAdditions=[];owner.stateDeductions=[];
 const enteredResidency:OhioResidencyDraft={taxYear:'2025',sourceReference:'PRIVATE-JULY212-COMPLETE-OWNER-SOURCES-2025',sourceFactsConfirmed:null,allFederalSourcesIncludedConfirmed:true,noBusinessIncomeConfirmed:false,schoolDistrictStatus:'no_ohio_taxing_district_residency',businessSources:business,owners:[owner]};
 const residency=confirmGuidedOhioResidencyFacts(input,enteredResidency);
 const paymentEntered=structuredClone(emptyOhioPaymentDraft);Object.assign(paymentEntered,{taxYear:'2025',sourceReference:'PRIVATE-JULY212-COMPLETE-CURRENT-ACCOUNT-2025',sourceFactsConfirmed:null,calendarYearConfirmed:true,allPaymentsIncludedConfirmed:true,paymentRows:[],priorReturn:{status:'no_return',sourceReference:'PRIVATE-JULY212-PRIOR-ACCOUNT-NO-RETURN'},priorCreditCarryforward:{status:'none',sourceReference:'PRIVATE-JULY212-NO-PRIOR-CARRY'},remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'PRIVATE-JULY212-INDEPENDENT-ZERO-PRINCIPAL',sourceFactsConfirmed:true},currentTiming:{kind:'expected',expectedDate:'2026-04-15',asOfDate:'2026-04-01'},filingExtension:{kind:'none'},paymentExtension:{kind:'none'},returnKind:'original',specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'},balanceFacts:{sourceReference:'PRIVATE-JULY212-COMPLETE-ZERO-CASH-FACTS',useTax:'0',outgoingCarryforward:'0',donations:'0'}});
 const payments=confirmGuidedOhioPaymentFacts(input,paymentEntered);state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments};
 const canonical=buildGuidedStateOriginals(input,state);const facts=julyRequired(canonical.ohioResidency),paid=julyRequired(canonical.ohioPayments);
 return{state,input,residency,payments,business,canonical,facts,paid,entered};
}
/** Direct actual-source packet: snapshots of the already explicitly confirmed current parents, not read-time repair. */
export function julyHeaderPacket(c:JulyCase=julyRequired(julyCases[0]),activityDescription='Fictional July Ordinary Services'){
 const f=julyNativeFixture(c,activityDescription);
 const header:OhioReturnHeaderSources={taxYear:2025,sourceReference:'PRIVATE-JULY212-HEADER-2025',asOfDate:'2026-04-01',sourceFactsConfirmed:true,owner:{accountHolder:'primary',originalTaxpayer:structuredClone(julyIdentity)},originalFederalSources:structuredClone(f.input),originalOhioResidencySources:structuredClone(f.facts),originalOhioPaymentSources:structuredClone(f.paid),residence:{sourceReference:'PRIVATE-JULY212-RESIDENCE-2025',originalAddress:structuredClone(julyAddress),periods:[{from:'2025-01-01',through:'2025-07-31',sourceReference:'PRIVATE-JULY212-ACTUAL-OH-RESIDENCE'}],allOhioResidentialPeriodsIncludedConfirmed:true},finderOriginal:{sourceReference:'PRIVATE-JULY212-FINDER-2025',taxYear:2025,lookupDate:'2026-03-20',originalAddress:structuredClone(julyAddress),districtCode:'2503',districtName:'Columbus CSD',countyName:'Franklin',schoolIncomeTax:'none',officialResultMatchedConfirmed:true},countyOriginal:{sourceReference:'PRIVATE-JULY212-COUNTY-2025',taxYear:2025,recordDate:'2026-01-15',originalAddress:structuredClone(julyAddress),countyName:'Franklin'},officialInventoryOriginal:{sourceReference:'PRIVATE-JULY212-OFFICIAL-BOOKLET-ROW',taxYear:2025,publication:'ohio_2025_it1040_booklet',publicationSha256:'931b21e7484ba96e561cf2346d8a7d2a8005bd990724b5903c9a90acede5f50e',printedPage:50,districtCode:'2503',districtName:'Columbus CSD',rateDisplay:'-',taxBaseDisplay:'-',officialRowReviewedConfirmed:true}};
 const input:TaxYearInput={...structuredClone(f.canonical),ohioReturnHeaderSources:structuredClone(header)};return{...f,header,withHeader:input};
}
export function julyEnteredHeader():OhioReturnHeaderDraft{
 const h=julyHeaderPacket().header;
 return{...structuredClone(h),taxYear:'2025',sourceFactsConfirmed:null,originalFederalSources:undefined,originalOhioResidencySources:undefined,originalOhioPaymentSources:undefined,confirmedHeaderSources:undefined,finderOriginal:{...h.finderOriginal,taxYear:'2025'},countyOriginal:{...h.countyOriginal,taxYear:'2025'},officialInventoryOriginal:{...h.officialInventoryOriginal,taxYear:'2025',printedPage:'50'}};
}
export function julyHeaderNativeFields(){const h=julyHeaderPacket().header;return[
 [L.taxYear,'2025'],[L.source,h.sourceReference],[L.asOf,h.asOfDate],[L.owner,'primary'],[L.firstName,'Avery'],[L.lastName,'JulyBusiness'],[L.ssn,'900-74-0421'],[L.birth,'1990-01-15'],[L.residenceSource,h.residence.sourceReference],[L.periodSource,'PRIVATE-JULY212-ACTUAL-OH-RESIDENCE'],[L.from,'2025-01-01'],[L.through,'2025-07-31'],[L.complete,'true'],[L.street,julyAddress.street],[L.city,'Columbus'],[L.state,'OH'],[L.zip,'43215'],[L.finderSource,h.finderOriginal.sourceReference],[L.finderYear,'2025'],[L.finderDate,'2026-03-20'],[L.finderStreet,julyAddress.street],[L.finderCity,'Columbus'],[L.finderState,'OH'],[L.finderZip,'43215'],[L.district,'2503'],[L.districtName,'Columbus CSD'],[L.finderCounty,'Franklin'],[L.classification,'none'],[L.finderMatched,'true'],[L.countySource,h.countyOriginal.sourceReference],[L.countyYear,'2025'],[L.countyDate,'2026-01-15'],[L.countyName,'Franklin'],[L.countyStreet,julyAddress.street],[L.countyCity,'Columbus'],[L.countyState,'OH'],[L.countyZip,'43215'],[L.inventoryPublication,'ohio_2025_it1040_booklet'],[L.inventorySource,h.officialInventoryOriginal.sourceReference],[L.inventoryYear,'2025'],[L.inventoryPage,'50'],[L.inventoryCode,'2503'],[L.inventoryName,'Columbus CSD'],[L.inventoryRate,'-'],[L.inventoryBase,'-'],[L.inventoryReviewed,'true'],
 ]as const;}
/** Source maps derive only from previously source-audited pinned blank coordinates and NEW explicit literals. */
export function julyPaperCells(c:JulyCase){const baseline=julyRequired(businessPaperCases.find(row=>row.name===c.oldName));const values:Readonly<Record<string,string>>={
 'oh-it-1040-review.pdf:TP_FN':'AVERY','oh-it-1040-review.pdf:TP_LN':'JULYBUSINESS','oh-it-1040-review.pdf:ADDRESS1':'100 FICTIONAL JULY SOURCE STREET','oh-it-1040-review.pdf:CITY':'RICHMOND','oh-it-1040-review.pdf:SD_NUM':'2503','oh-it-1040-review.pdf:COUNTY':'FRAN','oh-it-1040-review.pdf:PRIM_NON_RES_STATE':'VA',
 'oh-it-nrc-review.pdf:10a':'0','oh-it-nrc-review.pdf:10b':'0','oh-it-nrc-review.pdf:11a':'0','oh-it-nrc-review.pdf:11b':'0','oh-it-nrc-review.pdf:12a':'0','oh-it-nrc-review.pdf:12b':'0','oh-it-nrc-review.pdf:13a':'0','oh-it-nrc-review.pdf:13b':'0','oh-it-nrc-review.pdf:14a':c.halfSE,'oh-it-nrc-review.pdf:14b':'0','oh-it-nrc-review.pdf:15b':'0',
 'oh-schedule-business-income-review.pdf:SchedITBUS_L1_NAME':'AVERY JULYBUSINESS','oh-it-nrc-review.pdf:3bn':'FICTIONAL JULY ORDINARY SERVICES','oh-it-nrc-review.pdf:prim-start':'01 01 25','oh-it-nrc-review.pdf:prim-end':'07 31 25',
 };return businessPaperCells(baseline).map(cell=>({...cell,value:values[cell.file+':'+cell.field]??cell.value}));}
export const julyWeightStrikes=businessPaperWeightStrikeRegions;
export function julyStatuses(){return businessPhysicalGroupSources.map(row=>({...row,selected:(row.field==='CHK_PRIM_RES'&&row.APOnValues[0]==='/2')||(row.field==='CHK_FILING_STATUS'&&row.APOnValues[0]==='/1')||(row.field==='Check Box1'&&row.APOnValues[0]==='/1')}));}

/** Direct pinned original widget inventory; complements, never replaces, the eight existing group checks. */
export const julyAdditionalBlankStatuses=[
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_AMD",
    "rect": [
      43.046,
      695.03,
      51.165,
      708.122
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_NOL",
    "rect": [
      316.587,
      695.03,
      324.706,
      708.122
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_PRIM_DEC",
    "rect": [
      201.8,
      656.833,
      209.919,
      670.154
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_SP_DEC",
    "rect": [
      417.435,
      656.833,
      425.554,
      670.154
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_SP_RES",
    "rect": [
      36.075,
      370.153,
      44.25,
      383.021
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_SP_RES",
    "rect": [
      108.098,
      370.153,
      116.273,
      383.021
    ],
    "APOnValues": [
      "/2"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_SP_RES",
    "rect": [
      179.555,
      370.153,
      187.73,
      383.021
    ],
    "APOnValues": [
      "/3"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_PRIM_NON_RES_STMT",
    "rect": [
      36.075,
      322.719,
      44.25,
      335.587
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_FED_EXT_FILTER",
    "rect": [
      330.875,
      323.02,
      339.05,
      335.888
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_SP_NON_RES_STMT",
    "rect": [
      36.075,
      299.701,
      44.25,
      312.569
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_CLAIM_DEP",
    "rect": [
      330.875,
      299.484,
      339.05,
      312.352
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "SpeakPrep",
    "rect": [
      53.931,
      50.48,
      65.517,
      62.066
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "NonPaidPrep",
    "rect": [
      170.001,
      50.48,
      181.588,
      62.066
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-1",
    "rect": [
      199.764,
      551.759,
      209.039,
      560.924
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-2",
    "rect": [
      199.764,
      537.525,
      209.039,
      546.69
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-3",
    "rect": [
      199.764,
      522.505,
      209.039,
      531.67
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-4",
    "rect": [
      199.764,
      506.343,
      209.039,
      515.508
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-5",
    "rect": [
      199.764,
      491.295,
      209.039,
      500.46
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-6",
    "rect": [
      199.764,
      476.228,
      209.039,
      485.393
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-7",
    "rect": [
      199.764,
      461.253,
      209.039,
      470.418
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-8",
    "rect": [
      199.764,
      446.392,
      209.039,
      455.557
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-9",
    "rect": [
      199.764,
      432.463,
      209.039,
      441.628
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-10",
    "rect": [
      199.764,
      416.588,
      209.039,
      425.753
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-11",
    "rect": [
      199.764,
      401.566,
      209.039,
      410.731
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-12",
    "rect": [
      199.764,
      387.271,
      209.039,
      396.436
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-13",
    "rect": [
      199.764,
      371.215,
      209.039,
      380.38
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-14",
    "rect": [
      199.764,
      356.363,
      209.039,
      365.528
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-15",
    "rect": [
      199.764,
      341.459,
      209.039,
      350.624
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-16",
    "rect": [
      199.764,
      326.556,
      209.039,
      335.721
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-17",
    "rect": [
      199.764,
      311.599,
      209.039,
      320.764
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-18",
    "rect": [
      199.764,
      296.247,
      209.039,
      305.412
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-19",
    "rect": [
      199.764,
      282.463,
      209.039,
      291.628
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "k1-20",
    "rect": [
      199.764,
      267.514,
      209.039,
      276.679
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  }
] as const;
export const julyPrivateDescriptions=[
 {kind:'ssn-formatted',rawDescription:'CONSULTING 900-74-0421'},
 {kind:'ssn-compact',rawDescription:'CONSULTING 900740421'},
]as const;
/** The description enters current C BEFORE all actual confirm APIs; no retained capture is patched. */
export function julyPrivateDescriptionPacket(kind:typeof julyPrivateDescriptions[number]['kind']){
 const row=julyRequired(julyPrivateDescriptions.find(item=>item.kind===kind));
 return{...julyHeaderPacket(julyRequired(julyCases[0]),row.rawDescription),rawDescription:row.rawDescription,expectedDescription:'CONSULTING [REDACTED]'};
}

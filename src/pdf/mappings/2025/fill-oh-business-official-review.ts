/** Spec: state/oh-business-official-review.yaml. Source-complete static review; no filing qualification. */
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {PDFDocument,PDFName,PDFDict,PDFTextField,PDFCheckBox,PDFButton,PDFDropdown,StandardFonts,drawText,degrees,rgb} from 'pdf-lib';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {buildOhioResidentReturnInput,type OhioOverlayInput} from '@/engine/state/oh-input-adapter.js';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return.js';
import {readOhioCanonicalBusinessSource} from '@/engine/state/oh-business-source.js';
import {calculateOhioReturnHeaderSource} from '@/engine/state/oh-return-header-source.js';
import {resolveOhioResidencyReview,type PreparedOhioResidencyReview} from '@/engine/state/oh-residency-source.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {assertPdfExportAllowed,markReviewPdf} from '@/pdf/export-policy.js';
import {resolveReviewTemplateDirectory} from '@/pdf/template-registry.js';
import {d,roundDollar,zeroFloor} from '@/utils/decimal.js';

const bundleHash='4e6432e23df3bf181a8e9d7ee5d5bb7e2e96a6a21dd65fa39c625fb8a7e2f57c';
const nrcHash='7e2f83559370510e129a6d720e090ae08aeefffcc75083c0b91561df85639c52';
const brand=Symbol('actual Ohio business official review');
const stagedBrand=Symbol('staged Ohio business review bytes');
export interface PreparedOhioBusinessOfficialReview{readonly[brand]:true}
export interface StagedOhioBusinessOfficialReview{readonly[stagedBrand]:true}
interface Projection{
 readonly includeIT1040:boolean;
 readonly primaryResidencyStatus:'2'|'3'|undefined;
 readonly bundle:Readonly<Record<string,string>>;
 readonly nrc:Readonly<Record<string,string>>;
 readonly weights:Readonly<Record<string,string>>;
}
interface SavedFile{readonly name:string;readonly bytes:Uint8Array}
const prepared=new WeakMap<PreparedOhioBusinessOfficialReview,Projection>();
const staged=new WeakMap<StagedOhioBusinessOfficialReview,readonly SavedFile[]>();
const itFields:Readonly<Record<string,string>>={
 '1':'L1','2a':'L2A','2b':'L2B','3':'L3','4':'L4','5':'L5','6':'L6','7':'L7',
 '8a':'L8A','8b':'L8B','8c':'L8C','9':'L9','10':'L10','11':'L11','12':'L12',
 '13':'L13','14':'L14','15':'L15','16':'L16','17':'L17','19':'L19','20':'L20',
 '21':'L21','22':'L22','23':'L23','24':'L24','26':'L26',
};
function fail(message:string):never{throw Error(`Ohio ordinary business official review: ${message}`);}

/** Render-only known-original masking, following the PA ordinary review context.
 * Canonical replay precedes this projection; originals and financial values never change.
 */
function privateSourceTextRedactor(original:TaxYearInput,display:TaxYearInput):(text:string)=>string{
 const values=new Set<string>();
 const privateKeys=/^(?:ein|employerStateID|sourceId|sourceReference|businessSourceId|receiptId|originalDocumentId|documentId|accountReference|confirmationNumber|returnId)$/i;
 const collect=(source:unknown,redacted:unknown):void=>{
  if(typeof source==='string'){if(source&&redacted==='')values.add(source);return;}
  if(!source||typeof source!=='object')return;
  if(Array.isArray(source)){source.forEach((item,index)=>collect(item,Array.isArray(redacted)?redacted[index]:undefined));return;}
  const redactedRecord=redacted&&typeof redacted==='object'?redacted as Record<string,unknown>:undefined;
  for(const[key,item]of Object.entries(source)){
   if(typeof item==='string'&&privateKeys.test(key)&&item.trim())values.add(item);
   collect(item,redactedRecord?.[key]);
  }
 };
 collect(original,display);
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[...values].flatMap(value=>{
  const digits=value.replace(/\D/g,'');
  return /^[-.()\s\d]+$/.test(value)&&digits.length>=4?[escape(value),digits.split('').join('[-.()\\s]*')]:[escape(value)];
 }).sort((a,b)=>b.length-a.length);
 const pattern=patterns.length?new RegExp(patterns.join('|'),'gi'):undefined;
 return text=>pattern?text.replace(pattern,'[REDACTED]'):text;
}

/** Pure source replay and immutable projection before any asset or output I/O. */
export function prepareOhioBusinessOfficialReview(
 input:TaxYearInput,federal:TaxReturnResult,overlay:OhioOverlayInput={},context?:PreparedOhioResidencyReview,
):PreparedOhioBusinessOfficialReview|undefined{
 assertPdfExportAllowed(input.taxpayer.taxYear,federal.taxYear);
 if(input.ohioResidency?.businessSources===undefined)return undefined;
 const original=resolveOhioResidencyReview(input,federal,context);
 if(Object.keys(overlay).length)fail('caller overlays cannot replace actual business originals');
 const adapted=buildOhioResidentReturnInput(original,federal),result=calculateOhioResidentReturn(adapted);
 const facts=original.ohioResidency,source=facts?.businessSources,owner=facts?.owners[0],business=source?.facts.businesses[0];
 const canonical=adapted.residencyBusinessSource,nrc=result.nonresidentCreditResult;
 if(!facts||!source||!owner||!business||!canonical||!nrc)fail('complete current canonical business and owner context required');
 const current=readOhioCanonicalBusinessSource(canonical,facts,federal.agi),worksheet=current.worksheet,row=worksheet.businesses[0];
 if(!row)fail('actual complete primary business worksheet required');
 const header=original.ohioReturnHeaderSources===undefined?undefined:calculateOhioReturnHeaderSource(original,original.ohioReturnHeaderSources);
 // Only separately current actual header evidence can qualify the new212-day physical variant.
 // Source validation above runs even when the valid financial cohort remains physically unsupported.
 if(original.taxpayer.filingStatus!=='single'||original.taxpayer.spouse||original.taxpayer.dependents.length
  ||facts.owners.length!==1||source.facts.businesses.length!==1||owner.accountHolder!=='primary'
  ||business.accountHolder!=='primary'||(header!==undefined&&header.methodVersion!=='oh-2025-py-business-header-212-v1')||original.ohioSchoolDistrict
  ||result.sd100||result.schoolDistrictSource||nrc.fullResidentOnly||current.draft2026
  ||!original.ohioPayments||original.ohioPayments.remainingTaxPayment.status!=='no_remaining_tax'
  ||original.ohioPayments.paymentRows.length||!result.it1040.line10_taxAfterCredits.isZero())return undefined;
 const nonresident=owner.status==='nonresident';
 if(nonresident){
  const period=owner.periods[0];
  if(owner.periods.length!==1||period?.from!=='2025-01-01'||period.to!=='2025-12-31'||period.domicileState!=='VA')return undefined;
 }else{
  const periods=[...owner.periods].sort((a,b)=>a.from.localeCompare(b.from)),first=periods[0],second=periods[1];
  if(owner.status!=='part_year_resident'||periods.length!==2||first?.from!=='2025-01-01'||first.to!==(header?'2025-07-31':'2025-06-30')
   ||first.domicileState!=='OH'||second?.from!==(header?'2025-08-01':'2025-07-01')||second.to!=='2025-12-31'||second.domicileState!=='VA')return undefined;
 }
 const credits=result.scheduleOfCredits,it=result.it1040,adj=result.scheduleOfAdjustments;
 if(!federal.scheduleC||!federal.scheduleSE||!worksheet.columnA.eq(federal.scheduleC.netProfit)
  ||!worksheet.columnB.isZero()||!current.residentFederalDeductions.isZero()
  ||!adj.line14_totalAdditions.isZero()||!adj.line47_totalDeductions.eq(worksheet.businessIncomeDeduction)
  ||!credits.line10_totalFirstBatch.isZero()||!credits.line36_totalSecondBatch.isZero()||!credits.line39_residentCredit.isZero()
  ||!credits.line38_nonresidentCredit.eq(nrc.line20)||!credits.line40_totalNonrefundableCredits.eq(nrc.line20)
  ||[it.line7_taxableNonbusinessIncome,it.line8a_nonbusinessTax,it.line11_underpaymentPenalty,it.line12_useTax,
   it.line14_ohioWithholding,it.line15_estimatedPayments,it.line16_refundableCredits,it.line17_totalPayments,
   it.line18_amendedPriorOverpayment,it.line19_netPayments,it.line20_taxDue,it.line21_latePaymentInterest,
   it.line22_totalAmountDue,it.line23_overpayment,it.line24_creditCarryforward,it.line25_donations,it.line26_refund,
   nrc.line1,nrc.line2,nrc.line3,nrc.line4,nrc.line6,nrc.line7,nrc.line8,nrc.line10,nrc.line11,nrc.line12,nrc.line13,nrc.line14]
   .some(value=>!value.isZero()))return undefined;
 // Printed nominal credit sum and floor agree with the canonical applied tax; never mutate either audit.
 const printedTotal=credits.line10_totalFirstBatch.plus(credits.line36_totalSecondBatch)
  .plus(credits.line38_nonresidentCredit).plus(credits.line39_residentCredit);
 if(!it.line10_taxAfterCredits.eq(zeroFloor(it.line8c_totalTax.minus(printedTotal))))fail('printed credit arithmetic differs from canonical tax');
 if(!d(business.payroll.ohio).isZero()||!d(business.payroll.everywhere).isZero())return undefined;
 // This physical description projection needs known-original identifier masking provenance.
 // Financial/source replay above still rejects malformed or stale facts before safe omission.
 if(!original.taxpayer.primary.ssn.trim())return undefined;
 const display=redactReviewIdentifiers(original),primary=display.taxpayer.primary,address=display.taxpayer.address;
 const bundle:Record<string,string>={};
 const integer=(value:Parameters<typeof roundDollar>[0])=>roundDollar(value).toFixed(0);
 if(nonresident||header){
  Object.assign(bundle,{TP_FN:primary.firstName.toUpperCase(),TP_LN:primary.lastName.toUpperCase(),
   ADDRESS1:address.street.toUpperCase(),ADDRESS2:address.apt?.toUpperCase()??'',CITY:address.city.toUpperCase(),STATE:address.state,ZIP:address.zip,
   SD_NUM:header?.header.schoolDistrictNumber??'9999',PRIM_NON_RES_STATE:(nonresident?owner.periods[0]:owner.periods.find(period=>period.domicileState!=='OH'))?.domicileState??fail('actual nonresident state missing'),L4_EXEMPT:'1',L7a:integer(it.line7_taxableNonbusinessIncome)});
  for(const line of it.lines){const field=itFields[line.line];if(field&&!(line.line==='2a'&&line.value.isZero()))bundle[field]=integer(line.value);}
  if(header)bundle.COUNTY=header.header.ohioCounty;
  bundle.L9=integer(printedTotal);
  for(const name of ['L25A','L25B','L25C','L25D','L25E','L25F','L25G'])bundle[name]='0';
 }
 // Actual printed16-line BUS layout: do not copy differently numbered internal ITBUS rows.
 for(let line=1;line<=16;line++)bundle[`SchedITBUS_L${line}`]='0';
 bundle.SchedITBUS_L2=integer(worksheet.columnA);bundle.SchedITBUS_L10=integer(worksheet.columnA);
 bundle.SchedITBUS_L11=integer(worksheet.businessIncomeBeforeDeductionCap);bundle.SchedITBUS_L12='250000';
 bundle.SchedITBUS_L13=integer(worksheet.businessIncomeDeduction);
 if(it.line5_ohioTaxableIncome.isZero())for(const line of ['14','15','16'])bundle[`SchedITBUS_L${line}`]='';
 else{
  bundle.SchedITBUS_L14=integer(worksheet.businessIncomeBeforeDeductionCap.minus(worksheet.businessIncomeDeduction));
  bundle.SchedITBUS_L15=integer(it.line6_taxableBusinessIncome);bundle.SchedITBUS_L16=integer(it.line8b_businessTax);
 }
 bundle.SchedITBUS_L1_NAME=`${primary.firstName} ${primary.lastName}`.toUpperCase();bundle.SchedITBUS_L1_PRIM_PCT_INT='100';
 for(let line=1;line<=47;line++){bundle[`SchedA_L${line}`]='0';bundle[`SchedC_L${line}`]='0';}
 bundle.SchedA_L13=integer(worksheet.businessIncomeDeduction);bundle.SchedA_L47=integer(worksheet.businessIncomeDeduction);
 for(const line of credits.lines)if(/^\d+$/.test(line.line))bundle[`SchedC_L${line.line}`]=integer(line.value);
 bundle.SchedC_L40=integer(printedTotal);
 const nrcValues:Record<string,string>={};
 for(const key of ['1a','2a','3a','4a','1b','2b','3b','4b'])nrcValues[key]='0';
 Object.assign(nrcValues,{'5b':integer(nrc.line5),'6b':integer(nrc.line6),'7b':integer(nrc.line7),'8b':integer(nrc.line8),'9b':integer(nrc.line9),
  '16b':integer(nrc.line16),'17b':integer(nrc.line17),'18b':integer(nrc.line18),'19':nrc.line19.eq('1')?'1':nrc.line19.toFixed(4).replace(/^0\./,'.'),'20':integer(nrc.line20)});
 if(!nonresident){
  const period=owner.periods.find(p=>p.domicileState==='OH');if(!period)fail('actual Ohio residence dates missing');
  const date=(value:string)=>`${value.slice(5,7)} ${value.slice(8,10)} ${value.slice(2,4)}`;
  Object.assign(nrcValues,{'prim-start':date(period.from),'prim-end':date(period.to),'14a':integer(current.deductibleHalf),'14b':integer(current.residentFederalDeductions),'15b':integer(nrc.line15)});
  for(const line of ['10','11','12','13']){nrcValues[line+'a']='0';nrcValues[line+'b']='0';}
 }
 Object.assign(nrcValues,{'4':integer(worksheet.columnA),'5':integer(worksheet.columnB),'6':integer(worksheet.columnC),
  '67':integer(worksheet.columnA),'68':integer(worksheet.columnB),'69':integer(worksheet.columnC),'81':integer(worksheet.businessIncomeDeduction),'84':integer(worksheet.ohioBusinessAfterDeduction),
  '3bn':privateSourceTextRedactor(original,display)(original.scheduleC?.principalBusinessActivity??fail('actual current business description missing')).toUpperCase(),'3perc':'100'});
 const worksheetLine=(name:string)=>row.worksheetLines[name]??fail('actual current worksheet line missing');
 Object.assign(nrcValues,{'3-1-1a':integer(worksheetLine('1aOhio')),'3-1-2a':integer(worksheetLine('1aEverywhere')),
  '3-1-1b':integer(worksheetLine('1bOhio')),'3-1-2b':integer(worksheetLine('1bEverywhere')),
  '3-1-1c':integer(worksheetLine('1aOhio').plus(worksheetLine('1bOhio'))),'3-1-2c':integer(worksheetLine('1aEverywhere').plus(worksheetLine('1bEverywhere'))),
  '3-1-3c':row.propertyRatio.toFixed(6).replace(/^0\./,'.'),'3-1-5c':worksheetLine('1c').toFixed(6).replace(/^0\./,'.'),
  '3-2-1':integer(d(business.payroll.ohio)),'3-2-2':integer(d(business.payroll.everywhere)),'3-2-5':integer(worksheetLine('2')),
  '3-3-1':integer(business.sales.rows.reduce((sum,value)=>sum.plus(value.ohioBenefitReceipt),d('0'))),
  '3-3-2':integer(business.sales.rows.reduce((sum,value)=>sum.plus(value.grossReceipt),d('0'))),
  '3-3-3':row.salesRatio.toFixed(6).replace(/^0\./,'.'),'3-3-5':worksheetLine('3').toFixed(6).replace(/^0\./,'.'),'3-4-5':worksheetLine('4').toFixed(6).replace(/^0\./,'.')});
 // Payroll0/0 is known cash, but its quotient is undefined. Leave3-2-3 blank.
 nrcValues['3-5-1']=integer(worksheetLine('5'));
 for(let line=6;line<=22;line++)nrcValues[`3-${line-1}`]=integer(worksheetLine(String(line)));
 const token=Object.freeze({[brand]:true as const});
 prepared.set(token,Object.freeze({includeIT1040:nonresident||header!==undefined,primaryResidencyStatus:nonresident?'3':header?'2':undefined,bundle:Object.freeze(bundle),nrc:Object.freeze(nrcValues),weights:Object.freeze({Dropdown1:row.propertyWeight.toFixed(2),Dropdown2:row.payrollWeight.toFixed(2),Dropdown3:row.salesWeight.toFixed(2)})}));
 return token;
}

async function loadExact(directory:string,name:string,hash:string,pageCount:number){
 const bytes=await readFile(join(directory,name));
 if(createHash('sha256').update(bytes).digest('hex')!==hash)fail('official source revision changed');
 const doc=await PDFDocument.load(bytes);if(doc.getPageCount()!==pageCount)fail('official page inventory changed');
 const form=doc.getForm();
 for(const field of form.getFields()){
  const isWeight=field instanceof PDFDropdown&&['Dropdown1','Dropdown2','Dropdown3'].includes(field.getName());
  if(field instanceof PDFButton||(field instanceof PDFDropdown&&!isWeight)){
   for(const widget of field.acroField.getWidgets()){
    const ref=doc.context.getObjectRef(widget.dict);if(!ref)fail('source authoring control reference missing');
    for(const page of doc.getPages())page.node.removeAnnot(ref);
   }
   form.acroForm.removeField(field.acroField);continue;
  }
  field.acroField.dict.delete(PDFName.of('AA'));field.acroField.dict.delete(PDFName.of('DV'));
  if(field instanceof PDFTextField)field.setText('');
  else if(field instanceof PDFCheckBox)field.uncheck();
  else if(!isWeight)fail('unexpected source field type');
  for(const widget of field.acroField.getWidgets()){
   widget.dict.delete(PDFName.of('A'));widget.dict.delete(PDFName.of('AA'));
   const rect=widget.getRectangle();
   if(rect.width<0||rect.height<0)widget.setRectangle({x:Math.min(rect.x,rect.x+rect.width),y:Math.min(rect.y,rect.y+rect.height),width:Math.abs(rect.width),height:Math.abs(rect.height)});
  }
 }
 doc.catalog.delete(PDFName.of('OpenAction'));doc.catalog.delete(PDFName.of('AA'));doc.catalog.delete(PDFName.of('Names'));
 return doc;
}
function setText(doc:PDFDocument,name:string,value:string){
 const field=doc.getForm().getTextField(name),max=field.getMaxLength();
 if(max!==undefined&&value.length>max)fail('actual value exceeds source field constraint');
 field.setText(value);field.setFontSize(0);if((field.getText()??'')!==value)fail('actual field value not retained');
}
function selectStatus(doc:PDFDocument,name:string,value:string){
 const field=doc.getForm().getField(name);field.acroField.dict.set(PDFName.of('V'),PDFName.of(value));let count=0;
 for(const widget of field.acroField.getWidgets()){
  const appearances=widget.getAppearances()?.normal;if(!(appearances instanceof PDFDict))fail('status appearance missing');
  const selected=appearances.has(PDFName.of(value));widget.setAppearanceState(PDFName.of(selected?value:'Off'));if(selected)count++;
 }
 if(count!==1)fail('actual status widget inventory changed');
}
function flatten(doc:PDFDocument,bundle:boolean){
 const form=doc.getForm(),pages=new Set(doc.getPages().map(page=>page.ref.toString()));let orphans=0;
 for(const field of form.getFields()){
  const widgets=field.acroField.getWidgets();
  for(let index=widgets.length-1;index>=0;index--){
   const widget=widgets[index];if(!widget)fail('source widget missing');const page=widget.P();
   if(page&&!pages.has(page.toString())){
    if(!bundle||!['2436 0 R','2365 0 R','2344 0 R'].includes(page.toString())||doc.context.lookup(page,PDFDict).get(PDFName.of('Type'))?.toString()!=='/Template')fail('unexpected source orphan');
    field.acroField.removeWidget(index);orphans++;
   }
  }
 }
 if(orphans!==(bundle?103:0))fail('source orphan inventory changed');
 form.flatten({updateFieldAppearances:false});doc.catalog.delete(PDFName.of('AcroForm'));doc.catalog.delete(PDFName.of('Names'));
 for(const page of doc.getPages()){page.node.delete(PDFName.of('Annots'));page.node.delete(PDFName.of('AA'));}
}

/** Validate local token before source I/O, stage every exact byte before any output I/O. */
export async function stageOhioBusinessOfficialReview(token:PreparedOhioBusinessOfficialReview,blankFormsDir=join('forms','blank')):Promise<StagedOhioBusinessOfficialReview>{
 const projection=prepared.get(token);if(!projection)fail('valid actual private prepared projection required');
 const directory=resolveReviewTemplateDirectory(blankFormsDir,2025),bundle=await loadExact(directory,'oh-it1040-bundle.pdf',bundleHash,13),nrc=await loadExact(directory,'oh-it-nrc.pdf',nrcHash,3);
 for(const[name,value]of Object.entries(projection.bundle))setText(bundle,name,value);
 for(const[name,value]of Object.entries(projection.nrc))setText(nrc,name,value);
 const bundleFont=await bundle.embedFont(StandardFonts.Helvetica),nrcFont=await nrc.embedFont(StandardFonts.Helvetica);
 await bundle.getForm().updateFieldAppearances(bundleFont);
 await nrc.getForm().updateFieldAppearances(nrcFont);
 const page=nrc.getPages()[2];if(!page)fail('actual NRCIII source page missing');
 // The source weight selectors overlay the printed defaults. Retain those printed
 // glyphs visibly struck, and draw the selected actual /Opt to their right within
 // the same source widget. A transparent AP prevents hiding the original rule.
 const oldWeights=[{name:'Dropdown1',left:458.8,bottom:503.2477,right:475.3,top:512.2477},
  {name:'Dropdown2',left:458.8,bottom:488.2477,right:475.3,top:497.2477},
  {name:'Dropdown3',left:458.64,bottom:473.6877,right:475.14,top:482.6877}];
 for(const old of oldWeights){
  const field=nrc.getForm().getDropdown(old.name),value=projection.weights[old.name];
  if(value===undefined||!field.getOptions().includes(value))fail('actual reweighting is not a pinned source option');
  field.select(value);
  field.updateAppearances(nrcFont,(_field,widget,font)=>{
   const rect=widget.getRectangle(),size=8,x=rect.width-2-font.widthOfTextAtSize(value,size);
   if(rect.x+x<=old.right+1)fail('replacement weight cannot fit beside the visibly struck source value');
   return drawText(font.encodeText(value),{x,y:3.2,size,font:font.name,color:rgb(0,0,0),rotate:degrees(0),xSkew:degrees(0),ySkew:degrees(0)});
  });
  const y=(old.bottom+old.top)/2;page.drawLine({start:{x:old.left,y},end:{x:old.right,y},thickness:.7,color:rgb(0,0,0)});
 }
 if(projection.includeIT1040){selectStatus(bundle,'CHK_PRIM_RES',projection.primaryResidencyStatus??fail('actual primary residency status missing'));selectStatus(bundle,'CHK_FILING_STATUS','1');}
 selectStatus(nrc,'Check Box1','1');flatten(bundle,true);flatten(nrc,false);
 const plans=[...(projection.includeIT1040?[{source:bundle,pages:[0,1],name:'oh-it-1040-review.pdf'}]:[]),
  {source:nrc,pages:[0,1,2],name:'oh-it-nrc-review.pdf'},
  {source:bundle,pages:[4,5],name:'oh-schedule-business-income-review.pdf'},
  {source:bundle,pages:[2,3],name:'oh-schedule-adjustments-review.pdf'},
  {source:bundle,pages:[6,7],name:'oh-schedule-credits-review.pdf'}];
 const files:SavedFile[]=[];
 for(const plan of plans){
  const clean=await PDFDocument.create();for(const copied of await clean.copyPages(plan.source,plan.pages))clean.addPage(copied);
  clean.setTitle('Ohio 2025 ordinary business redacted review');clean.setAuthor('Tax Engine');clean.setCreator('Tax Engine');clean.setProducer('Tax Engine');
  await markReviewPdf(clean);files.push(Object.freeze({name:plan.name,bytes:await clean.save()}));
 }
 const ready=Object.freeze({[stagedBrand]:true as const});staged.set(ready,Object.freeze(files));return ready;
}
/** Only bytes staged by this module can reach an output directory. */
export async function writeOhioBusinessOfficialReview(token:StagedOhioBusinessOfficialReview,outputDir:string):Promise<string[]>{
 const files=staged.get(token);if(!files)fail('valid actual staged private packet required');
 await mkdir(outputDir,{recursive:true});const paths:string[]=[];
 for(const file of files){const path=join(outputDir,file.name);await writeFile(path,file.bytes);paths.push(path);}
 return paths;
}

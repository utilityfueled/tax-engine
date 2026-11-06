/** Official continuous MOD03-24 Schedule G-L, source-qualified year2025 review only. */
import {PDFDocument,StandardFonts,type PDFFont,type PDFPage} from 'pdf-lib';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {assertPAOrdinaryReturnReview,type PreparedPAOrdinaryReturnReview,type PAOrdinaryResidentCreditStateRenderFacts} from '../../pa-ordinary-return-review-context.js';
import {assertPdfExportAllowed,markReviewPdf} from '../../export-policy.js';
import {loadReviewTemplate,setTextField} from '../../pdf-utils.js';
const F={year:'Enter the last two digits of the return tax year for the filing of the PA Schedule G-L',name:'Enter the name of the taxpayer claiming the credit. See the instructions',ssn:'Enter the Social Security number or federal employer identification number of the taxpayer claiming the credit. See the instructions',state:'1. - Enter the name of the state for which the credit is claimed. See the instructions',a:'A.2. a. Compensation',aNet:'A.2.c. Net Compensation',b:'B.2. a. Compensation',bNet:'B.2.c. Net Compensation',c:'C.2.c. Net Compensation',line3:'3. Income subject to tax in the other state or countryC.2.h. Dividends',due:'4. a.Tax due or assessed in the other state or country',paid:'4. b. Tax paid in the other state or country',bound:'4. c. Enter the lesser of Line 4a or Line 4b',adjustment:'4.d. Less: adjustments',adjusted:'4. e. Adjusted tax paid in the other state or country',cap:'5. Line 3 x 3.07% (0.0307)',credit:'6. PA Resident Credit',sectionIII1:'1. - Enter the amount from Section I, Column C, Line 3 here',sectionIII2:'2. – Add the amounts from Section I, Column B, Lines 2c through 2j and enter the result here',sectionIII3a:'3a. – Divide the amount from Section III, Line 1 by the amount from Section III, Line 2 and enter the result here as a decimal using six decimal places. See the instructions',sectionIII3b:'3b. – Divide the amount from Section III, Line 1 by the amount from Section III, Line 2 and enter the result here as a decimal using six decimal places. See the instructions'} as const;
const EMPLOYERS=[['A.Source: (Entity name)','A.2. Income by class; Compensation'],['B. Source: (Entity name)','B. 2. Income by class; Compensation'],['C. Source: (Entity name)','C. 2. Income by class; Compensation'],['D. Source: (Entity name)','D. 2. Income by class; Compensation']] as const;
const STATES:Readonly<Record<string,string>>={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
function wrapped(text:string,font:PDFFont,size:number,width:number):string[]{const rows:string[]=[];let line='';for(const character of text){if(character==='\n'){rows.push(line);line='';continue;}if(line&&font.widthOfTextAtSize(line+character,size)>width){rows.push(line);line='';}line+=character;}if(line)rows.push(line);return rows;}
async function sourceContinuation(doc:PDFDocument,row:PAOrdinaryResidentCreditStateRenderFacts,font:PDFFont):Promise<void>{
 let page:PDFPage|undefined,y=0;
 const next=()=>{page=doc.addPage([612,792]);page.drawText('PA Schedule G-L Section II - source continuation',{x:40,y:748,size:13,font});page.drawText('State '+row.state+'; same sources and totals, no additional credit',{x:40,y:727,size:9,font});y=702;};
 next();for(const[index,employer]of row.employers.entries()){
  for(const line of wrapped('Source '+(index+1)+': '+employer.name,font,10,532)){if(y<60)next();if(!page)throw Error('GL source continuation page missing');page.drawText(line,{x:40,y,size:10,font});y-=14;}
  if(y<60)next();if(!page)throw Error('GL source continuation page missing');page.drawText('Compensation: '+employer.compensation,{x:52,y,size:10,font});y-=24;
 }
}
/** Original-bound authority is validated before template IO, including when no schedule is needed. */
export async function fillPAOrdinaryScheduleGL(input:TaxYearInput,result:TaxReturnResult,blankPdfPath:string,token?:PreparedPAOrdinaryReturnReview):Promise<Array<{state:string;doc:PDFDocument}>>{
 assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);const facts=assertPAOrdinaryReturnReview(input,result,token),credit=facts.residentCredit;if(!credit)return[];
 const documents:Array<{state:string;doc:PDFDocument}>=[];
 for(const row of credit.states){
  const stateName=STATES[row.state];if(!stateName||row.state==='PA')throw Error('Actual resident-credit jurisdiction is invalid');
  const doc=await loadReviewTemplate(blankPdfPath,2025),form=doc.getForm(),font=await doc.embedFont(StandardFonts.Helvetica);
  const put=(key:string,value:string)=>{setTextField(form,key,value);form.getTextField(key).setFontSize(0);};
  put(F.year,'25');put(F.name,credit.claimantName);put(F.ssn,'');put(F.state,stateName);
  for(const[key,value]of [[F.a,row.paCompensation],[F.aNet,row.paCompensation],[F.b,row.otherCompensation],[F.bNet,row.otherCompensation],[F.c,row.otherCompensation],[F.line3,row.otherCompensation],[F.due,row.taxDue],[F.paid,row.netTaxPaid],[F.bound,row.paidBound],[F.adjustment,row.adjustment],[F.adjusted,row.adjustedPaid],[F.cap,row.paTax],[F.credit,row.credit],[F.sectionIII1,row.otherCompensation],[F.sectionIII2,row.otherCompensation],[F.sectionIII3a,'1'],[F.sectionIII3b,'000000']])put(key,value);
  let continuation=row.employers.length>EMPLOYERS.length;
  row.employers.slice(0,EMPLOYERS.length).forEach((employer,index)=>{const[nameField,amountField]=EMPLOYERS[index],field=form.getTextField(nameField),width=Math.min(...field.acroField.getWidgets().map(widget=>widget.getRectangle().width))-4,max=field.getMaxLength();const reference=font.widthOfTextAtSize(employer.name,7)>width||(max!==undefined&&employer.name.length>max);continuation ||= reference;put(nameField,reference?'SEE REFERENCE':employer.name);put(amountField,employer.compensation);});
  put('E. 2. Income by class; Compensation',row.otherCompensation);
  form.updateFieldAppearances(font);if(continuation)await sourceContinuation(doc,row,font);await markReviewPdf(doc);documents.push({state:row.state,doc});
 }
 return documents;
}

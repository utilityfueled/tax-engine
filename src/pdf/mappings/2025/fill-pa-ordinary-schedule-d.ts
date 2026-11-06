/** Official PA40D04-25, actual2025 ordinary digital source review only. */
import {PDFDocument,StandardFonts,type PDFFont,type PDFPage}from 'pdf-lib';
import type {TaxYearInput}from '@/models/inputs.js';
import type {TaxReturnResult}from '@/models/outputs.js';
import {assertPAOrdinaryReturnReview,type PreparedPAOrdinaryReturnReview,type PAOrdinaryScheduleDRowRenderFacts}from '../../pa-ordinary-return-review-context.js';
import {assertPdfExportAllowed,markReviewPdf}from '../../export-policy.js';
import {loadReviewTemplate}from '../../pdf-utils.js';
const roman=['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'];
export const PA_ORDINARY_D_FIELDS={
 name:'Enter the name of the taxpayer shown first on the PA-40',ssn:'Enter the Social Security Number shown first on the PA-40',
 owner:'Click on the appropriate oval for taxpayer/spouse/joint to indicate who is reporting the sale, exchange or disposition of property gain or loss',
 digitalYes:'Digital Assets Yes/No',digitalNo:'Digital Asset Yes/No',
 line3:'3. - Add all positive amounts from Line 1 and subtract all amounts from Line 1 shown as losses and enter the net result',
 line3Loss:'Select the oval if the net result for Line 3 is less than zero',
 line12:'12. - Add all positive amounts from Lines 3 through 11 and subtract all amounts from Lines 2 through 10 shown as losses and enter the net result here and include in Line 5 of your PA-40. See the instructions',
 line12Loss:'Select the oval if the net result for Line 12 is less than zero',
 rows:roman.map(n=>({description:`1${n} a. - Enter a description of the property sold. Example: 100 shares of XYZ stock or 10 acres in Dauphin County`,dateAcquired:`1${n} b. - Enter the date acquired in the MM/DD/YY format`,dateSold:`1${n} c. - Enter the date sold in the MM/DD/YY format`,proceeds:`1${n} d. - Enter the gross sales price less expenses of sale`,basis:`1${n} e. - Enter the cost or adjusted basis of the property sold`,gain:`1${n} f. - Enter the gain or loss. Subtract Column (e) from Column (d) and enter the result here`,loss:`1${n} f. - Select the oval if Column (e) is more than Column (d)`})),
}as const;
const F=PA_ORDINARY_D_FIELDS;
const zeros=[
 '4. - Enter the installment sales gain from PA Schedule D-1',
 '5. – Subtract the adjusted basis amount from the total distribution amount and enter the result. If a loss, enter a zero',
 '6. - Enter the net gain (loss) from Schedule(s) D-71',
 '7. - Enter the net PA S corporation and partnership gain (loss) from your PA Schedule(s) RK-1 or NRK-1. See the instructions',
 '8f. – Enter the gain from the sale of a principal residence. Subtract the amount in Column (e) from the amount in Column (d) and enter the result. If a loss, enter a zero',
 '9. - Enter the taxable distribution from Line 7c of the REV-999',
 '10. - Enter the taxable distribution from Line 17a of the REV-998',
 '11. - Enter the amount of any taxable gain from the exchange of insurance contracts reported for federal income tax purposes',
];
const fail=(detail:string):never=>{throw Error('Actual PA ScheduleD paper review: '+detail);};
function wrapped(text:string,font:PDFFont,size:number,width:number):string[]{
 const rows:string[]=[];let row='';for(const character of text){if(character==='\n'){rows.push(row);row='';continue;}if(row&&font.widthOfTextAtSize(row+character,size)>width){rows.push(row);row='';}if(font.widthOfTextAtSize(character,size)>width)return fail('a source character cannot fit the physical page');row+=character;}if(row)rows.push(row);return rows;
}
/** Labelled review continuation; no duplicate or independently calculated tax total. */
function continuation(doc:PDFDocument,font:PDFFont,rows:PAOrdinaryScheduleDRowRenderFacts[]):void{
 let page:PDFPage|undefined,y=0;
 const next=()=>{page=doc.addPage([612,792]);page.drawText('PA Schedule D Line 1 - REVIEW CONTINUATION',{x:40,y:748,size:13,font});page.drawText('No additional tax total; all row amounts are included once on official lines 3 and 12.',{x:40,y:727,size:9,font});y=700;};
 const line=(text:string)=>{if(!page||y<65)next();if(!page)return fail('continuation page is missing');page.drawText(text,{x:40,y,size:10,font});y-=15;};
 next();rows.forEach((row,index)=>{for(const text of wrapped('Actual row '+(index+13)+': '+row.description,font,10,532))line(text);line('Acquired '+row.dateAcquired+'; sold '+row.dateSold);for(const text of wrapped('Proceeds '+row.proceeds+'; actual PA basis '+row.basis+'; gain (loss) '+row.gain,font,10,532))line(text);y-=12;});
}
function references(doc:PDFDocument,font:PDFFont,items:Array<{label:string;text:string}>):void{
 let page:PDFPage|undefined,y=0;
 const next=(label:string)=>{page=doc.addPage([612,792]);page.drawText(label,{x:40,y:748,size:12,font});y=720;};
 for(const item of items){next(item.label);for(const text of wrapped(item.text,font,10,532)){if(y<65)next(item.label+' (continued)');if(!page)return fail('source reference page is missing');page.drawText(text,{x:40,y,size:10,font});y-=15;}}
}
/** Validate opaque original-bound authority before template IO, even for absent schedules. */
export async function fillPAOrdinaryScheduleD(input:TaxYearInput,result:TaxReturnResult,blankPdfPath:string,token?:PreparedPAOrdinaryReturnReview):Promise<PDFDocument|undefined>{
 assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);const facts=assertPAOrdinaryReturnReview(input,result,token),schedule=facts.scheduleD;if(!schedule)return;
 const doc=await loadReviewTemplate(blankPdfPath,2025),form=doc.getForm(),font=await doc.embedFont(StandardFonts.Helvetica),referenceItems:Array<{label:string;text:string}>=[];
 const fits=(name:string,value:string,size:number):boolean=>{const field=form.getTextField(name),widgets=field.acroField.getWidgets(),max=field.getMaxLength();if(!widgets.length)return fail('a mapped physical field has no widget');const width=Math.min(...widgets.map(w=>w.getRectangle().width))-4,height=Math.min(...widgets.map(w=>w.getRectangle().height))-2;return(max===undefined||value.length<=max)&&font.widthOfTextAtSize(value,size)<=width&&font.heightAtSize(size)<=height;};
 const put=(name:string,value:string)=>{if(!fits(name,value,7))return fail('actual original text or money cannot fit the physical field at readable size');let size=10;while(size>7&&!fits(name,value,size))size-=0.25;const field=form.getTextField(name);field.setText(value);field.setFontSize(size);};
 const sourceText=(name:string,value:string,label:string)=>{if(!fits(name,value,7)){referenceItems.push({label,text:value});put(name,'SEE REFERENCE');}else put(name,value);};
 sourceText(F.name,schedule.claimantName,'PA Schedule D - actual claimant name');put(F.ssn,'');form.getCheckBox(F.owner).check();form.getCheckBox(F.digitalYes).check();form.getCheckBox(F.digitalNo).uncheck();
 schedule.rows.slice(0,12).forEach((row,index)=>{const f=F.rows[index];sourceText(f.description,row.description,'PA Schedule D Line 1 - actual asset description');put(f.dateAcquired,row.dateAcquired);put(f.dateSold,row.dateSold);put(f.proceeds,row.proceeds);put(f.basis,row.basis);put(f.gain,row.gain);if(row.loss)form.getCheckBox(f.loss).check();else form.getCheckBox(f.loss).uncheck();});
 put(F.line3,schedule.total);put(F.line12,schedule.total);for(const field of zeros)put(field,'0');const loss=schedule.total.startsWith('-');if(loss){form.getCheckBox(F.line3Loss).check();form.getCheckBox(F.line12Loss).check();}else{form.getCheckBox(F.line3Loss).uncheck();form.getCheckBox(F.line12Loss).uncheck();}
 form.updateFieldAppearances(font);if(schedule.rows.length>12)continuation(doc,font,schedule.rows.slice(12));if(referenceItems.length)references(doc,font,referenceItems);await markReviewPdf(doc);return doc;
}

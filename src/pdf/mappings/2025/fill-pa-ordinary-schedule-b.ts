/** Official PA-40B2025, actual single-primary ordinary review only. */
import {StandardFonts,type PDFDocument} from 'pdf-lib';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {assertPAOrdinaryReturnReview,type PreparedPAOrdinaryReturnReview} from '../../pa-ordinary-return-review-context.js';
import {assertPdfExportAllowed,markReviewPdf} from '../../export-policy.js';
import {loadReviewTemplate} from '../../pdf-utils.js';
export const PA_ORDINARY_B_FIELDS={
  "name": "Name (if filing jointly, use name shown first on the PA-40)",
  "ssn": "Enter the Social Security number shown first on the PA-40",
  "owner": "Click on the appropriate oval for taxpayer/spouse/joint to indicate who is reporting the dividend and capital gains distributions income",
  "lines": [
    "1. Dividend income from Line 3b of your federal return",
    "2. Enter the amount of dividend income from federal Schedule K-1(s)",
    "3. Enter the amount of Pennsylvania exempt-interest dividend income. See the instructions",
    "4. Enter the amount of any other reduction adjustments - See the instructions",
    "5. Add the amounts on Lines 2, 3 and 4 and enter the result",
    "6. Subtract the amount on Line 5 from the amount on Line 1 and enter the result",
    "7. Enter the amount of any tax exempt-interest dividends - See the instructions",
    "8. Enter the amount of any other addition adjustments - See the instructions",
    "9a. Enter the amount of total earnings and profits included on Line 1 of the IRC Section 965 Transition Tax Statement. See the instructions",
    "9b. Enter the amount of total earnings and profits included in Line 9a reported in prior years. See the instructions",
    "9c. Enter the amount of the payments of earnings and profits included in Line 9a received in the current year. See the instructions",
    "10. Enter the amount of any capital gains distributions - See the instructions",
    "11. Enter the amount of any dividend income from PA S corporation(s) and partnerships, from your PA Schedule(s) RK-1 or federal Schedule(s) K-1",
    "12. Add the amounts on Lines 6, 7, 8, 9c, 10 and 11 and enter the result here and include on Line 3 of your PA-40"
  ]
} as const;
/** Validate original-bound authority before reading the immutable official template. */
export async function fillPAOrdinaryScheduleB(input:TaxYearInput,result:TaxReturnResult,blankPdfPath:string,token?:PreparedPAOrdinaryReturnReview):Promise<PDFDocument|undefined>{
 assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
 const schedule=assertPAOrdinaryReturnReview(input,result,token).scheduleB;if(!schedule)return;
 const doc=await loadReviewTemplate(blankPdfPath,2025),form=doc.getForm(),font=await doc.embedFont(StandardFonts.Helvetica),fields=PA_ORDINARY_B_FIELDS;
 const put=(name:string,value:string)=>{
  const field=form.getTextField(name),widgets=field.acroField.getWidgets();
  if(!widgets.length)throw Error('Actual PA dividend review field has no physical widget');
  const width=Math.min(...widgets.map(widget=>widget.getRectangle().width))-4,height=Math.min(...widgets.map(widget=>widget.getRectangle().height))-2,max=field.getMaxLength();
  const fits=(size:number)=>(max===undefined||value.length<=max)&&font.widthOfTextAtSize(value,size)<=width&&font.heightAtSize(size)<=height;
  if(!fits(7))throw Error('Actual PA dividend money cannot fit the physical field at readable size');
  let size=10;while(size>7&&!fits(size))size-=0.25;field.setText(value);field.setFontSize(size);
 };
 put(fields.name,schedule.claimantName);put(fields.ssn,'');form.getCheckBox(fields.owner).check();
 if(schedule.lines.length!==14)throw Error('Actual PA dividend paper requires all fourteen original-derived lines');
 fields.lines.forEach((name,index)=>put(name,schedule.lines[index]));
 put('4. Description',schedule.reductionDescription);put('8. Description','');
 form.updateFieldAppearances(font);await markReviewPdf(doc);return doc;
}

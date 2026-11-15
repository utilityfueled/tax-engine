/** Official PA-40A2025, actual single-primary ordinary review only. */
import {StandardFonts,type PDFDocument} from 'pdf-lib';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {assertPAOrdinaryReturnReview,type PreparedPAOrdinaryReturnReview} from '../../pa-ordinary-return-review-context.js';
import {assertPdfExportAllowed,markReviewPdf} from '../../export-policy.js';
import {loadReviewTemplate} from '../../pdf-utils.js';
export const PA_ORDINARY_A_FIELDS={
  "name": "Name (if filing jointly, use name shown first on the PA-40)",
  "ssn": "Enter the Social Security number shown first on the PA-40",
  "owner": "Click on the appropriate oval for taxpayer/spouse/joint to indicate who is reporting the interest income",
  "lines": [
    "1. Enter the amount of interest income reported on your federal retur1. Enter the amount of interest income reported on your federal retur1. Enter the amount of interest income reported on your federal return",
    "2. Enter the amount of tax-exempt interest income reported on Line 2a of your federal return",
    "3. Enter the amount of any other addition adjustments - See the instructions",
    "4. Add the amounts on Lines 1, 2 and 3 and enter the result",
    "5. Enter the amount of interest income from federal Schedule(s) K-1",
    "6. Enter the amount of interest income from direct obligations of the Commonwealth of Pennsylvania",
    "7. Enter the amount of interest income from direct obligations of the U.S. government",
    "8. Enter the amount of any other reduction adjustments - See the instructions",
    "9. Add the amounts on Lines 5, 6, 7 and 8 and enter the result",
    "10. Subtract the amount on Line 9 from the amount on Line 4 and enter the result",
    "11. Enter the amount of any distributions from Life Insurance, Annuity or Endowment Contracts included in federal taxable income",
    "12. Enter the amount of any distributions from Charitable Gift Annuities included in federal taxable income",
    "13. Enter the amount of any distributions from IRC Section 529 Qualified Tuition Programs for non-educational purposes",
    "14. Enter the amount of any distributions from Health/Medical Savings Accounts included in federal taxable income",
    "15. Enter the amount of interest income from PA S corporations and partnership(s), from your PA Schedule(s) RK-1 or federal Schedule(s) K-1",
    "16. Add the amounts on Lines 10 through 15 and enter the result here and include on Line 2 of your PA-40"
  ]
} as const;
/** Validate original-bound authority before reading the immutable official template. */
export async function fillPAOrdinaryScheduleA(input:TaxYearInput,result:TaxReturnResult,blankPdfPath:string,token?:PreparedPAOrdinaryReturnReview):Promise<PDFDocument|undefined>{
 assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
 const schedule=assertPAOrdinaryReturnReview(input,result,token).scheduleA;if(!schedule)return;
 const doc=await loadReviewTemplate(blankPdfPath,2025),form=doc.getForm(),font=await doc.embedFont(StandardFonts.Helvetica),fields=PA_ORDINARY_A_FIELDS;
 const put=(name:string,value:string)=>{
  const field=form.getTextField(name),widgets=field.acroField.getWidgets();
  if(!widgets.length)throw Error('Actual PA interest review field has no physical widget');
  const width=Math.min(...widgets.map(widget=>widget.getRectangle().width))-4,height=Math.min(...widgets.map(widget=>widget.getRectangle().height))-2,max=field.getMaxLength();
  const fits=(size:number)=>(max===undefined||value.length<=max)&&font.widthOfTextAtSize(value,size)<=width&&font.heightAtSize(size)<=height;
  if(!fits(7))throw Error('Actual PA interest money cannot fit the physical field at readable size');
  let size=10;while(size>7&&!fits(size))size-=0.25;field.setText(value);field.setFontSize(size);
 };
 put(fields.name,schedule.claimantName);put(fields.ssn,'');form.getCheckBox(fields.owner).check();
 if(schedule.lines.length!==16)throw Error('Actual PA interest paper requires all sixteen original-derived lines');
 fields.lines.forEach((name,index)=>put(name,schedule.lines[index]));
 put('3. Description','');put('8. Description',schedule.lines[7]==='0'?'':'NONRESIDENCY PERIOD INTEREST');
 form.updateFieldAppearances(font);await markReviewPdf(doc);return doc;
}

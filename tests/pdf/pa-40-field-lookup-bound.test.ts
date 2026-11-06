/** Spec: state/pa-married-mixed-residency-paper.yaml#bounded-money-field-resolution. */
import {expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import Decimal from 'decimal.js';
import {projectPA40DiagnosticFields,PA_40_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-40.js';
import {preparePAMarriedReturnReview,resolvePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {mixedPaperFixture} from '../fixtures/pa-married-mixed-residency-paper.js';

it('resolves actual PA40 money writes without one field-tree lookup per write',async()=>{
 const f=mixedPaperFixture(),before=JSON.stringify(f),token=preparePAMarriedReturnReview(f.input);
 const paper=resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),f.result,token)[0];
 if(!paper)throw Error('Actual independently owned paper is required');
 const doc=await PDFDocument.load(await readFile('forms/blank/2025/pa-40.pdf')),form=doc.getForm();
 const moneyNames=new Set<string>([F.line1a,F.line1b,F.line1c,F.line2,F.line3,F.line4,F.line5,F.line6,F.line7,F.line8,F.line9,F.line10,F.line11,F.line12,F.line13,F.line14,F.line15,F.line16,F.line17,F.line18,F.line20,F.line21,F.line22,F.line23,F.line24,F.line25,F.line26,F.line27,F.line27Code,F.line28,F.line29,F.line30,F.line31,F.line32,F.line33,F.line34,F.line35,F.line36]);
 const lookup=form.getFieldMaybe,lookups:string[]=[];
 const spy=vi.spyOn(form,'getFieldMaybe').mockImplementation(function(name:string){lookups.push(name);return lookup.call(form,name);});
 try{await projectPA40DiagnosticFields(doc,paper.taxpayer,paper.projection,{filingStatus:paper.projection.filingChoice,dependentChildren:paper.children.length,residency:paper.residency});}
 finally{spy.mockRestore();}
 expect(lookups.filter(name=>moneyNames.has(name))).toEqual([]);
 expect(form.getTextField(F.line1a).getText()).toBe('50000');
 expect(form.getTextField(F.line1c).getText()).toBe('50000');
 expect(form.getTextField(F.line12).getText()).toBe('1535');
 expect(form.getTextField(F.line13).getText()).toBe('1535');
 expect(form.getTextField(F.line1b).getText()??'').toBe('');
 expect(JSON.stringify(f)).toBe(before);
});

it('preserves loss status line25 penalty and refund donation render values',async()=>{
 const f=mixedPaperFixture(),token=preparePAMarriedReturnReview(f.input);
 const paper=resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),f.result,token)[0];
 if(!paper)throw Error('Actual independently owned paper is required');
 // Explicit render-only values exercise already-supported map branches, not a new tax oracle.
 const projection={...paper.projection,pa40:{...paper.projection.pa40,netBusinessIncome:new Decimal('-1.50'),netGainOrLoss:new Decimal('-2.50'),netRentalIncome:new Decimal('-3.50'),useTax:new Decimal('17'),penaltiesAndInterest:new Decimal('3'),underpaymentPenalty:new Decimal('3'),netOverpayment:new Decimal('12')}};
 const doc=await PDFDocument.load(await readFile('forms/blank/2025/pa-40.pdf')),form=doc.getForm();
 await projectPA40DiagnosticFields(doc,paper.taxpayer,projection,{filingStatus:paper.projection.filingChoice,residency:paper.residency,requestedRefund:'8',nextYearCredit:'2',donations:[{code:'A',amount:'2'}]});
 for(const [name,value]of [[F.line4,'2'],[F.line5,'3'],[F.line6,'4'],[F.line25,'17'],[F.line27,'3'],[F.line27Code,'E'],[F.line29,'12'],[F.line30,'8'],[F.line31,'2'],[F.line32Code,'A'],[F.line32,'2']]as const)expect(form.getTextField(name).getText()).toBe(value);
 for(const name of [F.line4Loss,F.line5Loss,F.line6Loss])expect(form.getCheckBox(name).isChecked()).toBe(true);
});

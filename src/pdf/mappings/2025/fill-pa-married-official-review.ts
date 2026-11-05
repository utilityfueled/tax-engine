/** Spec: state/pa-married-official-review.yaml. Separately owned static review. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {PDFDocument,PDFDict,PDFName,PDFObjectCopier,PDFRef,PDFStream,StandardFonts,rgb} from 'pdf-lib';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {resolvePAMarriedReturnReview,type PreparedPAMarriedReturnReview,type PAMarriedOwnedPaper} from '@/pdf/pa-married-return-review-context.js';
import {markReviewPdf} from '@/pdf/export-policy.js';
import {projectPA40DiagnosticFields,PA_40_FIELDS as F} from './fill-pa-40.js';

// Printed rectangles and source appearance IDs independently pinned before products.
// Geometry follows physical labels, including the source's reversed line2/3 names.
type Cell={page:number;rect:number[];ref:number;state?:string};
const cells:Record<string,Cell>={"SP-1-A":{"page":2,"rect":[69.6653,588.694,145.275,600.28],"ref":187},"SP-2-A":{"page":2,"rect":[69.6653,578.307,145.275,589.893],"ref":188},"SP-3-A":{"page":2,"rect":[69.6653,566.962,145.275,578.548],"ref":199},"SP-4-A":{"page":2,"rect":[69.6653,555.987,145.275,567.573],"ref":194},"SP-5-A":{"page":2,"rect":[69.6653,545.401,145.275,556.987],"ref":189},"SP-6-A":{"page":2,"rect":[69.6653,534.644,145.275,546.23],"ref":183},"SP-7-A":{"page":2,"rect":[69.6653,524.059,145.275,535.645],"ref":193},"SP-8-A":{"page":2,"rect":[69.6653,513.693,145.275,525.279],"ref":185},"SP-9-A":{"page":2,"rect":[69.6653,502.718,145.275,514.304],"ref":195},"SP-10-A":{"page":2,"rect":[69.6653,491.742,145.275,503.328],"ref":201},"SP-1-B":{"page":2,"rect":[393.953,589.128,468.953,600.714],"ref":207},"SP-2-B":{"page":2,"rect":[393.953,577.762,468.953,589.348],"ref":184},"SP-3-B":{"page":2,"rect":[393.953,567.396,468.953,578.982],"ref":205},"SP-4-B":{"page":2,"rect":[393.953,556.421,468.953,568.007],"ref":197},"SP-5-B":{"page":2,"rect":[393.953,545.835,468.953,557.421],"ref":196},"SP-6-B":{"page":2,"rect":[393.953,535.078,468.953,546.664],"ref":186},"SP-7-B":{"page":2,"rect":[393.953,524.493,468.953,536.079],"ref":191},"SP-8-B":{"page":2,"rect":[393.953,514.127,468.953,525.713],"ref":192},"SP-9-B":{"page":2,"rect":[393.953,503.152,468.953,514.738],"ref":202},"SP-10-B":{"page":2,"rect":[393.953,492.176,468.953,503.762],"ref":206},"SP-1-C":{"page":2,"rect":[480.149,589.128,555.76,600.714],"ref":198},"SP-2-C":{"page":2,"rect":[480.149,577.762,555.76,589.348],"ref":208},"SP-3-C":{"page":2,"rect":[480.149,567.396,555.76,578.982],"ref":203},"SP-4-C":{"page":2,"rect":[480.149,556.421,555.76,568.007],"ref":209},"SP-5-C":{"page":2,"rect":[480.149,545.835,555.76,557.421],"ref":222},"SP-6-C":{"page":2,"rect":[480.149,535.078,555.76,546.664],"ref":223},"SP-7-C":{"page":2,"rect":[480.149,524.493,555.76,536.079],"ref":214},"SP-8-C":{"page":2,"rect":[480.149,514.127,555.76,525.713],"ref":210},"SP-9-C":{"page":2,"rect":[480.149,503.152,555.76,514.738],"ref":224},"SP-10-C":{"page":2,"rect":[480.759,492.176,555.76,503.762],"ref":218},"SP-11-A":{"page":2,"rect":[69.6653,480.738,145.275,493.821],"ref":190},"SP-11-BC":{"page":2,"rect":[474.052,470.943,555.76,482.529],"ref":212},"SP-12-A":{"page":2,"rect":[67.3973,431.939,143.008,443.525],"ref":220},"SP-13-A":{"page":2,"rect":[67.3973,421.194,143.008,432.779],"ref":217},"SP-14-A":{"page":2,"rect":[67.3973,410.119,143.008,421.705],"ref":221},"SP-15-A":{"page":2,"rect":[94.1565,395.925,131.962,407.511],"ref":225},"SP-16-A":{"page":2,"rect":[67.3973,378.211,143.008,389.797],"ref":216},"SP-12-BC":{"page":2,"rect":[471.785,431.939,553.492,443.525],"ref":144},"SP-13-BC":{"page":2,"rect":[471.785,421.194,553.492,432.779],"ref":137},"SP-14-BC":{"page":2,"rect":[471.785,410.609,553.492,422.195],"ref":147},"SP-15-BC":{"page":2,"rect":[506.049,393.486,543.855,407.511],"ref":145},"SP-16-BC":{"page":2,"rect":[471.785,378.211,553.492,389.797],"ref":149},"broadMarried":{"page":1,"rect":[62.823,479.898,80.5062,493.922],"ref":1001,"state":"3"},"J3a":{"page":1,"rect":[82.692,469.458,96.1066,481.044],"ref":1002,"state":"3"},"M3b":{"page":1,"rect":[82.692,458.298,96.1066,470.492],"ref":1003,"state":"4"},"Mcertification":{"page":1,"rect":[238.32,459.462,253.564,471.048],"ref":1004,"state":"8"},"SP-claimant":{"page":1,"rect":[53.9366,676.79,405.157,689.595],"ref":986},"SP-partner":{"page":1,"rect":[53.3269,647.449,405.157,660.254],"ref":988},"eligible-no":{"page":1,"rect":[491.634,626.873,507.59,637.373],"ref":992,"state":"No"},"SP-dependents":{"page":1,"rect":[515.48,180.24,542.919,199.033],"ref":1048},"SP-page2-name":{"page":2,"rect":[124.068,680.946,407.825,693.752],"ref":204}};
// Exact physical child widgets, inventoried from the pinned original before rendering.
const childCells=[
 [1012,[56.5364,283.754,192.513,297.788],[193.732,282.754,214.464,296.788],[218.122,283.32,280.317,297.354]],
 [1016,[56.5364,272.928,192.513,286.963],[193.732,271.928,214.464,285.963],[218.122,272.494,280.317,286.529]],
 [1020,[56.5364,261.001,192.513,275.036],[193.732,260.869,214.464,274.904],[218.122,261.435,280.317,275.47]],
 [1024,[56.5364,250.372,192.513,264.407],[193.732,249.806,214.464,263.841],[218.122,250.372,280.317,264.407]],
 [1028,[56.1815,238.63,192.158,252.664],[193.704,238.285,214.436,252.319],[217.767,239.196,279.962,253.23]],
 [1032,[56.1815,226.804,192.158,240.839],[193.377,225.804,214.109,239.839],[217.767,226.37,279.962,240.405]],
 [1036,[56.1815,213.877,192.158,227.912],[193.377,213.745,214.109,227.78],[217.767,214.311,279.962,228.346]],
 [1040,[56.1815,203.248,192.158,217.283],[193.377,202.682,214.109,216.717],[217.767,203.248,279.962,217.283]],
 [1044,[56.0969,188.488,192.073,202.523],[193.197,188.257,213.929,202.292],[217.847,188.257,280.042,202.292]],
]as const;
for(const [index,[ref,...rectangles]]of childCells.entries())for(const [column,kind]of ['name','age','relationship'].entries()){const rect=rectangles[column];if(!rect)throw Error('PA SP child source rectangle missing');cells[`SP-child-${index+1}-${kind}`]={page:1,rect:[...rect],ref:ref+column};}
const hashes={'pa-40.pdf':'fcd7648601f3ce5a7a258be49c54aa1c604e1c61c1fe9175351451ac6087d8b3','pa-schedule-sp.pdf':'cf8c6d0b819f90fa56993f0647895e7e4000e36e42607c36a6a89d9170d82a5b'}as const;
async function originalTemplate(directory:string,name:keyof typeof hashes){
 const bytes=await readFile(join(directory,name));if(createHash('sha256').update(bytes).digest('hex')!==hashes[name])throw Error('PA married review template revision/hash differs');
 return PDFDocument.load(bytes);
}
async function staticCopy(source:PDFDocument,pages:number[],title:string){
 const clean=await PDFDocument.create();
 for(const page of await clean.copyPages(source,pages)){
  page.node.delete(PDFName.of('Annots'));page.node.delete(PDFName.of('AA'));clean.addPage(page);
 }
 clean.setTitle(title);clean.setAuthor('Tax Engine');clean.setCreator('Tax Engine');clean.setProducer('Tax Engine');
 await markReviewPdf(clean);return clean;
}
function flatten(doc:PDFDocument){
 doc.getForm().flatten({updateFieldAppearances:false});doc.catalog.delete(PDFName.of('AcroForm'));
 doc.catalog.delete(PDFName.of('Names'));doc.catalog.delete(PDFName.of('OpenAction'));doc.catalog.delete(PDFName.of('AA'));
 for(const page of doc.getPages()){page.node.delete(PDFName.of('Annots'));page.node.delete(PDFName.of('AA'));}
}

async function spReview(directory:string,paper:PAMarriedOwnedPaper):Promise<PDFDocument>{
 const source=await originalTemplate(directory,'pa-schedule-sp.pdf');if(source.getPageCount()!==8)throw Error('PA SP source page inventory differs');
 // This is a static companion. Copy only the exact two printed form pages,
 // deliberately discarding the complete known blank source form/control graph.
 // Authored canonical fields below have explicit identities and true rectangles.
 for(const page of source.getPages())page.node.delete(PDFName.of('Annots'));
 const doc=await PDFDocument.create();for(const page of await doc.copyPages(source,[0,1]))doc.addPage(page);
 const form=doc.getForm(),font=await doc.embedFont(StandardFonts.Helvetica),copier=PDFObjectCopier.for(source.context,doc.context);
 const text=(name:string,value:string,key=name)=>{
  const cell=cells[key];if(!cell)throw Error('PA SP actual physical cell is missing: '+key);
  const [x0,y0,x1,y1]=cell.rect;if(x0===undefined||y0===undefined||x1===undefined||y1===undefined)throw Error('PA SP source rectangle missing');
  const width=x1-x0,height=y1-y0,size=Math.min(9,(width-2)/Math.max(1,font.widthOfTextAtSize(value,1)));
  if(size<6)throw Error('PA SP actual text does not fit its physical field');
  const field=form.createTextField(name);field.setText(value);
  field.addToPage(doc.getPage(cell.page-1),{x:x0,y:y0,width,height,borderWidth:0,font,textColor:rgb(0,0,0)});field.setFontSize(size);
  if((field.getText()??'')!==value)throw Error('PA SP canonical actual value differs');
 };
 const status=(name:string,key:string,selected:boolean)=>{
  const cell=cells[key];if(!cell?.state)throw Error('PA SP source status missing');
  const [x0,y0,x1,y1]=cell.rect;if(x0===undefined||y0===undefined||x1===undefined||y1===undefined)throw Error('PA SP source status rectangle missing');
  const field=form.createCheckBox(name);field.addToPage(doc.getPage(cell.page-1),{x:x0,y:y0,width:x1-x0,height:y1-y0,borderWidth:0});
  const widget=field.acroField.getWidgets()[0];if(!widget)throw Error('PA SP authored status widget missing');
  const original=source.context.lookup(PDFRef.of(cell.ref,0),PDFDict),ap=original.lookup(PDFName.of('AP'),PDFDict).lookup(PDFName.of('N'),PDFDict);
  const stream=ap.lookup(PDFName.of(cell.state));if(!(stream instanceof PDFStream))throw Error('PA SP original selected appearance missing');
  const normal=doc.context.obj({Yes:doc.context.register(copier.copy(stream)),Off:doc.context.register(doc.context.flateStream('',{Type:'XObject',Subtype:'Form',BBox:[0,0,x1-x0,y1-y0]}))});
  widget.dict.set(PDFName.of('AP'),doc.context.obj({N:normal}));
  field.acroField.dict.set(PDFName.of('V'),PDFName.of(selected?'Yes':'Off'));widget.setAppearanceState(PDFName.of(selected?'Yes':'Off'));
  form.markFieldAsClean(field.ref);
 };
 const full=(person:TaxYearInput['taxpayer']['primary'])=>(person.firstName+' '+person.lastName).toUpperCase();
 if(!paper.taxpayer.spouse)throw Error('PA SP actual partner missing');
 text('SP-claimant',full(paper.taxpayer.primary));text('SP-partner',full(paper.taxpayer.spouse));
 text('SP-page2-name',full(paper.taxpayer.primary));text('SP-dependents',String(paper.children.length));
 for(const [index,child]of paper.children.entries()){text(`SP-child-${index+1}-name`,child.name.toUpperCase());text(`SP-child-${index+1}-age`,String(child.age));text(`SP-child-${index+1}-relationship`,child.relationship);}
 status('SP-eligible-no','eligible-no',true);status('SP-married','broadMarried',true);
 const joint=paper.accountHolder==='joint';status('SP-joint','J3a',joint);status('SP-separate','M3b',!joint);status('SP-certification','Mcertification',!joint);
 for(const [column,amounts]of Object.entries(paper.spColumns)){
  if(!amounts)continue;
  for(let line=1;line<=10;line++)text(`SP-${line}-${column}`,line===1?amounts.compensation:line===5?amounts.gifts:'0');
 }
 const column=joint?'A':'BC',sp=paper.projection.scheduleSP;
 text(`SP-11-${column}`,sp.eligibilityIncome.toFixed(0));
 for(const [line,value]of Object.entries({'12':sp.taxLiability.toFixed(0),'13':sp.taxPaidToOtherStates.toFixed(0),'14':sp.taxLiabilityAfterOtherStateTaxes.toFixed(0),'15':sp.forgivenessPercentage.div(100).toFixed(2),'16':sp.taxForgivenessCredit.toFixed(0)}))text(`SP-${line}-${column}`,value);
 await form.updateFieldAppearances(font);flatten(doc);
 return staticCopy(doc,[0,1],'Pennsylvania 2025 actual owned Schedule SP review');
}

export interface PAMarriedReviewDocument{filename:string;accountHolder:PAMarriedOwnedPaper['accountHolder'];kind:'pa40'|'sp';doc:PDFDocument}
/** Private source replay precedes template I/O; this never enables packet/filing routes. */
export async function fillPAMarriedOfficialReview(input:TaxYearInput,result:TaxReturnResult,blankFormsDir:string,prepared:PreparedPAMarriedReturnReview):Promise<PAMarriedReviewDocument[]>{
 const papers=resolvePAMarriedReturnReview(input,result,prepared),outputs:PAMarriedReviewDocument[]=[];
 for(const paper of papers){
  const p=paper.projection,hasSP=p.scheduleSP.taxForgivenessCredit.gt(0),doc=await originalTemplate(blankFormsDir,'pa-40.pdf');
  await projectPA40DiagnosticFields(doc,paper.taxpayer,p,{filingStatus:p.filingChoice,...(hasSP?{taxForgivenessCategory:'married' as const}:{}),dependentChildren:paper.children.length,residency:{status:'resident',schoolCode:p.schoolDistrictCode,schoolDistrictName:paper.schoolName},requestedRefund:p.refundDisposition.refund.toFixed(0),nextYearCredit:p.refundDisposition.nextYearCredit.toFixed(0),donations:p.refundDisposition.donations.map(row=>({code:row.code,amount:row.amount.toFixed(0)}))});
  if(!hasSP)for(const name of [F.line20,F.line21,F.dependents])doc.getForm().getTextField(name).setText('');
  // These are explicitly confirmed actual zero elections/overpayments, not missing facts.
  for(const [name,value]of Object.entries({[F.line29]:p.pa40.netOverpayment.toFixed(0),[F.line30]:p.refundDisposition.refund.toFixed(0),[F.line31]:p.refundDisposition.nextYearCredit.toFixed(0)}))doc.getForm().getTextField(name).setText(value);
  if(p.refundDisposition.refund.gt(0)&&p.refundDisposition.refund.lte(1)){
   const font=await doc.embedFont(StandardFonts.Helvetica);doc.getPage(1).drawText('Requested refund only. PA does not issue refunds of $1 or less.',{x:24,y:24,size:8,font,color:rgb(0,0,0)});
  }
  await doc.getForm().updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));flatten(doc);
  outputs.push({filename:`pa-${paper.accountHolder}-40-review.pdf`,accountHolder:paper.accountHolder,kind:'pa40',doc:await staticCopy(doc,[0,1],'Pennsylvania 2025 actual owned PA40 review')});
  if(hasSP)outputs.push({filename:`pa-${paper.accountHolder}-sp-review.pdf`,accountHolder:paper.accountHolder,kind:'sp',doc:await spReview(blankFormsDir,paper)});
 }
 return outputs;
}

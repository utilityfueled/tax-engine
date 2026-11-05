/** Official source-only static care review. Spec: state/pa-actual-care-official-review.yaml. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PDFDocument,PDFDict,PDFName,PDFRef,PDFStream,PDFObjectCopier,StandardFonts,pushGraphicsState,popGraphicsState,translate,drawObject,rgb} from 'pdf-lib';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {resolvePAMarriedReturnReview,assertPAMarriedPublicDisplayPrivacy,type PreparedPAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {assertPAOrdinaryReturnReview,type PreparedPAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {markReviewPdf} from '@/pdf/export-policy.js';

const SOURCE_HASH='6abbe9cbaf97a405392191dbe311bead6bcbde876faa8f6349aad2fe9a3cd795';
// Source physical page1 rectangles and selected oval states, not misleading tooltip formulas.
const cells:Record<number,{rect:number[];state?:string}>={"451":{"rect":[53.9366,674.79,405.157,687.595]},"453":{"rect":[53.3269,646.449,405.157,659.254]},"457":{"rect":[54.9816,539.023,188.749,561.023]},"458":{"rect":[190.745,535.635,350.825,568.36]},"460":{"rect":[476.56,549.257,489.974,561.452],"state":"1"},"461":{"rect":[476.56,539.335,489.974,550.311],"state":"2"},"462":{"rect":[496.809,540.008,557.791,560.372]},"464":{"rect":[55.427,516.519,189.194,538.519]},"465":{"rect":[190.754,513.216,350.724,546.025]},"467":{"rect":[476.805,526.208,490.22,538.403],"state":"1"},"468":{"rect":[476.805,516.286,490.22,527.262],"state":"2"},"469":{"rect":[497.054,517.159,558.036,537.522]},"470":{"rect":[55.1148,494.315,188.882,516.315]},"471":{"rect":[190.95,491.122,351.03,523.712]},"473":{"rect":[476.238,504.44,489.653,516.635],"state":"1"},"474":{"rect":[476.238,494.518,489.653,505.494],"state":"2"},"475":{"rect":[496.487,495.264,557.47,515.627]},"476":{"rect":[55.1966,472.879,188.964,494.879]},"477":{"rect":[190.959,469.358,350.93,502.057]},"479":{"rect":[476.357,482.567,489.771,494.763],"state":"1"},"480":{"rect":[476.357,472.645,489.771,483.622],"state":"2"},"481":{"rect":[496.606,473.3,557.588,493.664]},"482":{"rect":[55.042,450.315,188.809,472.315]},"483":{"rect":[190.805,446.558,350.776,479.367]},"485":{"rect":[476.638,460.004,490.053,472.199],"state":"1"},"486":{"rect":[476.857,450.082,490.271,461.058],"state":"2"},"487":{"rect":[497.106,450.955,558.088,471.318]},"488":{"rect":[54.2078,362.035,140.848,384.035]},"489":{"rect":[142.572,362.035,246.23,384.035]},"490":{"rect":[248.455,362.162,299.946,384.162]},"491":{"rect":[298.651,362.312,387.807,383.757]},"492":{"rect":[416.65,371.363,430.065,383.558],"state":"1"},"493":{"rect":[416.65,361.441,430.065,372.417],"state":"2"},"494":{"rect":[435.064,362.035,495.958,384.035]},"495":{"rect":[496.42,362.198,557.403,382.562]},"496":{"rect":[54.3559,338.734,140.996,360.734]},"497":{"rect":[142.72,338.734,246.378,360.734]},"498":{"rect":[248.421,338.862,299.803,360.862]},"499":{"rect":[298.635,339.012,387.792,360.457]},"500":{"rect":[416.895,348.314,430.31,360.509],"state":"1"},"501":{"rect":[416.895,338.392,430.31,349.368],"state":"2"},"502":{"rect":[435.151,339.453,496.482,361.453]},"503":{"rect":[496.944,339.616,557.926,359.98]},"504":{"rect":[53.9922,316.189,140.632,338.189]},"505":{"rect":[142.356,316.189,246.014,338.189]},"506":{"rect":[248.331,316.316,299.931,338.316]},"507":{"rect":[298.762,316.467,388.082,337.911]},"508":{"rect":[416.329,326.546,429.743,338.741],"state":"1"},"509":{"rect":[416.329,316.624,429.743,327.6],"state":"2"},"510":{"rect":[434.788,316.907,496.118,338.907]},"511":{"rect":[496.58,317.071,557.562,337.434]},"512":{"rect":[54.283,292.989,140.923,314.989]},"513":{"rect":[142.647,292.989,246.087,314.989]},"514":{"rect":[248.131,293.116,300.276,315.116]},"515":{"rect":[298.889,294.267,388.046,315.711]},"516":{"rect":[416.447,304.674,429.862,316.869],"state":"1"},"517":{"rect":[416.447,294.752,429.862,305.728],"state":"2"},"518":{"rect":[434.642,294.362,495.754,316.362]},"519":{"rect":[496.216,294.525,557.199,314.889]},"520":{"rect":[54.5739,271.753,141.214,293.753]},"521":{"rect":[142.938,271.753,246.051,293.753]},"522":{"rect":[248.258,271.88,300.348,293.88]},"523":{"rect":[299.017,272.03,388.01,293.475]},"524":{"rect":[416.729,282.11,430.143,294.305],"state":"1"},"525":{"rect":[416.947,272.188,430.361,283.164],"state":"2"},"526":{"rect":[434.933,271.816,496.045,293.816]},"527":{"rect":[496.507,271.98,557.489,292.343]},"528":{"rect":[461.729,225.07,556.748,241.507]},"529":{"rect":[461.729,208.052,556.748,224.488]}};
export type PACareReviewParent={kind:'married';prepared:PreparedPAMarriedReturnReview}|{kind:'ordinary';prepared:PreparedPAOrdinaryReturnReview};

export async function fillPACareOfficialReview(input:TaxYearInput,result:TaxReturnResult,templatePath:string,parent:PACareReviewParent):Promise<PDFDocument>{
 let facts;
 if(parent.kind==='married'){
  assertPAMarriedPublicDisplayPrivacy(input,result,parent.prepared);
  const owned=resolvePAMarriedReturnReview(input,result,parent.prepared);
  if(owned.length!==1)throw Error('PA care paper requires its actual joint original return');
  facts=owned[0].care;
 }else facts=assertPAOrdinaryReturnReview(input,result,parent.prepared).care;
 if(!facts)throw Error('PA care paper requires actual original-bound documentary facts');
 const bytes=await readFile(templatePath);
 if(createHash('sha256').update(bytes).digest('hex')!==SOURCE_HASH)throw Error('PA care paper source revision/hash differs');
 const source=await PDFDocument.load(bytes),doc=await PDFDocument.create();
 // Remove original widgets/actions before copying any source page graph.
 const original=source.getPage(0);original.node.delete(PDFName.of('Annots'));original.node.delete(PDFName.of('AA'));
 const [page]=await doc.copyPages(source,[0]);doc.addPage(page);
 const font=await doc.embedFont(StandardFonts.Helvetica),copier=PDFObjectCopier.for(source.context,doc.context);
 const text=(ref:number,value:string,band?:number[])=>{
  const cell=cells[ref];if(!cell)throw Error('PA care physical source field missing');
  const [x0,y0,x1,y1]=cell.rect,low=band?Math.max(y0,band[1]):y0,high=band?Math.min(y1,band[3]):y1,width=x1-x0-4,height=high-low-2;
  for(let size=9;size>=6;size-=0.5){
   const lines:string[]=[];let line='',fits=true;
   for(const word of value.trim().split(/\s+/)){
    if(font.widthOfTextAtSize(word,size)>width){fits=false;break;}
    const next=line?line+' '+word:word;
    if(font.widthOfTextAtSize(next,size)>width){lines.push(line);line=word;}else line=next;
   }
   if(line)lines.push(line);
   const leading=size*1.1;
   if(!fits||lines.length*leading>height)continue;
   const bottom=low+(high-low-lines.length*leading)/2+size*0.15;
   lines.forEach((value,index)=>page.drawText(value,{x:x0+2,y:bottom+(lines.length-index-1)*leading,size,font,color:rgb(0,0,0)}));return;
  }
  throw Error('PA care physical field cannot fit complete actual source text');
 };
 const oval=(ref:number)=>{
  const cell=cells[ref];if(!cell?.state)throw Error('PA care source oval missing');
  const widget=source.context.lookup(PDFRef.of(ref,0),PDFDict),ap=widget.lookup(PDFName.of('AP'),PDFDict).lookup(PDFName.of('N'),PDFDict),stream=ap.lookup(PDFName.of(cell.state));
  if(!(stream instanceof PDFStream))throw Error('PA care source selected appearance missing');
  const name=page.node.newXObject('CareOval',doc.context.register(copier.copy(stream)));
  page.pushOperators(pushGraphicsState(),translate(cell.rect[0],cell.rect[1]),drawObject(name),popGraphicsState());
 };
 text(451,facts.claimantName);if(facts.spouseName)text(453,facts.spouseName);
 const providerRows=[[457,458,460,461,462],[464,465,467,468,469],[470,471,473,474,475],[476,477,479,480,481],[482,483,485,486,487]];
 facts.providers.forEach((provider,index)=>{
  const [name,address,ssn,fein,amount]=providerRows[index];
  text(name,provider.name);text(address,provider.address,cells[name].rect);text(amount,provider.amountPaid);oval(provider.identifierKind==='ssn'?ssn:fein);
 });
 const personRows=[[488,489,490,492,493,494,495],[496,497,498,500,501,502,503],[504,505,506,508,509,510,511],[512,513,514,516,517,518,519],[520,521,522,524,525,526,527]];
 facts.qualifyingPersons.forEach((person,index)=>{
  const [first,last,dob,ssn,itin,relationship,expense]=personRows[index];
  text(first,person.firstName);text(last,person.lastName);text(dob,person.dateOfBirth);text(relationship,person.relationship);text(expense,person.expenses);oval(person.identifierKind==='itin'?itin:ssn);
 });
 text(528,String(facts.qualifyingPersonsCount));text(529,facts.credit);
 doc.setTitle('Pennsylvania 2025 actual source Schedule DC review');doc.setAuthor('Tax Engine');doc.setCreator('Tax Engine');doc.setProducer('Tax Engine');await markReviewPdf(doc);return doc;
}

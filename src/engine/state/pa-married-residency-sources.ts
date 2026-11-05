/** Pure actual separate-spouse calendar proof. Spec: spec/state/pa-married-residency-sources.yaml. */
import {PAMarriedResidencySourcesSchema} from '@/models/pa-married-residency-sources.js';
import type {PAMarriedOrdinarySources} from '@/models/pa-married-ordinary-sources.js';
import type {TaxYearInput} from '@/models/inputs.js';
type Owner='primary'|'spouse';
type Period={from:string;through:string};
export interface PAMarriedResidencyProof{
 status:'resident'|'nonresident'|'part_year';
 domicilePeriods:Array<Period&{state:string;daysInPA:number}>;
 residentPeriods:Period[];
 schoolDistrictCode:string;schoolDistrictName:string;
}
const fail=(detail:string):never=>{throw Error('PA married residency sources: '+detail);};
const ref=(v:string)=>{if(!v.trim())fail('actual complete source reference is required');};
function day(v:string,y:number):number{
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(v)||!v.startsWith(y+'-'))return fail('actual full selected-year calendar date is required');
 const d=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==v)return fail('actual calendar date is impossible');return d/86400000;
}
function periods(rows:Period[],y:number){let prior=-Infinity;return rows.map(row=>{const from=day(row.from,y),through=day(row.through,y);if(from>through||from<=prior)fail('actual chronological periods overlap or are reversed');prior=through;return {from,through};});}
const covers=(rows:Array<{from:number;through:number}>,from:number,through:number)=>{let next=from;for(const row of rows){if(row.through<next)continue;if(row.from>next)return false;next=row.through+1;if(next>through)return true;}return false;};
/** Does not rewrite the original household or pretend either spouse is single. */
export function calculatePAMarriedResidencySources(input:TaxYearInput,sources:PAMarriedOrdinarySources):Map<Owner,PAMarriedResidencyProof>{
 const parsed=PAMarriedResidencySourcesSchema.safeParse(sources.residencySources);
 if(!parsed.success)return fail('complete actual two-owner timeline packet is missing or malformed');
 const raw=parsed.data,y=input.taxpayer.taxYear,start=day(y+'-01-01',y),end=day(y+'-12-31',y);
 if(![2025,2026].includes(y)||raw.sourceTaxYear!==y||raw.sourceFactsConfirmed!==true||sources.filingMode!=='M'||input.taxpayer.filingStatus!=='married_filing_jointly'||!input.taxpayer.spouse)fail('actual selected-year MFJ household with separate M PA source election required');
 const spouse=input.taxpayer.spouse;if(!spouse)return fail('actual original spouse required');
 ref(raw.sourceReference);if(raw.owners.length!==2)fail('exactly two original owner timeline sources required');
 if(sources.care!==undefined||input.dependentCare!==undefined||input.dependentCareBenefits!==undefined)fail('mixed-residency care requires its actual owner/eligibility successor');
 const output=new Map<Owner,PAMarriedResidencyProof>();
 for(const row of raw.owners){
  const tag=row.accountHolder;if((tag!=='primary'&&tag!=='spouse')||output.has(tag))return fail('unique actual primary and spouse calendar owners required');
  if(row.allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed!==true)fail('actual employer-required payroll location classification review is unknown');
  const person=tag==='primary'?input.taxpayer.primary:spouse;
  if(row.originalTaxpayer.firstName!==person.firstName||row.originalTaxpayer.lastName!==person.lastName||row.originalTaxpayer.ssn!==person.ssn)fail('current original timeline owner identity changed');
  const legacy=sources.owners.find(owner=>owner.accountHolder===tag)?.residency;
  if(!legacy||legacy.factsConfirmed!==false||legacy.actualDaysInPA!==null||['domicileState','domicileFrom','domicileThrough','paAbodeFrom','paAbodeThrough','dec31SchoolDistrictCode','dec31SchoolDistrictName'].some(key=>legacy[key as keyof typeof legacy]!==''))fail('competing legacy residency summary must remain explicitly unknown; detailed actual timelines are authoritative');
  const r=row.residency;ref(r.sourceReference);if(r.factsConfirmed!==true||r.status==='')fail('actual domicile abode day and school facts are unconfirmed');
  const all=periods(r.domicilePeriods,y),pa=periods(r.paPermanentAbodePeriods,y),outside=periods(r.outsidePAPermanentAbodePeriods,y);
  if(!all.length||all.length>2||all[0].from!==start||all[all.length-1].through!==end||all.some((p,i)=>i>0&&p.from!==all[i-1].through+1))fail('actual complete one-move domicile calendar must cover the selected year without gaps');
  let days=0;for(const [i,p] of r.domicilePeriods.entries()){if(!/^[A-Z]{2}$/u.test(p.state)||p.daysInPA===null||!Number.isInteger(p.daysInPA)||p.daysInPA<0||p.daysInPA>all[i].through-all[i].from+1)return fail('actual physical presence days and state required for each domicile period');days+=p.daysInPA;}
  let status:PAMarriedResidencyProof['status'];
  if(all.length===1){
   if(r.domicilePeriods[0].state==='PA'){
    if(!covers(pa,start,end)||days<=30)fail('PA domicile exception or incomplete resident abode needs its separately reviewed method');
    status='resident';
   }else{
    if(days>=183||pa.length>0&&!covers(pa,start,end))fail('actual statutory or partial-year abode residency needs its separate method');
    if(!covers(outside,start,end))fail('actual full-year outside permanent abode proof required');
    status='nonresident';
   }
  }else{
   if(days>=183)return fail('actual statutory or183day boundary needs its separately reviewed method');
   const i=r.domicilePeriods.findIndex(p=>p.state==='PA');
   if(i<0||r.domicilePeriods.filter(p=>p.state==='PA').length!==1||r.moveAbandonmentNewDomicileAndPresenceConfirmed!==true)fail('actual one PA move requires abandonment new domicile and presence proof');
   const residence=all[i],nonresident=all[i===0?1:0];
   if(r.domicilePeriods[i].daysInPA===0)fail('actual new PA domicile requires positive physical presence in its PA period');
   if(!covers(pa,residence.from,residence.through)||pa.some(p=>p.from<=nonresident.through&&p.through>=nonresident.from)||!covers(outside,nonresident.from,nonresident.through))fail('mixed statutory-abode or incomplete actual move chronology needs its successor');
   status='part_year';
  }
  if(r.status!==status)fail('claimed residency contradicts the actual complete calendar');
  if(!/^[A-Z]{2}$/u.test(r.dec31PrincipalResidenceState))fail('actual December31 principal residence state required');
  if(r.dec31PrincipalResidenceState==='PA'){if(!/^\d{5}$/u.test(r.schoolDistrictCode)||r.schoolDistrictCode==='99999'||!r.schoolDistrictName.trim())fail('actual December31 PA school district proof required');}
  else if(r.schoolDistrictCode!=='99999'||!r.schoolDistrictName.trim())fail('actual outside December31 school code99999 and description required');
  output.set(tag,{status,domicilePeriods:r.domicilePeriods.map(({state,from,through,daysInPA})=>({state,from,through,daysInPA:daysInPA??fail('actual physical presence days required')})),residentPeriods:status==='resident'?[{from:y+'-01-01',through:y+'-12-31'}]:status==='nonresident'?[]:r.domicilePeriods.filter(p=>p.state==='PA').map(({from,through})=>({from,through})),schoolDistrictCode:r.schoolDistrictCode,schoolDistrictName:r.schoolDistrictName});
 }
 if(!output.has('primary')||!output.has('spouse')||[...output.values()].filter(r=>r.status==='resident').length!==1)fail('finite mixed method requires exactly one actual full-year PA resident');
 const primary=output.get('primary');if(!primary)return fail('actual primary calendar required');if(input.taxpayer.stateResidency!==undefined&&input.taxpayer.stateResidency!==(primary.status==='resident'?'full-year':primary.status==='part_year'?'part-year':'nonresident'))fail('canonical primary residency contradicts actual owner calendar');
 return output;
}

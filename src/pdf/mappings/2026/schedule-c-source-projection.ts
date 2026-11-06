/** Internal source projection only. Not registered with any export route. */
import type {TaxYearInput} from '@/models/inputs.js';
import type {ScheduleCResult} from '@/engine/schedules/schedule-c.js';
import {calculateScheduleCReviewSource} from '../../schedule-c-review-source.js';
import {roundDollar} from '@/utils/decimal.js';
import {SCHEDULE_C_2026_CANDIDATE} from './schedule-c-candidate.js';

export function projectScheduleC2026SourceFields(input:TaxYearInput,result:ScheduleCResult):Record<string,string>{
 if(input.taxpayer.taxYear!==2026)throw new Error('Actual 2026 Schedule C source year required');
 const source=calculateScheduleCReviewSource(input,result);
 if(!source||!source.address||!input.scheduleC?.sourceFacts?.interest)throw new Error('Actual 2026 address and interest sources required');
 const bound=result.lines.filter(row=>row.line==='actual-source-commitment');
 if(bound.length!==1||bound[0].inputs['Original source commitment']!==source.commitment)throw new Error('Actual 2026 Schedule C source calculation is stale');
 const f=SCHEDULE_C_2026_CANDIDATE.fields,fields:Record<string,string>={};
 for(const [key,value] of [[f.line16a,source.mortgage],[f.line16bVehicleLoan,source.vehicle],[f.line16cOther,source.other]] as const)fields[key]=roundDollar(value).toFixed(0);
 if(source.address.method==='separate_business_address'){const a=source.address;for(const [key,value] of [[f.businessStreet,a.street],[f.businessCity,a.city],[f.businessState,a.state],[f.businessZip,a.zip]] as const){if(value===undefined)throw new Error('Actual business address source unknown');fields[key]=value;}fields[f.businessApartment]=a.unit??'';}
 for(const [line,key] of [['10',f.line10],['20b',f.line20b],['21',f.line21],['23',f.line23],['26',f.line26],['27b',f.line27b],['28',f.line28],['29',f.line29],['31',f.line31]] as const){const row=result.lines.find(r=>r.form==='Sched C'&&r.line===line);if(row)fields[key]=roundDollar(row.value).toFixed(0);}
 return fields;
}

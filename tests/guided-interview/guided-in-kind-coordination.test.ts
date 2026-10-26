// Spec: spec/federal/form-1099-q-in-kind-coordination.yaml.
import {expect,it} from 'vitest';
import {buildEducationDistributionInputs,type EducationDistributionData} from '@/lib/guided-education-distributions';
import {inKindCoordinationFixture} from '../fixtures/education-in-kind-coordination.js';
it('preserves the actual tuition election through guided conversion',()=>{
 const input=inKindCoordinationFixture(2025),facts=input.qualifiedEducationExpenses?.sourceFacts;if(!facts)throw new Error('Missing source');
 const data:EducationDistributionData=JSON.parse(JSON.stringify({...facts,taxYear:'2025',forms:input.form1099Q.map(({transfer,...fields})=>({fields:{...fields,taxYear:'2025'},transfer}))}));
 const before=JSON.stringify(data),converted=buildEducationDistributionInputs(data,2025,'single',input.educationExpenses);
 expect(converted.form1099Q).toEqual(input.form1099Q);expect(converted.qualifiedEducationExpenses).toEqual(input.qualifiedEducationExpenses);
 expect(JSON.stringify(data)).toBe(before);
 if(!data.allocations?.[1]||!data.expenses?.[0])throw new Error('Missing allocations');
 data.allocations[1].amount='';expect(()=>buildEducationDistributionInputs(data,2025,'single',input.educationExpenses)).toThrow(/actual|allocat/);
 data.allocations[1].amount='5000';data.expenses[0].taxFreeAssistance='';expect(()=>buildEducationDistributionInputs(data,2025,'single',input.educationExpenses)).toThrow(/actual|assistance/);
 data.expenses[0].taxFreeAssistance='1000';data.sourceFactsConfirmed=false;expect(()=>buildEducationDistributionInputs(data,2025,'single',input.educationExpenses)).toThrow(/source|confirm/);
});

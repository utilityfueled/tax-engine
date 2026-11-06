// Spec: spec/federal/charitable-recipient-classification.yaml.
import { expect,it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { prepareCharitableReview,assertCharitableReviewSource } from '@/pdf/charitable-review-context.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
it('rejects changed recipient category against the original prepared charity context',()=>{
 const input=TaxYearInputSchema.parse({...simpleW2Fixture,donations:[{organization:'Actual recipient',type:'cash',amount:'500',dateOfDonation:'2025-05-01',qualifiedOrganization:true,isPrivateFoundation:false,recipientCategory:'fifty-percent'}]});
 const before=JSON.stringify(input),token=prepareCharitableReview(input);
 expect(()=>assertCharitableReviewSource(input,token)).not.toThrow();
 expect(()=>assertCharitableReviewSource(redactReviewIdentifiers(input),token)).not.toThrow();
 const changed=TaxYearInputSchema.parse({...input,donations:[{...input.donations[0],recipientCategory:'private-nonoperating'}]});
 expect(()=>assertCharitableReviewSource(changed,token)).toThrow(/stale|conflict/i);
 expect(JSON.stringify(input)).toBe(before);
});

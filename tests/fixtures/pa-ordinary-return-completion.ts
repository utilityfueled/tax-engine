/** Explicit fictional source fixtures; never production defaults. */
import {paOrdinaryReturnFixture} from './pa-ordinary-return';
import {PAOrdinaryReturnCompletionSourcesSchema,type PACompletionOriginalRecord} from '@/models/pa-ordinary-return-completion';
export function paOrdinaryReturnCompletionFixture(){
 const f=paOrdinaryReturnFixture();return {...f,sources:PAOrdinaryReturnCompletionSourcesSchema.parse(f.sources)};
}
export function paCompletionOriginalRecordFixture(recordKind:PACompletionOriginalRecord['recordKind']):PACompletionOriginalRecord{return {recordKind,sourceTaxYear:2025,sourceReference:'Fictional private '+recordKind+' original reference',documentName:'Fictional original '+recordKind+' document',issuerName:'Fictional issuing entity',recipientName:'Avery Pennsylvania',recipientTin:'111-22-3333',recordDate:'2026-02-01',originalAvailableConfirmed:true,methodStatus:'requires_source_method'};}

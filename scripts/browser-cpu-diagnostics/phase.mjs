import {performance} from 'node:perf_hooks';
import {Buffer} from 'node:buffer';

export const NAMES=Object.freeze(['Timestamp','ThreadTime','TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','DevToolsCommandDuration']);
export const SUPPORTED_CHROMIUM_REVISION='f842f52ef39fd97b449eb27cff414bf05a98ddce';
const EVENTS=Object.freeze(['Runtime.executionContextsCleared','Runtime.executionContextDestroyed','Page.frameStartedNavigating','Page.frameNavigated','Page.frameDetached','Inspector.detached']);
const PHASE='ohio-resident-credit-type-originals';
const TAG='NONQUALIFYING_DIAGNOSTIC';
const reject=code=>{throw Error(code);};
const need=(ok,code)=>{if(!ok)reject(code);};
const unavailable=code=>({version:1,qualification:TAG,phase:PHASE,status:'unavailable',code});
export function phaseAdmission(env,event){
 if(env.TAX_BROWSER_PHASE_DIAGNOSTICS!=='1')return false;
 need(env.TAX_BROWSER_CPU_BATCH_DIAGNOSTICS==='1'&&event?.inputs?.cpu_full_batches==='true'&&event.inputs.cpu_phase_metrics==='true','phase-admission-unavailable');
 return true;
}
function projectBinding(raw){
 need(raw&&/^[a-f0-9]{40}$/u.test(raw.sourceSha)&&/^sha256:[a-f0-9]{64}$/u.test(raw.imageId)&&/^[a-f0-9]{64}$/u.test(raw.inventorySha256)&&/^[a-f0-9]{40}$/u.test(raw.chromiumRevision),'invalid-binding');
 need(raw.chromiumRevision===SUPPORTED_CHROMIUM_REVISION,'runtime-unreviewed');
 return{sourceSha:raw.sourceSha,imageId:raw.imageId,inventorySha256:raw.inventorySha256,chromiumRevision:raw.chromiumRevision};
}
export function projectMetrics(raw){
 need(Array.isArray(raw)&&raw.length<=128,'invalid-metrics');const seen=new Set(),values={};
 for(const row of raw){
  need(row&&typeof row.name==='string'&&row.name.length<=80,'invalid-metrics');
  need(!seen.has(row.name),'invalid-metrics');seen.add(row.name);
  if(NAMES.includes(row.name)){need(Number.isFinite(row.value)&&row.value>=0,'invalid-metrics');values[row.name]=row.value;}
 }
 need(NAMES.every(name=>Object.hasOwn(values,name)),'invalid-metrics');
 return Object.fromEntries(NAMES.map(name=>[name,values[name]]));
}
async function within(operation,deadline){
 const ms=deadline-performance.now();need(ms>0,'command-unavailable');let timer;
 try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('command-unavailable')),ms);})]);}
 finally{clearTimeout(timer);}
}
/** Source/image values here are expected bindings only. Enclosing runner validation seals their provenance separately. */
export async function withPhaseMetrics(options){
 if(options.enabled!==true)return options.use();
 const {use,save}=options;let session,expired=false,record=unavailable('command-unavailable'),before,binding,epoch,frame,invalid=false,complete=false;
 const listeners=[];
 const listen=(event,fn)=>{session.on(event,fn);listeners.push([event,fn]);};
 const unchanged=()=>need(!invalid&&epoch,'epoch-changed');
 const codeOf=error=>['invalid-binding','invalid-target','identity-changed','runtime-unreviewed','epoch-changed','invalid-metrics','negative-delta','phase-limit','phase-incomplete'].includes(error?.message)?error.message:'command-unavailable';
 try{
  need(options.origin==='http://127.0.0.1:3109','invalid-target');binding=projectBinding(options.binding);
  const deadline=performance.now()+1000;
  const pending=Promise.resolve().then(options.createSession);
  pending.then(late=>{if(expired)void Promise.resolve().then(()=>late.detach()).catch(()=>{});},()=>{});
  try{session=await within(()=>pending,deadline);}catch(error){expired=true;throw error;}
  for(const event of EVENTS)listen(event,()=>{invalid=true;});
  listen('Runtime.executionContextCreated',({context}={})=>{
   if(context?.auxData?.isDefault!==true)return;
   if(context.auxData.frameId!==frame)return;
   if(typeof context.uniqueId!=='string'||context.uniqueId.length<1||context.uniqueId.length>256||epoch)invalid=true;
   else epoch=context.uniqueId;
  });
  const version=await within(()=>session.send('Browser.getVersion'),deadline);
  need(version?.revision==='@'+binding.chromiumRevision,'runtime-unreviewed');
  await within(()=>session.send('Page.enable'),deadline);
  const tree=await within(()=>session.send('Page.getFrameTree'),deadline);
  frame=tree?.frameTree?.frame?.id;need(typeof frame==='string'&&frame.length>0&&frame.length<=256,'epoch-changed');
  await within(()=>session.send('Runtime.enable'),deadline);unchanged();
  await within(()=>session.send('Performance.enable',{timeDomain:'threadTicks'}),deadline);
  const response=await within(()=>session.send('Performance.getMetrics'),deadline);unchanged();before=projectMetrics(response?.metrics);
 }catch(error){record=unavailable(codeOf(error));}
 const start=performance.now();
 try{const result=await use();complete=true;return result;}
 finally{
  const wallMs=performance.now()-start,deadline=performance.now()+1000;
  try{
   if(before){
    need(complete,'phase-incomplete');need(wallMs<=30000,'phase-limit');unchanged();
    const response=await within(()=>session.send('Performance.getMetrics'),deadline);unchanged();
    const after=projectMetrics(response?.metrics);
    // A fixed no-op validates the original system-unique context still exists after the second snapshot.
    // It runs outside the measured counter interval and does not expose application data.
    const guard=await within(()=>session.send('Runtime.evaluate',{expression:'0',uniqueContextId:epoch,silent:true,returnByValue:true}),deadline);
    need(!guard?.exceptionDetails&&guard?.result?.type==='number'&&guard.result.value===0,'epoch-changed');unchanged();
    const deltaSeconds=Object.fromEntries(NAMES.map(name=>{const delta=after[name]-before[name];need(Number.isFinite(delta)&&delta>=0,'negative-delta');need(delta<=30,'phase-limit');return[name,delta];}));
    record={version:1,qualification:TAG,phase:PHASE,status:'observed-unbound',scope:'inspected-main-thread-original-phase',timeDomain:'threadTicks',timestampDomain:'timeTicks',sourceImageValidation:'pending-enclosing-batch-validation',binding,hostPhaseWallMs:wallMs,deltaSeconds};
    need(Buffer.byteLength(JSON.stringify(record))<=4096,'phase-limit');
   }
  }catch(error){record=unavailable(codeOf(error));}
  if(session){
   let cleanupConfirmed=true;
   for(const[event,fn]of listeners)session.off(event,fn);
   const disable=Promise.resolve().then(()=>session.send('Performance.disable'));
   void disable.catch(()=>{}); // Handle late rejection without converting the observed promise to success.
   try{await within(()=>disable,deadline);}catch{cleanupConfirmed=false;}
   const detach=Promise.resolve().then(()=>session.detach()); // Always issue, even after budget expiry.
   void detach.catch(()=>{});
   try{await within(()=>detach,deadline);}catch{cleanupConfirmed=false;}
   if(!cleanupConfirmed)record=unavailable('cleanup-unconfirmed');
  }
  try{await within(()=>save(record),performance.now()+1000);}catch{/* Missing artifact remains unavailable. */}
 }
}

/** Only call after existing runner source/image/inventory pre/post checks close successfully. */
export function bindPhaseReceipt({recordSha256,binding,outerIdentityValidated}){
 try{
  need(outerIdentityValidated===true,'identity-changed');
  need(typeof recordSha256==='string'&&/^[a-f0-9]{64}$/u.test(recordSha256),'invalid-binding');
  return{version:1,qualification:TAG,phase:PHASE,status:'bound',recordSha256,binding:projectBinding(binding),sourceImageValidation:'enclosing-batch-pre-post'};
 }catch{return unavailable('provenance-unavailable');}
}

/** Exact projection before uploading a worker-owned file. Never accept arbitrary JSON as a metric record. */
export function sanitizePhaseRecord(record,expectedBinding){
 try{
  const codes=['invalid-binding','invalid-target','identity-changed','runtime-unreviewed','epoch-changed','invalid-metrics','negative-delta','phase-limit','phase-incomplete','command-unavailable','cleanup-unconfirmed'];
  let safe;
  if(record?.status==='unavailable'){
   need(codes.includes(record.code),'invalid-metrics');safe=unavailable(record.code);
  }else{
   const binding=projectBinding(record?.binding);need(JSON.stringify(binding)===JSON.stringify(projectBinding(expectedBinding)),'invalid-binding');
   need(Number.isFinite(record.hostPhaseWallMs)&&record.hostPhaseWallMs>=0&&record.hostPhaseWallMs<=30000,'phase-limit');
   const deltaSeconds=Object.fromEntries(NAMES.map(name=>{const value=record.deltaSeconds?.[name];need(Number.isFinite(value)&&value>=0&&value<=30,'invalid-metrics');return[name,value];}));
   safe={version:1,qualification:TAG,phase:PHASE,status:'observed-unbound',scope:'inspected-main-thread-original-phase',timeDomain:'threadTicks',timestampDomain:'timeTicks',sourceImageValidation:'pending-enclosing-batch-validation',binding,hostPhaseWallMs:record.hostPhaseWallMs,deltaSeconds};
  }
  need(JSON.stringify(record)===JSON.stringify(safe),'invalid-metrics');return safe;
 }catch{return unavailable('invalid-phase-artifact');}
}

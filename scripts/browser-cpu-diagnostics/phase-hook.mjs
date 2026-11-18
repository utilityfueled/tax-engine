import {withPhaseMetrics} from './phase.mjs';
const registered=new WeakMap();
/** Called only by the admitted, default-off diagnostic fixture. No environment or page access by default. */
export function registerOriginalEntryMetrics(page,options){
 if(options.enabled!==true)return()=>{};
 if(registered.has(page))throw Error('duplicate-phase-registration');
 registered.set(page,options);return()=>registered.delete(page);
}
export function withOriginalEntryMetrics(page,use){
 const options=registered.get(page);
 return options?withPhaseMetrics({...options,use}):use();
}

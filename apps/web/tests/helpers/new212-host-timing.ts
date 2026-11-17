/** Optional fixed-schema timing; never observes callback arguments, values or errors. */
export const phases = ['pdf-click','pdf-response-wait','pdf-download-wait','pdf-save','pdf-read-file','pdf-response-body','pdf-child-call','pdf-result-json','pdf-result-validation','pdf-report-write'] as const;
export type New212Phase = typeof phases[number];
export type TimingOptions = { enabled?: boolean; now?: () => number; emit?: (line: string) => void };
export function createNew212Timing({ enabled = process.env.TAX_ENGINE_TEST_NEW212_TIMING === '1', now = () => performance.now(), emit = line => { process.stdout.write(line + '\n'); } }: TimingOptions = {}) {
 const allowed = new Set<string>(phases);
 function begin(phase: New212Phase): number | undefined {
  try { if (!allowed.has(phase)) return; const start = now(); if (!Number.isFinite(start)) return; try { emit(JSON.stringify({v:1,phase,boundary:'start',elapsedMs:0})); } catch { /* Diagnostic output cannot replace an operation. */ } return start; } catch { return; }
 }
 function finish(phase: New212Phase, start: number | undefined, ok: boolean) {
  if (start === undefined) return;
  try { const delta = now() - start; if (!Number.isFinite(delta) || delta < 0 || delta > 1e9) return; emit(JSON.stringify({v:1,phase,boundary:'finish',elapsedMs:Math.round(delta*1000)/1000,ok})); } catch { /* Preserve the original result/error even if timing output fails. */ }
 }
 return {
  sync<T>(phase: New212Phase, operation: () => T): T {
   if (!enabled) return operation(); const start = begin(phase); let ok = false;
   try { const result = operation(); ok = true; return result; } finally { finish(phase,start,ok); }
  },
  async<T>(phase: New212Phase, operation: () => Promise<T>): Promise<T> {
   if (!enabled) return operation(); const start = begin(phase);
   return (async()=>{let ok=false;try { const result = await operation(); ok = true; return result; } finally { finish(phase,start,ok); }})();
  },
 };
}

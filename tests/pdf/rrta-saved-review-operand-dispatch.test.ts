/** Spec: federal/guided-rrta-paper-browser.yaml#saved-pdf-operand-exact-type-dispatch. */
import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../../apps/web/tests/helpers/rrta-paper-review-privacy.py',import.meta.url));
const python=process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3';
const probe=String.raw`import ast,json,sys,copy,io
from pypdf.generic import NumberObject,FloatObject,ArrayObject,DictionaryObject,NameObject,TextStringObject,ByteStringObject,IndirectObject
from pypdf import PdfReader
class Deny(Exception):pass
source=open(sys.argv[1]).read();tree=ast.parse(source);node=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='argscan')
checks=0;scans=[]
def counted(*a):
 global checks
 checks+=1
 return isinstance(*a)
def scan_string(a):
 scans.append((type(a).__name__,str(a)))
 if 'PRIVATE' in str(a):raise Deny('private-marker')
namespace=dict(globals(),isinstance=counted);exec(compile(ast.Module(body=[node],type_ignores=[]),'<actual-operand-dispatch>','exec'),namespace);run=namespace['argscan']
checks=0;run([NumberObject(i) for i in range(20)]+[FloatObject('1.5'),ArrayObject([NumberObject(9)])]);numeric=checks
class CustomNumber(NumberObject):pass
class CustomArray(ArrayObject):pass
class CustomText(TextStringObject):pass
# Reference needs no reader resolution: the original operand scanner rejects it.
ref=IndirectObject(1,0,None)
rows=[]
examples=[
 ('names',[NameObject('/A'),ArrayObject([TextStringObject('B'),ByteStringObject(b'C')])]),
 ('ordered-dictionary',DictionaryObject({NameObject('/First'):TextStringObject('clean'),NameObject('/PRIVATE'):TextStringObject('later')})),
 ('subclass-container',CustomArray([CustomText('PRIVATE')])),
 ('subclass-number',[CustomNumber(1),TextStringObject('clean')]),
 ('reference-first',[ref,TextStringObject('PRIVATE')]),
 ('marker-first',[TextStringObject('PRIVATE'),ref]),
 ('tuple-remains-ignored',(TextStringObject('PRIVATE'),)),
 ('unknown',object()),
 ('dictionary-value',DictionaryObject({NameObject('/Clean'):ArrayObject([TextStringObject('PRIVATE')])})),
]
for name,value in examples:
 scans.clear();checks=0;before=repr(value)
 try:run(value);result='PASS'
 except Deny as e:result=str(e)
 assert repr(value)==before
 rows.append({'name':name,'result':result,'scans':list(scans),'fallbackProbed':checks>0})
print(json.dumps({'numericTypeProbes':numeric,'rows':rows},separators=(',',':')))`;
function actual(){const result=spawnSync(python,['-I','-B','-c',probe,source],{encoding:'utf8',timeout:4000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin'}});expect(result.error).toBeUndefined();expect(result.status).toBe(0);expect(result.stderr).toBe('');return JSON.parse(result.stdout);}
it('avoids redundant numeric operand type probes without bypassing fallback checks',()=>{
 const result=actual();expect(result.numericTypeProbes).toBe(0);
 expect(result.rows.map((r:{result:string})=>r.result)).toEqual(['PASS','private-marker','private-marker','PASS','content-reference','private-marker','PASS','PASS','private-marker']);
 expect(result.rows[0].scans).toEqual([['NameObject','/A'],['TextStringObject','B'],['ByteStringObject','C']]);
 expect(result.rows[1].scans).toEqual([['NameObject','/First'],['TextStringObject','clean'],['NameObject','/PRIVATE']]);
 expect(result.rows.slice(1).every((r:{fallbackProbed:boolean})=>r.fallbackProbed)).toBe(true);
});
it('retains historical fallback and public scan order after the exact-type branches',()=>{
 const result=actual();expect(result.rows[4].scans).toEqual([]);expect(result.rows[5].scans).toEqual([['TextStringObject','PRIVATE']]);expect(result.rows[6].scans).toEqual([]);
});

"""Finite read-only RRTA review prototype. No PDF is created or edited.
Every surface is strict except source-position-proven fractional cm/Tm operands
in actual page content or Do-referenced Form XObjects. Not a general PII claim.
"""
import io,json,re,sys,os,stat,hashlib
from decimal import Decimal
from pypdf import PdfReader
from pypdf.generic import (ContentStream,IndirectObject,DictionaryObject,ArrayObject,StreamObject,TextStringObject,ByteStringObject,NameObject,NumberObject,FloatObject,read_object,create_string_object)
from pypdf._utils import read_non_whitespace,read_until_regex

class Deny(Exception):pass
MAX_PDF=32*1024*1024
# Per-inspection parser memo only; capacity exhaustion falls back to full parsing.
PARSE_CACHE_BYTES=8*1024*1024
PARSE_CACHE_ENTRIES=4096
NUM=re.compile(rb'[+-]?(?:\d+(?:\.\d*)?|\.\d+)\Z')
FRAC=re.compile(rb'[+-]?(?:\d+\.\d*|\.\d+)\Z')
# PDF-defined content operators only. BI consumes its whole ID/EI image using
# pypdf's inline-image parser; standalone ID/EI are never admitted operators.
OPERATORS=set(b"b b* B B* BDC BMC BT BX c cm CS cs d d0 d1 Do DP EMC ET EX f F f* G g gs h i j J K k l m M MP n q Q re RG rg ri s S SC SCN sc scn sh T* Tc Td TD Tf Tj TJ TL Tm Tr Ts Tw Tz v w W W* y ' \"".split())

def require(v,code):
 if not v:raise Deny(code)
def key(v):
 ref=v if isinstance(v,IndirectObject) else getattr(v,'indirect_reference',None)
 return ('ref',ref.generation,ref.idnum) if ref else ('direct',id(v))
def resolved(v):return v.get_object() if isinstance(v,IndirectObject) else v

def parse_content(data,reader):
 """Reuse the pinned PDF object/inline-image parser, retaining numeric byte spans.
 EOF with pending operands and parser/operator disagreement are denied.
 Comments and every non-exempt byte remain subject to strict scanning.
 """
 stream=io.BytesIO(data);operands=[];ops=[];spans=[];inline=ContentStream(None,reader)
 while True:
  c=read_non_whitespace(stream)
  if c in (b'',0):break
  stream.seek(-1,1);start=stream.tell()
  if c.isalpha() or c in (b"'",b'"'):
   operator=read_until_regex(stream,NameObject.delimiter_pattern)
   if operator==b'BI':
    require(not operands,'inline-image-operands');inline._read_inline_image(stream);ops.append(([],b'INLINE IMAGE'));continue
   require(operator in OPERATORS,'unknown-content-operator')
   values=[o[0] for o in operands];ops.append((values,operator))
   if operator in (b'cm',b'Tm'):
    require(len(operands)==6,'geometry-arity')
    require(all(isinstance(o[0],(NumberObject,FloatObject)) and NUM.fullmatch(o[3]) for o in operands),'geometry-type')
    require(all(Decimal(o[3].decode()).is_finite() and abs(Decimal(o[3].decode()))<=Decimal('1000000') for o in operands),'geometry-range')
    spans.extend((o[1],o[2],o[3]) for o in operands if FRAC.fullmatch(o[3]))
   operands=[]
  elif c==b'%':
   while c not in (b'\r',b'\n',b''):c=stream.read(1)
  else:
   obj=read_object(stream,None);end=stream.tell();require(end>start,'parser-progress');operands.append((obj,start,end,data[start:end]))
 require(not operands,'dangling-content-operands')
 # Independent whole-stream parser must consume the same operator/operand structure.
 check=ContentStream(None,reader);check._parse_content_stream(io.BytesIO(data));other=check.operations
 require(len(ops)==len(other) and all(a[1]==b[1] and (a[1]==b'INLINE IMAGE' or a[0]==b[0]) for a,b in zip(ops,other)),'parser-disagreement')
 return ops,spans

def inspect(raw,markers):
 require(type(raw) is bytes and 0<len(raw)<=MAX_PDF and raw.startswith(b'%PDF-'),'pdf-input')
 require(type(markers) is list and 0<len(markers)<=128 and len(set(markers))==len(markers) and all(type(m) is str and 0<len(m)<=512 for m in markers),'markers-input')
 reader=PdfReader(io.BytesIO(raw),strict=True);require(not reader.is_encrypted,'encrypted-pdf');require(0<len(reader.pages)<=100,'page-limit')
 # Marker encodings and the exact ASCII-only geometry eligibility are immutable
 # for this invocation. No markers, scan surfaces or occurrences are omitted.
 compiled=[]
 for m in markers:
  variants={m.encode('utf8'),m.encode('utf-16-be'),m.encode('utf-16-le')}
  try:variants.add(m.encode('latin1'))
  except UnicodeError:pass
  ascii_numeric=m.encode('ascii') if m.isascii() and m.isdecimal() else None
  compiled.append((variants,ascii_numeric,Decimal(m) if ascii_numeric is not None else None))
 known={};parsed={};active=set();visiting=set();exemptions=set();seenrefs=set();seenobjects=set();decoded_total=0
 parse_cache={};parse_cache_bytes=0
 def scan_bytes(data,label,spans=()):
  for mi,(variants,ascii_numeric,numeric_value) in enumerate(compiled):
   for pattern in variants:
    start=0
    while True:
     at=data.find(pattern,start)
     if at<0:break
     start=at+1;eligible=[]
     if ascii_numeric is not None and pattern==ascii_numeric:
      eligible=[(a,b,t) for a,b,t in spans if a<=at and at+len(pattern)<=b and (at>a or at+len(pattern)<b) and Decimal(t.decode())!=numeric_value]
     if eligible:exemptions.add((label,mi,at))
     else:raise Deny('private-marker')
 def scan_string(value):
  s=str(value)
  require(not any(m in s for m in markers),'private-marker')
  if isinstance(value,TextStringObject):
   try:scan_bytes(value.original_bytes,'string')
   except AttributeError:pass
  elif isinstance(value,ByteStringObject):scan_bytes(bytes(value),'byte-string')
 def scan_stream_strings(data):
  # Preserve every historical regex-selected decoded stream string, including
  # unknown/unreachable streams. Decode PDF string bytes without parser logging:
  # PDF-defined unrecognized escapes ignore the slash; octal is one byte.
  patterns=(rb'<([0-9a-fA-F\s]+)>',rb'\(((?:\\.|[^()\\])*)\)')
  for pi,pattern in enumerate(patterns):
   for match in re.finditer(pattern,data):
    body=match.group(1)
    if pi==0:
     digits=re.sub(rb'\s',b'',body);decoded=bytes.fromhex((digits+(b'0' if len(digits)%2 else b'')).decode('ascii'))
    else:
     decoded=bytearray();i=0;esc={110:10,114:13,116:9,98:8,102:12}
     while i<len(body):
      c=body[i];i+=1
      if c!=92:decoded.append(c);continue
      require(i<len(body),'literal-escape');c=body[i];i+=1
      if 48<=c<=55:
       digits=bytes([c])
       while i<len(body) and len(digits)<3 and 48<=body[i]<=55:digits+=body[i:i+1];i+=1
       decoded.append(int(digits,8)&255)
      elif c in (10,13):
       if c==13 and i<len(body) and body[i]==10:i+=1
      else:decoded.append(esc.get(c,c))
     decoded=bytes(decoded)
    scan_bytes(decoded,'decoded-stream-string');scan_string(create_string_object(decoded))
 groups=[]
 def content_group(values,resources,depth=0):
  nonlocal parse_cache_bytes
  require(depth<=50,'content-depth');items=[(v,resolved(v)) for v in values]
  require(all(isinstance(obj,StreamObject) for v,obj in items),'content-type')
  groupkey=tuple(key(v) for v,obj in items);require(groupkey not in visiting,'content-cycle');visiting.add(groupkey)
  chunks=[];offset=0
  for v,obj in items:
   data=obj.get_data();require(len(data)<=64*1024*1024,'stream-size');chunks.append((key(v),offset,data));offset+=len(data)+1
  combined=b'\n'.join(d for k,start,d in chunks)
  if combined in parse_cache:ops,spans=parse_cache[combined]
  else:
   ops,spans=parse_content(combined,reader)
   if len(parse_cache)<PARSE_CACHE_ENTRIES and parse_cache_bytes+len(combined)<=PARSE_CACHE_BYTES:
    parse_cache[combined]=(ops,spans);parse_cache_bytes+=len(combined)
  # Context/resource resolution, ambiguity, cycles and operand scans still run
  # for every reference; only the context-free exact-byte parser is reused.
  groups.append(ops)
  for k,start,data in chunks:
   local=[(a-start,b-start,t) for a,b,t in spans if start<=a and b<=start+len(data)]
   if k in known:require(known[k]==local,'ambiguous-content-context')
   known[k]=local
  resources=resolved(resources) if resources is not None else DictionaryObject()
  require(isinstance(resources,DictionaryObject),'resources-type')
  xobjects=resolved(resources.get('/XObject',DictionaryObject()));require(isinstance(xobjects,DictionaryObject),'xobjects-type')
  for args,op in ops:
   if op==b'Do':
    require(len(args)==1 and isinstance(args[0],NameObject),'Do-arity')
    require(args[0] in xobjects,'Do-resource');child=xobjects.raw_get(args[0]);target=resolved(child)
    require(isinstance(target,StreamObject),'Do-type')
    if target.get('/Subtype')=='/Form':content_group([child],target.get('/Resources',resources),depth+1)
  visiting.remove(groupkey)
 for page in reader.pages:
  contents=resolved(page.raw_get('/Contents')) if '/Contents' in page else []
  if not isinstance(contents,(ArrayObject,list)):contents=[contents]
  content_group(contents,page.get('/Resources'))
 def argscan(a):
  if isinstance(a,(TextStringObject,ByteStringObject,NameObject)):scan_string(a)
  elif isinstance(a,DictionaryObject):
   for n,x in a.items():scan_string(n);argscan(x)
  elif isinstance(a,(ArrayObject,list)):
   for x in a:argscan(x)
  elif isinstance(a,IndirectObject):raise Deny('content-reference')
 for ops in groups:
  for args,op in ops:argscan(args)
 def visit(v,label):
  nonlocal decoded_total
  if isinstance(v,IndirectObject):
   k=key(v)
   if k in seenrefs:return
   seenrefs.add(k);require(len(seenrefs)<=10000,'object-limit');visit(v.get_object(),label);return
  if isinstance(v,(DictionaryObject,ArrayObject)):
   if id(v) in seenobjects:return
   seenobjects.add(id(v))
  if isinstance(v,(TextStringObject,ByteStringObject,NameObject)):scan_string(v)
  if isinstance(v,StreamObject):
   data=v.get_data();decoded_total+=len(data);require(len(data)<=64*1024*1024 and decoded_total<=128*1024*1024,'decoded-limit');k=key(v)
   scan_bytes(data,str(k),known.get(k,()));scan_stream_strings(data)
  if isinstance(v,DictionaryObject):
   for n,x in v.items():
    scan_string(n)
    if str(n) in {'/AcroForm','/JS','/JavaScript','/AA','/OpenAction','/Launch','/EmbeddedFiles','/XFA','/RichMedia'}:raise Deny('active-content')
    if n=='/Subtype' and x=='/Widget':raise Deny('widget')
    visit(x,label+'/'+str(n))
  elif isinstance(v,ArrayObject):
   for x in v:visit(x,label)
  elif isinstance(v,(NumberObject,FloatObject)):scan_string(v)
 scan_bytes(raw,'raw-file')
 visit(reader.trailer,'trailer')
 for gen,objects in reader.xref.items():
  for num in objects:
   if num:visit(IndirectObject(num,gen,reader),'xref')
 for num in reader.xref_objStm:visit(IndirectObject(num,0,reader),'object-stream')
 for page in reader.pages:scan_string(page.extract_text())
 return {'schemaVersion':1,'status':'PASS','sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'pages':len(reader.pages),'markersChecked':len(markers),'geometrySubstringExemptions':len(exemptions),'scope':'full-graph-typed-content'}

def main():
 try:
  require(len(sys.argv)==2,'arguments');body=sys.stdin.buffer.read(65537);require(len(body)<=65536,'stdin-limit');markers=json.loads(body)
  fd=os.open(sys.argv[1],os.O_RDONLY|os.O_NOFOLLOW)
  with os.fdopen(fd,'rb') as f:
   st=os.fstat(f.fileno());require(stat.S_ISREG(st.st_mode) and 0<st.st_size<=MAX_PDF,'input-custody');raw=f.read(MAX_PDF+1);after=os.fstat(f.fileno())
   require(all(getattr(st,n)==getattr(after,n) for n in ['st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns']),'input-drift')
  result=inspect(raw,markers);print(json.dumps(result,separators=(',',':')));return 0
 except Exception:
  print('{"schemaVersion":1,"status":"DENY","code":"PDF_PRIVACY_CHECK_FAILED"}');return 2
if __name__=='__main__':sys.exit(main())

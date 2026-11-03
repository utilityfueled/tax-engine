import json,sys
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject
r=PdfReader(sys.argv[1],strict=True);seen=set();errors=[]
def visit(o):
 if isinstance(o,IndirectObject):
  key=(o.idnum,o.generation)
  if key in seen:return
  seen.add(key)
  try:q=o.get_object()
  except Exception as exc:errors.append([key,str(exc)]);return
  if q is None:errors.append([key,'unresolved']);return
  visit(q)
 elif isinstance(o,DictionaryObject):
  for v in o.values():visit(v)
 elif isinstance(o,ArrayObject):
  for v in o:visit(v)
visit(r.trailer)
for gen,objects in r.xref.items():
 for obj in objects:
  if obj:visit(IndirectObject(obj,gen,r))
for obj in r.xref_objStm:visit(IndirectObject(obj,0,r))
a=[]
for page in r.pages:
 for ref in page.get('/Annots',[]):
  try:o=ref.get_object()
  except Exception:continue
  if not o:continue
  a.append({'subtype':str(o.get('/Subtype','')),'value':str(o.get('/V','')),'name':str(o.get('/T','')),'popup':bool(o.get('/Popup')),'parent':bool(o.get('/Parent')),'uri':str(o.get('/A',{}).get('/URI',''))})
fields=r.get_fields()or{};sig=fields.get('independent-signature',{}).get('/V');sig=sig.get_object()if sig else None
root=r.trailer['/Root'];tree=root.get('/StructTreeRoot');tree=tree.get_object()if tree else None
print(json.dumps({'errors':errors,'fields':{k:{'type':str(v.get('/FT','')),'value':str(v.get('/V',''))}for k,v in fields.items()},'annotations':a,'pages':[p.extract_text()or''for p in r.pages],'signature':{'reason':str(sig.get('/Reason','')),'byteRange':list(sig.get('/ByteRange',[]))}if sig else None,'hasTree':bool(tree)}))

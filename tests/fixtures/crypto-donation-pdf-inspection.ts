/** Independent reader: locate saved amounts at the official blank's widget rectangles. */
export const inspectCryptoDonationPdf = `import io,json,sys
from pypdf import PdfReader
reader=PdfReader(sys.argv[2]) if len(sys.argv)>2 else PdfReader(io.BytesIO(sys.stdin.buffer.read()))
template=PdfReader(sys.argv[1]);pages=[p.extract_text() or '' for p in reader.pages]
indices=[i for i,t in enumerate(pages) if 'Itemized Deductions' in t and 'Gifts to' in t]
assert len(indices)==1, 'Expected exactly one original Schedule A'
def values(field):
 rect=next(a.get_object()['/Rect'] for a in template.pages[0]['/Annots'] if a.get_object().get('/T')==field);found=[]
 def visit(text,cm,tm,font,size):
  if text.strip() and abs(cm[4]-float(rect[0]))<.01 and abs(cm[5]-float(rect[1]))<.01:found.append(text.strip())
 reader.pages[indices[0]].extract_text(visitor_text=visit);return found
print(json.dumps({'pages':pages,'noncash':values('f1_24[0]'),'charitable':values('f1_26[0]'),'itemized':values('f1_30[0]'),'flattened':reader.get_fields() is None}))`;

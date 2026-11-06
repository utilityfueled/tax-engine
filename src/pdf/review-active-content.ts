import {PDFArray,PDFDict,PDFDocument,PDFName,PDFObject,PDFRef,PDFStream} from 'pdf-lib';

const automaticEntries=new Set(['AA','OpenAction','JS','JavaScript']);
const executableActions=new Set(['JavaScript','Launch','GoToR','GoToE','SubmitForm','ImportData','Rendition','Sound','Movie']);

/** Remove the listed action entrypoints from mapped review copies.
 * Inspect every indirect object as well as direct children, so disconnected
 * source actions cannot survive serialization. Keep fields, drawings, tags,
 * named destinations and ordinary explicit URI/internal navigation links.
 * This does not parse XFA or qualify arbitrary uploaded PDFs as safe. */
export function removeReviewActiveContent(doc:PDFDocument):void{
 const visited=new Set<PDFObject>(),dictionaries:PDFDict[]=[],actions=new Set<PDFDict>();
 const visit=(value:PDFObject):void=>{
  const object=value instanceof PDFRef?doc.context.lookup(value):value;
  if(!object||visited.has(object))return;visited.add(object);
  if(object instanceof PDFStream){visit(object.dict);return;}
  if(object instanceof PDFArray){for(const child of object.asArray())visit(child);return;}
  if(!(object instanceof PDFDict))return;
  dictionaries.push(object);
  const kind=doc.context.lookup(object.get(PDFName.of('S')));
  if(kind instanceof PDFName&&executableActions.has(kind.decodeText()))actions.add(object);
  for(const [,child] of object.entries())visit(child);
 };
 for(const [,object] of doc.context.enumerateIndirectObjects())visit(object);
 // Classify before mutation: a parent must still recognize an action even if
 // that action was enumerated earlier as an independent indirect object.
 for(const dictionary of dictionaries){
  for(const [key,value] of dictionary.entries()){
   const name=key.decodeText(),target=doc.context.lookup(value);
   if(actions.has(dictionary)||automaticEntries.has(name)
    ||((name==='A'||name==='Next')&&target instanceof PDFDict&&actions.has(target)))dictionary.delete(key);
  }
 }
}

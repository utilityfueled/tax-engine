"""Inspect saved review bytes using the pinned independent reader."""
import json
import re
import sys

from pypdf import PdfReader
from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject, StreamObject

reader = PdfReader(sys.argv[1], strict=True)
forbidden = {'/AA', '/OpenAction', '/JS', '/JavaScript', '/XFA', '/SigFlags', '/UR3', '/ByteRange'}
action_types = {'/JavaScript', '/Launch', '/GoToR', '/GoToE', '/SubmitForm',
                '/ImportData', '/Rendition', '/Sound', '/Movie'}
entries = set()
script_streams = set()


def walk(obj, object_number):
    if isinstance(obj, StreamObject):
        if re.search(rb'<(?:[\w.-]+:)?script(?:\s|>)', obj.get_data(), re.IGNORECASE):
            script_streams.add(object_number)
    if isinstance(obj, DictionaryObject):
        entries.update(forbidden.intersection(obj))
        if str(obj.get('/S')) in action_types:
            entries.add(str(obj['/S']))
        for child in obj.values():
            walk(child, object_number)
    elif isinstance(obj, ArrayObject):
        for child in obj:
            walk(child, object_number)


for generation, offsets in reader.xref.items():
    for number in offsets:
        if number and generation != 65535:
            walk(IndirectObject(number, generation, reader).get_object(), number)
for number in reader.xref_objStm:
    walk(IndirectObject(number, 0, reader).get_object(), number)

fields = reader.get_fields() or {}
print(json.dumps({
    'permissions': '/Perms' in reader.trailer['/Root'],
    'forbiddenEntries': sorted(entries),
    'scriptStreams': sorted(script_streams),
    'pages': [page.extract_text() or '' for page in reader.pages],
    'widgetCount': sum(annot.get_object().get('/Subtype') == '/Widget'
                       for page in reader.pages for annot in page.get('/Annots', [])),
    'canonicalValues': {name: str(value['/V']) for name, value in fields.items() if '/V' in value},
}))

"""Separate synthetic parity control worker; no saved PDF or marker is printed."""
import hashlib
import importlib.util
import io
import json
import sys
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject


def main():
    spec = importlib.util.spec_from_file_location('unchanged_privacy', sys.argv[1])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    marker = '111111111'

    def pdf(content=b'q Q', private_title=False):
        writer = PdfWriter()
        for _ in range(4):
            page = writer.add_blank_page(200, 200)
            stream = DecodedStreamObject()
            stream.set_data(content)
            page[NameObject('/Contents')] = writer._add_object(stream.flate_encode())
        if private_title:
            writer.add_metadata({'/Title': marker})
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()

    cases = [
        ('clean', pdf(), True),
        ('geometry-cm', pdf(b'q 1 0 0 1 41.611111111111114 0 cm Q'), True),
        ('geometry-Tm', pdf(b'BT 1 0 0 1 41.611111111111114 0 Tm ET'), True),
        ('literal', pdf(b'BT (111111111) Tj ET'), False),
        ('hex', pdf(b'BT <313131313131313131> Tj ET'), False),
        ('octal', pdf(b'BT (\\061\\061\\061\\061\\061\\061\\061\\061\\061) Tj ET'), False),
        ('nested', pdf(b'/Span << /ActualText (111111111) >> BDC EMC'), False),
        ('integer', pdf(b'q 1 0 0 1 111111111 0 cm Q'), False),
        ('unknown-operator', pdf(b'q XYZ Q'), False),
        ('malformed', b'%PDF-1.7\nmalformed synthetic PDF', False),
        ('first-error', pdf(b'q XYZ Q', True), False),
    ]
    rows = []
    for name, raw, expected in cases:
        try:
            result = module.inspect(raw, [marker])
            assert expected and len(result) == 8
            outcome = {'result': result}
        except Exception as error:
            assert not expected
            assert type(error).__name__ == ('PdfReadError' if name == 'malformed' else 'Deny')
            if name == 'first-error':
                assert str(error) == 'unknown-content-operator'
            outcome = {'denied': True, 'class': type(error).__name__, 'code': str(error)}
        rows.append({'case': name, 'expectedPass': expected,
                     'outcomeSha256': hashlib.sha256(json.dumps(outcome, sort_keys=True).encode()).hexdigest()})
    # New inspection cannot inherit a prior successful verdict.
    raw = pdf(private_title=True)
    assert module.inspect(raw, ['absent-synthetic'])['status'] == 'PASS'
    try:
        module.inspect(raw, [marker])
        raise AssertionError('cross-inspection')
    except module.Deny as error:
        assert str(error) == 'private-marker'
    print(json.dumps({'passed': True, 'cases': rows, 'crossInspectionDenied': True}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.stderr.write('Synthetic parity controls held.\n')
        sys.exit(1)

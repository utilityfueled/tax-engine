#!/usr/bin/env python3
"""Extract the final 2025 IRS EIC table from a separately retained official HTML file.

This offline source-transcription tool contains no engine credit formula. The
eight starred cells are verified against their complete official footnotes.
It deliberately fails if the year, shape, intervals or footnotes change.
"""

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re


class PublicationTables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == "h1" and not self.title:
            self.in_title = True
        if tag == "tr":
            self.row = []
        if tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "h1":
            self.in_title = False
        if tag in ("td", "th") and self.row is not None and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        if tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


# (row lower bound, table column, cutoff, published credit, child wording)
# These are literal source footnotes, not values calculated by the engine.
FOOTNOTES = [
    ("19100", 2, "19104", "0", "no qualifying children who have valid SSNs"),
    ("26200", 6, "26214", "1", "no qualifying children who have valid SSNs"),
    ("50400", 3, "50434", "3", "one qualifying child who has a valid SSN"),
    ("57300", 4, "57310", "1", "two qualifying children who have valid SSNs"),
    ("57550", 7, "57554", "0", "one qualifying child who has a valid SSN"),
    ("61550", 5, "61555", "1", "three qualifying children who have valid SSNs"),
    ("64400", 8, "64430", "3", "two qualifying children who have valid SSNs"),
    ("68650", 9, "68675", "3", "three qualifying children who have valid SSNs"),
]


def transcribe(source, retrieved_at):
    parser = PublicationTables()
    parser.feed(source.decode("utf-8"))
    title = " ".join("".join(parser.title).split())
    if title != "Publication 596 (2025), Earned Income Credit (EIC)":
        raise ValueError(f"Expected the final 2025 publication, received {title!r}")
    number = re.compile(r"[0-9][0-9,]*")
    candidates = [row for row in parser.rows if len(row) == 10
                  and number.fullmatch(row[0]) and number.fullmatch(row[1])]
    if len(candidates) != 1374:
        raise ValueError(f"Expected 1374 table rows, received {len(candidates)}")
    text = " ".join(" ".join(row) for row in candidates)
    starred = {}
    for lower, column, cutoff, credit, children in FOOTNOTES:
        note = (f"If the amount you are looking up from the worksheet is at least ${int(lower):,} "
                f"but less than ${int(cutoff):,}, and you have {children}, your credit is ${credit}.")
        if text.count(note) != 1:
            raise ValueError(f"Missing or ambiguous official footnote for {lower}, column {column}")
        starred[(lower, column)] = credit
    rows = []
    seen_stars = set()
    for position, source_row in enumerate(candidates):
        lower = source_row[0].replace(",", "")
        upper = source_row[1].replace(",", "")
        if lower != str(max(1, position * 50)) or upper != str((position + 1) * 50):
            raise ValueError(f"Unexpected interval at row {position}: {lower}, {upper}")
        row = [lower, upper]
        for column, cell in enumerate(source_row[2:], 2):
            if re.fullmatch(r"\*{1,3}", cell):
                key = (lower, column)
                if key not in starred:
                    raise ValueError(f"Unknown starred cell: {key}")
                row.append(starred[key])
                seen_stars.add(key)
            else:
                # IRS embeds end-of-page footnotes in the first credit cell of
                # several rows. Preserve its number and verify the note above.
                match = re.fullmatch(r"([0-9][0-9,]*)(?: \* If the amount you are looking up.*)?", cell)
                if not match:
                    raise ValueError(f"Unexpected cell at {lower}, column {column}: {cell!r}")
                row.append(match.group(1).replace(",", ""))
        rows.append(row)
    if seen_stars != set(starred):
        raise ValueError("Not all eight final partial intervals were found")
    return {
        "source": "https://www.irs.gov/publications/p596",
        "sourceSha256": hashlib.sha256(source).hexdigest(),
        "retrievedAt": retrieved_at,
        "year": 2025,
        "columns": ["lowerInclusive", "upperExclusive", "nonjoint0", "nonjoint1", "nonjoint2", "nonjoint3",
                    "joint0", "joint1", "joint2", "joint3"],
        "footnotes": "The final partial intervals are subject to actual income cutoffs: nonjoint19104/50434/57310/61555; joint26214/57554/64430/68675. The eight starred credits are transcribed from the corresponding official footnotes.",
        "rows": rows,
    }


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("html", type=Path, help="Saved official Publication 596 HTML")
    args.add_argument("fixture", type=Path, help="Output fixture, or existing fixture with --check")
    args.add_argument("--retrieved-at", required=True, help="Actual source retrieval date, YYYY-MM-DD")
    args.add_argument("--check", action="store_true", help="Verify the existing fixture without writing")
    options = args.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", options.retrieved_at):
        args.error("--retrieved-at must be an actual YYYY-MM-DD source retrieval date")
    fixture = transcribe(options.html.read_bytes(), options.retrieved_at)
    if options.check:
        if json.loads(options.fixture.read_text()) != fixture:
            raise ValueError("Existing fixture differs from the retained official source")
    else:
        # One table row per line makes source changes reviewable.
        rows = fixture.pop("rows")
        header = json.dumps(fixture, indent=2)
        body = ",\n".join("    " + json.dumps(row) for row in rows)
        options.fixture.write_text(header[:-2] + ',\n  "rows": [\n' + body + "\n  ]\n}\n")
    print("Verified 1374 official rows, 10992 credit cells and eight partial-row footnotes.")


if __name__ == "__main__":
    main()

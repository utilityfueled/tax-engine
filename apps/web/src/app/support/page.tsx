import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Year and scenario support" };

const rows = [
  ["2025", "Federal", "Complete taxpayer, spouse and dependent facts required", "Existing Form 1040 calculation paths; scenario review incomplete", "Experimental calculations, JSON bundle, limited review PDF", "Unavailable"],
  ["2025", "CA, NY, NJ, IL, PA, OH", "Resident, part-year and nonresident coverage differs by engine; unqualified", "Dedicated state calculations; conformity, local taxes and forms still need review", "Experimental previews and reference output where implemented", "Unavailable"],
  ["2025", "Other states and DC", "Unqualified", "Generic calculations or no general income-tax path; special taxes may be missing", "Experimental preview where implemented", "Unavailable"],
  ["2026", "Federal", "All residency scenarios unqualified", "Partial indexed rule data only; remaining law and forms pending", "Save guided facts; calculation and PDF unavailable", "Unavailable"],
  ["2026", "All states and DC", "All residency scenarios unqualified", "Conformity, scenarios and forms pending", "Save facts; calculation and PDF unavailable", "Unavailable"],
  ["Other years", "All jurisdictions", "Unsupported", "No implicit fallback to another year", "Calculation and PDF unavailable", "Unavailable"],
];

export default function SupportPage() {
  return (
    <div className="workspace-grid">
      <section className="hero">
        <h1>Year and scenario support</h1>
        <p>Current qualification status: no scenario is enabled for filing. Tax year 2026 is filed in 2027.</p>
        <Link className="utility-button" href="/help">Back to Help</Link>
      </section>
      <section className="panel" style={{ gridColumn: "1 / -1", overflowX: "auto" }}>
        <table>
          <caption>Support status as of October 24, 2026</caption>
          <thead><tr>{["Tax year", "Jurisdiction", "Residency and facts", "Forms and scenarios", "Available output", "Filing / e-file"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={`${row[0]}-${row[1]}`}>{row.map((cell, index) => index === 0
            ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table>
        <p>A document parser, a passing test or a dedicated state engine does not qualify a return for filing. Review PDFs omit taxpayer IDs and are marked for review only.</p>
        <p>Enabling a scenario requires reviewed year-specific rules, complete facts, independent expected results and qualified final forms. State selection for the first filing release is pending.</p>
      </section>
    </div>
  );
}

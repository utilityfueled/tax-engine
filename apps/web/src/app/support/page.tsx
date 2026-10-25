import type { Metadata } from "next";
import Link from "next/link";
import { taxYearSupportRows } from "@/lib/tax-year-support";

export const metadata: Metadata = { title: "Year and scenario support" };

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
          <tbody>{taxYearSupportRows.map(row => <tr key={`${row[0]}-${row[1]}`}>{row.map((cell, index) => index === 0
            ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table>
        <p>A document parser, a passing test or a dedicated state engine does not qualify a return for filing. Review PDFs omit taxpayer Social Security numbers and are marked for review only.</p>
        <p>Calculation components may require structured inputs that the guided interview does not yet collect. Encrypted local backups preserve browser-only facts and original documents; review downloads do not replace a backup.</p>
        <p>Enabling a scenario requires reviewed year-specific rules, complete facts, independent expected results and qualified final forms. State selection for the first filing release is pending.</p>
      </section>
    </div>
  );
}

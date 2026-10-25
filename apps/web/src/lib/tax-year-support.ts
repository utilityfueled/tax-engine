/** Public capability descriptions. A calculation module is not filing qualification. */
export const taxYearSupportRows = [
  ["2025", "Federal", "Complete taxpayer, spouse and dependent facts", "Form 1040 and implemented schedules; remaining scenario review required", "Experimental calculations and redacted review PDFs", "Unavailable"],
  ["2025", "Pennsylvania", "Resident; explicit nonresident or part-year allocations", "PA-40; income-class schedules, forgiveness, care/working-family credits and local EIT modules", "Experimental PA-40 review PDF; supporting schedules are reference summaries", "Unavailable"],
  ["2025", "Ohio", "Full-year resident; nonresident and part-year returns unavailable", "IT 1040, adjustments, business income, credits, withholding and school district modules; municipal returns unavailable", "Experimental calculations and reference summaries; no filled official Ohio forms", "Unavailable"],
  ["2025", "New York", "Full-year state resident; NYC/Yonkers facts required where relevant", "IT-201; partial-year city changes require actual IT-360.1 values; IT-203 state nonresident/part-year return unavailable", "Experimental IT-201 review PDF; city attachments are not a complete filing packet", "Unavailable"],
  ["2025", "New Jersey", "Resident or actual months of part-year residency", "NJ-1040 and implemented resident schedules; NJ-1040NR unavailable", "Experimental NJ-1040 review PDF; supporting forms remain incomplete", "Unavailable"],
  ["2025", "Illinois", "Resident; Schedule NR allocation inputs for nonresident/part-year cases", "IL-1040, Schedule NR and implemented credit/withholding modules", "Experimental IL-1040 review PDF; supporting attachments remain incomplete", "Unavailable"],
  ["2025", "California", "Resident and nonresident/part-year calculation components", "Form 540 and 540NR tax, deduction, credit and AMT components; complete scenario review pending", "Experimental calculation components; no official California return PDF packet", "Unavailable"],
  ["2025", "Other states and DC", "No qualified residency scenarios", "Generic draft calculations or no general income-tax path; special and local taxes may be missing", "Experimental previews where implemented", "Unavailable"],
  ...["Federal", "Pennsylvania", "Ohio", "New York", "New Jersey", "Illinois", "California", "Other states and DC"].map(jurisdiction => [
    "2026", jurisdiction, "No qualified residency scenarios", "Year-specific rules, conformity, facts and final forms remain under review", "Save facts and encrypted local backups; full return calculation and PDFs unavailable", "Unavailable",
  ]),
  ["Other years", "All jurisdictions", "Unsupported full returns", "Historical worksheets do not enable a full return for another year", "No implicit fallback to another year's calculation or forms", "Unavailable"],
] as const;

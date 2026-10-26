# Mixed employee and business tip deduction attribution

Status: a controlling source method remains unresolved. This is not implemented
by the existing unsupported guard and does not complete the named tips/QBI
requirement. No taxpayer is expected to choose a legal allocation formula.

Official sources refreshed October25,2026:

- [IRC224(b)/(c)](https://uscode.house.gov/us/usc/119-118/t26/s224/): one return-level cap and MAGI reduction, with a separate business net-income constraint.
- [IRC199A(c)(4)(D)](https://uscode.house.gov/us/usc/119-118/t26/s199A/): QBI excludes amounts for which the qualified-tip deduction is allowable.
- [Final T.D.10044, independent-contractor comments](https://www.irs.gov/irb/2026-18_IRB): the maximum applies per return; the discussion leaves application of that limit to return instructions.
- [Final2025 Schedule1-A instructions](https://www.irs.gov/instructions/i1040gi), line5 and the multiple-business worksheet: actual business net income incorporates allocable business deductions, then the qualified business tips join employee tips before the shared limitation.
- [Final2025 Form8995-A instructions](https://www.irs.gov/instructions/i8995a), Determining Your QBI: exclude deducted qualified-tip amounts.
- [Draft2026 Form8995 instructions](https://www.irs.gov/pub/irs-dft/i8995--dft.pdf), pages1/3/4: repeats the tip/QBI exclusion but is not a final form or qualification source.

I did not locate in these sources a method assigning the final reduced deduction
between employee tips and one or more businesses after the shared cap or MAGI
reduction. The multiple-business worksheet addresses the pre-limit net-income
amount; it does not resolve that final source attribution. Notice2025-69 and
current IRS tip-recordkeeping guidance address reporting and qualification but
also do not supply that missing attribution in the inspected text.

For a derived illustration only, actual eligible employee tips20,000 and
business tips10,000 can meet a combined25,000 cap. A formula must identify which
business-tip amount is included in that final deduction before reducing that
business's QBI. Employee-first, business-first and proportional attribution are
different calculations; none is selected without controlling authority. No
current tax result or taxpayer fact is inferred from this illustration.

The current source resolver supports unreduced mixed tips and the supported
sole-business deduction. The reduced mixed branch in
`src/engine/forms/schedule-1-a-return.ts` remains explicitly unavailable.
Required next action: a qualified tax reviewer supplies the controlling
allocation/rounding interpretation and authority, or a later official
instruction supplies it. Then add the YAML method, independently derived edge
cases, canonical/QBI/audit coordination and source-bound review output. This
research result is separate from general human qualification and from the
negative-net section1202/Form172 interpretation question.

A separate federal-law agent independently reviewed the source question and the
cited instructions on October 25. That review did not locate the missing final
attribution method either. This confirms the research boundary only; it is not
a qualified human interpretation or evidence that no other authority exists.

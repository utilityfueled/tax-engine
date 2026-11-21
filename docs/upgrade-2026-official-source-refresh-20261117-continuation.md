# Annual official forms recheck, November 17 at 19:31 UTC

Twenty unauthenticated official GETs completed at 19:31:21–19:31:24 UTC:
eight HTTP 200 responses, twelve HTTP 404 responses, seven PDFs and no transport
failures. Nineteen bodies match the November 15 receipts exactly. The remaining
Pennsylvania HTML change consists only of UUID values. Every saved response
was rehashed; the seven PDFs were opened with the existing pypdf environment
and their first two pages extracted. This is a bounded endpoint observation,
not proof that no other publication path exists.

| Official source inspected | Actual annual identity or access result |
| --- | --- |
| [IRS current Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) | Printed tax year 2025; unchanged bytes. |
| [IRS current Form 1040 instructions](https://www.irs.gov/pub/irs-pdf/i1040gi.pdf) | Tax year 2025, dated February 25, 2026; unchanged bytes. The publication date does not make these 2026-return instructions. |
| [IRS current Tax/EIC tables](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf) | Publication 1040 for 2025 returns, including the 2025 Tax and EIC tables; unchanged bytes. |
| [IRS draft Form 1040](https://www.irs.gov/pub/irs-dft/f1040--dft.pdf) and [draft Publication 1040](https://www.irs.gov/pub/irs-dft/p1040--dft.pdf) | Both actual 2026 products retain their draft covers; unchanged bytes. |
| [Pennsylvania PIT page](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) and its [2025 PA-40](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40.pdf) | Linked annual return still prints 2025. Paired 2026 PA-40, booklet and NRH paths return 404. |
| [Ohio current annual bundle control](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/1040-bundle.pdf) | Actual IT 1040 prints 2025; unchanged bytes. Paired 2026 bundle, booklet and NRC paths return 404. |
| [Ohio forms index](https://tax.ohio.gov/home/forms/tax-forms) and [income-tax alerts](https://tax.ohio.gov/individual/resources/individualincome) | Direct GETs return 404. Search indexing still advertises draft 2026 instructions dated November 13; indexed discovery does not establish accessible draft bytes or final qualification. |

The four paired IRS `irs-prior` 2026 annual form/instructions/table paths also
return 404. Separately available estimated-payment forms and draft materials do
not qualify a final annual return. Final 2026 parent Form 1040, annual
instructions, Tax/EIC tables and applicable PA/Ohio final annual packets still
need actual final revisions, reviewed maps and qualified independent signoff.
No tax calculation, template, support claim or filing gate changed.

Raw bodies, extraction text and exact requested/final URLs are retained privately
in `.local/upgrade-evidence/nov17-official-annual-continuation/`.
The `receipts.json` SHA-256 is
`5b4532f2d681bb81da2cdc23defab7a0cda29e77e08639643fa133fbbfb83fb5`.
This is an engineering source observation; it is not independent human review.

## November 19 endpoint recheck

The later official-source search confirmed that the Pennsylvania PIT page still links the 2025 PA-40. Ohio's file titled “2026 PIT VDA bundle” contains earlier annual returns, including a 2025 IT 1040, and does not establish a final 2026 annual form. The IRS still lists 2026 Form 1040 and Publication 1040 on the draft page. [Pennsylvania PIT forms](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) · [Ohio VDA bundle](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/ohio_individual/individual/2026-pit-vda-bundle.pdf) · [IRS 1040 drafts](https://www.irs.gov/draft-tax-forms?find=1040&items_per_page=25&order=natural_sort_field&page=3&sort=desc).

Twenty-two bounded official requests produced 11 successful responses and 11 HTTP 404 responses. The current federal Form 1040, annual instructions and Tax/EIC tables still identify tax year 2025. The 2026 Form 1040 remains a draft. The Pennsylvania and Ohio controls still identify tax year 2025 and the tested 2026 annual form, instructions and residency-schedule URLs returned 404. These observations cover the recorded URLs. [IRS current Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) · [IRS 2026 draft](https://www.irs.gov/pub/irs-dft/f1040--dft.pdf) · [Pennsylvania income tax](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) · [Ohio filing forms](https://tax.ohio.gov/individual/file-now/file-now-page)

The current Form 1045 and its instructions and Form 1095-A and its instructions all identify 2026. The 1045 instructions refer readers to Form 172 for the NOL calculation, leaving the §1202 interpretation open. [Form 1045 instructions](https://www.irs.gov/pub/irs-pdf/i1045.pdf) · [Form 172 instructions](https://www.irs.gov/pub/irs-pdf/i172.pdf) · [Form 1095-A instructions](https://www.irs.gov/pub/irs-pdf/i1095a.pdf)

Private `nov19-annual-official-status` receipts SHA-256 `2f5119df127712151c8fa6c8ef93cb41a538dbdba3c9edae796ca66d2b9923ed` and Pennsylvania receipts SHA-256 `52e817fe9466b21c74c27cc489a8be236a0d361fdd82e107423ad4404b5f3a2b`.

## November 20 education form recheck

The IRS posted the final 2026 Form 8863 blank on November 17. The downloaded
blank matched the pinned candidate. The latest final instructions in the
product index are for 2025, and the 2026 instructions dated September 11 are
still a draft. The 2026 candidate remains disabled pending qualification.
[IRS product index](https://www.irs.gov/forms-instructions-and-publications?find=8863+&items_per_page=25&order=picklist_revision_date_iso&sort=desc) ·
[2026 blank](https://www.irs.gov/pub/irs-pdf/f8863.pdf) ·
[2026 draft instructions](https://www.irs.gov/pub/irs-dft/i8863--dft.pdf).

## November 20 final Forms 7206 and 8829

The IRS posted the final 2026 blanks for Forms 7206 and 8829 on November 19.
Form 7206 keeps the Schedule 1 line 17 transfer and prints the 2026 long-term
care limits. Form 8829 keeps the Schedule C line 30 transfer and carries
separate operating-expense and depreciation amounts to 2027. The regular
Form 8829 instructions still identify 2025. The August 19 annual instructions
remain a draft. Both physical candidates are disabled pending annual
qualification. [Form 7206](https://www.irs.gov/pub/irs-pdf/f7206.pdf) ·
[Form 8829](https://www.irs.gov/pub/irs-pdf/f8829.pdf) ·
[Regular Form 8829 instructions](https://www.irs.gov/pub/irs-pdf/i8829.pdf) ·
[Draft Form 8829 instructions](https://www.irs.gov/pub/irs-dft/i8829--dft.pdf).

## November 20 final Schedule EIC

The IRS posted the final 2026 Schedule EIC on November 19. The two-page
schedule refers to Form 1040 line 27a and has 38 widgets on its first page.
The current final Form 1040, annual instructions and Tax/EIC tables still
print 2025. The final Schedule EIC is pinned as a disabled candidate.
[IRS PDF directory](https://www.irs.gov/downloads/irs-pdf?%3Border=Description&page=0) ·
[Schedule EIC](https://www.irs.gov/pub/irs-pdf/f1040sei.pdf) ·
[Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[Instructions](https://www.irs.gov/pub/irs-pdf/i1040gi.pdf) ·
[Tax/EIC tables](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf).

## November 20 annual availability recheck

The regular copies of Form 1040, its instructions, the Tax/EIC tables, and
the instructions for Forms 7206 and 8829 still identify tax year 2025.
The November 19 final Schedule EIC, Form 7206 and Form 8829 blanks remain
disabled pending annual qualification.
[Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[Form 1040 instructions](https://www.irs.gov/pub/irs-pdf/i1040gi.pdf) ·
[Tax/EIC tables](https://www.irs.gov/pub/irs-pdf/i1040tt.pdf) ·
[Form 7206 instructions](https://www.irs.gov/pub/irs-pdf/i7206.pdf) ·
[Form 8829 instructions](https://www.irs.gov/pub/irs-pdf/i8829.pdf).

Pennsylvania still links the 2025 PA-40 and annual instructions. Ohio's
forms index still lists the 2025 IT 1040 and SD 100 and their combined
instructions. The indexed Ohio alerts describe the November 6 forms and
November 13 instructions as drafts. Ohio's indexed 2026 updates confirm
the rate and modified AGI treatment already in the 2026 spec. Direct
retrieval of the Ohio alerts and updates pages returned 404, so the final
line maps stay gated.
[Pennsylvania PIT](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) ·
[Ohio forms index](https://tax.ohio.gov/business/get-a-form/tax-forms) ·
[Ohio alert archive](https://tax.ohio.gov/individual/resources/individualincome) ·
[Ohio annual changes](https://tax.ohio.gov/individual/who-must-file/whats-new).

## November 20 final Form 2106 blank

The current and annual archive copies match. The two-page form prints tax year
2026 and `Created 8/18/26`. The IRS directory lists a November 20 posting.
The regular instructions still identify tax year 2025. The 2026 blank is pinned
with 87 widgets as a disabled candidate. Schedule 1 line 12 retains its
existing manual total, and this candidate supplies no calculation or export map.
[Current Form 2106](https://www.irs.gov/pub/irs-pdf/f2106.pdf) ·
[Annual archive](https://www.irs.gov/pub/irs-prior/f2106--2026.pdf) ·
[Current instructions](https://www.irs.gov/pub/irs-pdf/i2106.pdf).

## November 20 Form 8919 and Schedule B instructions

The IRS posted the final Form 8919 on November 20. The regular and annual
archive PDFs match. The two-page form prints 2026 and `Created 5/14/26`, with
40 widgets on page one and instructions on page two. The 2026 wage base is
$184,500. Line 6 references Form 1040 line 1g and Form 8959 line 3 when required.
Line 13 references Schedule 2 line 16b. The physical candidate is pinned with
exports disabled. The annual calculation and transfers still require qualification.
[Current Form 8919](https://www.irs.gov/pub/irs-pdf/f8919.pdf) ·
[Annual archive](https://www.irs.gov/pub/irs-prior/f8919--2026.pdf).

The regular Schedule B instructions print tax year 2026 and November 6, 2026
on page one. The IRS PDF directory lists them on November 20. The product
catalog labels the instructions 2025, and the regular Schedule B blank still
prints 2025. The three-page instructions had SHA-256
`cb1efb3dd0da7c6ec7eaab7a8f59730c323a692ff96dba679fe94515facc73c0`
at retrieval on November 20 at 22:46:07 UTC. The instructions can support
annual source review while the 2026 blank and parent return remain pending.
[Current Schedule B instructions](https://www.irs.gov/pub/irs-pdf/i1040sb.pdf) ·
[IRS PDF directory](https://www.irs.gov/downloads/irs-pdf?page=0) ·
[IRS product catalog](https://www.irs.gov/forms-instructions-and-publications?find=Form+1040+Schedule+B) ·
[Current Schedule B](https://www.irs.gov/pub/irs-pdf/f1040sb.pdf).

## November 20 recheck of five required federal and state forms

The IRS regular PDFs for Form 1040, Schedule 2 and Form 2441 still print
2025. All three separate 2026 PDFs carry draft covers. Pennsylvania still
links the 2025 PA-40. Ohio's indexed agency catalog lists the 2025 IT 1040
with a December 2025 revision. Its November alerts classify the 2026 forms
and instructions as drafts. Direct retrieval of the Ohio catalog returned
404, so that check used the indexed catalog and the agency alerts.
[IRS Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[IRS Schedule 2](https://www.irs.gov/pub/irs-pdf/f1040s2.pdf) ·
[IRS Form 2441](https://www.irs.gov/pub/irs-pdf/f2441.pdf) ·
[Pennsylvania forms](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) ·
[Ohio forms catalog](https://tax.ohio.gov/home/forms) ·
[Ohio alerts](https://tax.ohio.gov/individual/resources/individualincome).

## November 20 final 2026 employer coverage statement

The current IRS Form 1095-C and its combined instructions both print
2026 and carry no draft notice. The form PDF has four pages. Its SHA-256
is `9352f74d93a3015c48a9971b5243e7ba5bfb0cef68ff987bc6916f2fc9957c98`.
The instructions have 21 pages and SHA-256
`e936f09b46722d23d4a1ab01e5944df34aa1e34b851135fbe8ab7feb90800ffb`.
[Final Form 1095-C](https://www.irs.gov/pub/irs-pdf/f1095c.pdf) ·
[Final instructions](https://www.irs.gov/pub/irs-pdf/i109495c.pdf).

Line 14 identifies an offer for the employee and, depending on the code,
for family members. Line 15 generally reports the lowest-cost self-only
employee contribution where required, and a printed zero carries
information that a blank does not. Line 16 code 2C documents employee
enrollment subject to its reporting exceptions. Other codes or a blank
do not establish nonenrollment or an affordability conclusion. Part III
indicates at least one day of self-insured coverage for a named person
in a checked month. These source facts can support the existing monthly
evidence. The Form 8962 exception facts and the applicable household
premium calculations still need their own sources and review. This
update does not qualify a new extractor or change benefit determination.
[Employee instructions on the final form](https://www.irs.gov/pub/irs-pdf/f1095c.pdf#page=3) ·
[Line 14 to 16 instructions](https://www.irs.gov/pub/irs-pdf/i109495c.pdf).

## November 21 selected annual products

The IRS current-result endpoints still identify Form 1040, Schedule 1,
Schedule B, Form 6251, Form 8962, and Form 8949 as 2025. The current
Schedule B instructions are 2026. The final Form 2106 and Form 7206
blanks identify 2026. Their currently published instructions identify
2025. The corresponding annual export entries retain their holds.
[IRS products](https://www.irs.gov/forms-instructions-and-publications) ·
[Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[Schedule 1](https://www.irs.gov/pub/irs-pdf/f1040s1.pdf) ·
[Schedule B](https://www.irs.gov/pub/irs-pdf/f1040sb.pdf).

Pennsylvania's current income tax page links to the 2025 PA-40. Ohio's
current forms index still shows the 2025 Ohio IT 1040, with 2026 bracket
guidance available separately. Final 2026 individual return review and
exports remain open for both states.
[PA income tax](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) ·
[Ohio forms](https://tax.ohio.gov/home/forms/tax-forms) ·
[Ohio bracket guidance](https://tax.ohio.gov/individual/who-must-file/whats-new).

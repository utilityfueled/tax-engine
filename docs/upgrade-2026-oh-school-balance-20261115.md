# Final 2025 Ohio school-district original balance sources

The finite existing ordinary SD100 source route now represents an unpaid
balance, an expected full payment and an actual payment sent with the current
original return separately. A synthetic $1,000 school tax with $900 withholding
shows $100 on lines16/18 in all three cases. Only the actual complete $100
receipt and matching credited account settle the cash outstanding to zero.
The remittance never becomes a second printed line12 credit.

Authority: [final2025 Ohio IT1040/SD100 instructions](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf),
printed page58, retrieved November15,2026, SHA256
`931b21e7484ba96e561cf2346d8a7d2a8005bd990724b5903c9a90acede5f50e`;
[Ohio Revised Code5747.08(G),(H)](https://codes.ohio.gov/ohio-revised-code/section-5747.08),
effective September30,2025. The principal is due April15,2026. The route rejects
late/partial/overpaid settlements and requires its existing separate quarterly
penalty checks. New positive balance originals require whole-dollar principal
above $1 and independently known credited amounts, including explicit zero.
Receipt owner/year/district/date/confirmation and original-filed date reconcile;
IT1040 and SD payments cannot reuse a confirmation. Missing facts never become
zero, and expected payments never become actual cash.

Spec first and genuine predecessor failures are retained privately in
`nov15-oh-sd-balance-candidate`. Author and main adoption each pass450 tests in10
suites, including the eight unchanged historical serialization hashes.
Independent engineering review added11 controls across Ohio and guided sources;
all21 selected tests pass in3 suites. Main types,9,228 valid spec references and
scoped lint pass with zero errors/warnings. Root review receipt:
`3d22c6bc6cd5020aefaace73f919e3bdf366e87daedf57f1d3e406330e30c6ca`.
Six-file source freeze:
`38113a98910786224efaa849f7e1038acd02d342171b4726b9d124c6f10dc040`.
Adoption also replaces the redundant remaining-balance subtraction with the
equivalent full-or-zero equality; this is an arithmetic-free validation cleanup,
not a claimed newly reproduced tax defect.

The finite2025 original-source route does not qualify guided collection,
new district methods, final2026 forms, physical export or filing. Those paths
remain independently gated. Human tax review is still unassigned. The earlier
a32 local/runtime evidence excludes this subsequent code; combined checks follow.

# Actual education expense capacity

A tuition-plan distribution now receives the qualified room-and-board capacity
allocated to its actual source. Ordinary spending that was never allocated to
an education distribution no longer dilutes that capacity. Original expense,
distribution, beneficiary and election facts are preserved.

## Sources and literal controls

Refreshed October 25, 2026:

- [IRC529(e)(3)(B)](https://uscode.house.gov/us/usc/119-118/t26/s529/)
  limits eligible room and board using the school allowance or the actual
  institution-owned housing charge, subject to attendance requirements.
- [Publication970, chapter7](https://www.irs.gov/publications/p970) coordinates
  actual adjusted qualified expenses with distribution earnings and basis.

With10000 actual room-and-board expense, a3000 qualifying school allowance and
only4000 allocated to an actual distribution with800 earnings, adjusted qualified
expense is3000. Excluded earnings are600, taxable earnings200 and additional
tax20. The old denominator included the unallocated6000 ordinary spending and
incorrectly produced1200 qualified expense and560 taxable earnings.

Two actual2000 distributions share the same3000 capacity at1500 each; earnings
400 and800 produce900 total excluded earnings and300 taxable earnings. Reversing
the source order preserves the keyed result. A smaller2000 allocation remains
fully within capacity. Known non-half-time attendance produces zero qualifying
room and board; an unknown required allowance rejects.

These are derived source controls, not published IRS numerical examples or
independent human qualification. This correction does not implement partially
qualified in-kind, mixed-owner bond or other separately bounded methods. Existing
filing and year-readiness gates remain unchanged.

## Verification and review

The YAML specification preceded two failing regressions. The four-line Decimal
correction passes43 focused cases across four files, then160 adjacent cases across
16 files, including canonical, guided and review-PDF paths. Root types,4777 spec
references and scoped lint pass with zero errors or warnings. No existing test
expectation changed. The frozen three-file manifest is
`.local/upgrade-evidence/qtp-expense-cap-snapshot.json`, based on0ffaa3d.

A separate agent passed the two package cases and five independent controls:
actual institution charge3500 overrides allowance3000; unequal3000/1000 source
allocations divide a3000 cap at2250/750; explicit zero allocation retains taxable
earnings; missing housing facts and excess source allocation reject; original
inputs remain unchanged. No actionable finding remained. The first private probe
runner hit a sandbox IPC restriction; the same probe passed using the Node import
loader, with no source change. This is bounded software/source review only.

Coordinated rule revisions are2025.85/2026.81. Final integration checks are recorded
below before the scoped commit and normal push.

Evidence SHA256 under `.local/upgrade-evidence/`:

- `qtp-expense-cap-red.log`: `5f5c9f1c85d602f721d77aae1944c1c4d1dad1554777525ccd57eb49153e4646`
- `qtp-expense-cap-green.log`: `99b839668249e1abf28e23d87a1b1b9e80de4dce8b79cb3311a03dc508048dde`
- `qtp-expense-cap-tests.log`: `5ed57133f7f1fb813ec073492d5cf7ac3480099c91ef9b3461be26a6ce412ecd`
- `qtp-expense-cap-types.log`: `2b60915aa1d4cf7b9eda15eb6bab1de102475a895f9cc91de930ca81b0f36bb6`
- `qtp-expense-cap-spec.log`: `23c1b7ca71beb038814d49c1a1b808f9651a248ab2b7af132c8fa5b677e854f8`
- `qtp-expense-cap-lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `ai-qtp-expense-cap-review.log`: `d69d6167fa1a71ec5e1057122778fc6867c75166d35be1c7b399f7a15ec53633`

Final integration on6029f70, tree `d99a9f6de87b8877e54bb26b0fe0780542c13a45`,
passes49 cases in seven files, root types,4795 spec references and scoped lint
with zero errors or warnings. The reviewed three source/spec/test files are
unchanged; only rule provenance and this evidence were added.

- `qtp-expense-cap-final-tests.log`: `5544bb4150efec4d0d5df80270f82494c8f4811d8bd22a1fbd65fbf5fbea2fe9`
- `qtp-expense-cap-final-types.log`: `fb104b02c2d63909d111427d6911e44fdefc9631a96d40b0774896720f1d95c3`
- `qtp-expense-cap-final-spec.log`: `7d90dd895c1654c0ba9cceface728664480e3be0ab86da3b166658bf524c2954`
- `qtp-expense-cap-final-lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

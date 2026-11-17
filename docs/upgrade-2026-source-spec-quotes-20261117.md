# November 17 source-runner spec reference repair

Current-source remote coverage run44040017712 reports28,994passing tests and
one failure: `postgres-source-candidates-amd64.yaml has no testRef entries`.
Its five references exist, but their unquoted YAML labels are invisible to the
existing strict reference validator. Root reproduced that exact failure locally.

The repair quotes only eleven literals: form, five line labels and five test
references. Parsed YAML values and complete inverse source bytes are unchanged.
No validator, assertion, threshold or runtime source changes. Root and independent
runs each pass970tests across the full reference-validation and source-runner
files. All9,426spec references validate; inventory check passes. A new global
coverage run remains required; this focused result does not erase the original
remote failure.

Private packet: `nov17-quoted-source-spec-fix`; root review SHA256
`59a7a6d316589bfc5e699a6fa29e0926d672a59962ba726c4d8a0372f7171a42`; independent review
`598928cf0697909df45e8ede37d51f3d41c55879e5dcadd8f27a1f37a0d082cb`.

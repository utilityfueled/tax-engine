# Guided review and original uploads stay local

The advanced workspace already builds guided validation and parses original
documents in the browser. Before `e4e56480`, reopening an incomplete return
automatically posted section IDs, labels and issue descriptions to the old
guided summary endpoint. A production-build Chromium regression observed that
POST. The adapter did not send it to a live provider in this rehearsal. The
retired document-detection endpoint had no shipped browser caller and exposed
a separate multipart original-document parser.

The workspace shows the existing validation message and repair action in the
browser. Both obsolete endpoint handlers were removed. The first production
successor passed 35 of 36 cases. Next.js still tried to parse a multipart POST
at the unmatched old URL and returned 409. Middleware now rejects the two
exact retired URLs with a non-cacheable 404 before body handling. The production
route table omits both handlers. The browser upload path, optional redacted AI
routes and their consent and billing controls remain in use.

The successor passed all 36 Chromium cases, with zero skips or failures, and
63 middleware and parser tests. Web types, model registry, 8,859 spec references,
coverage inventory and diff check passed. Scoped lint reported three existing
non-null assertion warnings and zero errors. The request audit now collects 621
cases with the same limits and five declared hosted-only skips. The selected
production-build run did not execute those hosted cases.

Private evidence is under `.local/upgrade-evidence/nov13-local-guided-review`.
The SHA-256 of `browser-middleware.log` is
`a0673e84469c990fc9445426903ccf1abb68a71dfc4773406343b229df6998b2`.
The first stable failure is in `browser-final.log`. The two earlier managed
runner attempts rejected source drift before any cases. Final protected Preview,
container qualification and independent security/privacy review remain open.

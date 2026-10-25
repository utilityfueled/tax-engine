# Child election reference labels

Source refreshed2026-10-25: final2025[Form8814 instructions](https://www.irs.gov/instructions/i8814), line1b and the enumerated parent-return transfers. Child tax-exempt interest remains child worksheet information and does not become parent1040line2a. The pure income computation does not itself establish all election eligibility.

The spec and failing packet-summary assertions preceded the mapper change. The reference PDF now labels child exempt interest separately and states that eligibility is validated separately. The old strict lower-threshold prose is corrected. Arithmetic multiplication remains legible after ASCII PDF sanitation. No tax computation or filing gate changed.

Parent61-case child/PDF/foreign integration passes. Independent agent review inspected the three-file source delta against official instructions and found no scoped actionable issue; its focused saved-PDF check passes. This is software review, not human tax qualification. A one-page synthetic packet was reopened with pypdf and rendered with Poppler; child500.25 exempt interest, reference-only warning and eligibility language were verified. Fontconfig emitted local cache warnings but the complete page was visually inspected without clipping or overlap. Isolated tree `d0365055ce9b2ff8ef4db97fbc2409877d93764a` on `55c07e7` passes46tests, root types,4,129spec references and scoped lint with zero errors/three existing test warnings. The final rendered page was inspected after the multiplication/heading update. The final pypdf checks verify the ASCII multiplication and exact child-only label.

Local evidence SHA-256:

- `child-reference-unit.log`: `ce1a4a0f2bf1497ec3f264ee27bc45148bde15b29218d354275225aededdeeb3`
- `child-reference-wording-red.log`: `86a61ce6951619b204f80e9cbcda156e86ad5697d98fbe90ac9c6acfb720cf6c`
- `child-exempt-label-red.log`: `5b975ac51b9d00d672e75ce6f2b6313b99a50243b113a32b1201af53ff4ff895`
- `ai-child-reference-review.log`: `e0b443b0f6a757c2e432e2e710833839466fd0d543d1048b8d6e7d2c1f4a2735`
- `child-reference-render/f8814-reference-filled.pdf`: `16c3dba7f73738d1406233bc68cf8e78908368cd7402c1ba4b60b07aed883131`
- `child-reference-render/final-page-1.png`: `86e58b1c1b731933b5d60f6e0d1d46b35d151e27d38a5459de53c251e5565e3e`
- `child-reference-render/text.txt`: `1d76ab6b85ac2df5e1eea93a2118449fd6b846d9326a36ffba538067e9ffda92`

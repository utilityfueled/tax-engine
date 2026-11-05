# Pinned Vercel pool lifecycle dependency

The web package now pins `@vercel/functions`3.10.6, preparing the official shared-pool lifecycle hook. This commit adds17 dependency versions and changes no existing package/snapshot version, peer selection or override. The runtime hook remains a separate change.

Frozen installation with scripts disabled and strict peers, frozen/offline lock validation, both audits, allthree type checks, both builds and lint pass. Production447/all539 audit entries have zero reported vulnerabilities; existing11863 lint warnings remain. The installed subpath loads exactlythree official-tarball-identical modules without new global properties. All76 browser orchestration/cache controls and actual source audit pass; exactlytwo manifest/lock hashes change and all148contracts/580declared cases remain intact.

Official sources: [Vercel connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions), [Functions API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool), and official npm metadata/tarballs retained with retrieval receipts. Author234manifest `771f0bce0de34061b0a453ec8538a50661169bc6b5137990dcade423177493ea`, distinct root10 `ba08a0d9e02a798861f2a4b4489bf274a0e7e1bdcaf0d11ba61ad91e088cf7c1`; installed evidence 31manifest `47963467f028e612b24e5fe56be12b0782840cd5c8234c05bc80eac39d4445e6`.

This is a dependency verification result. Existing image advisories, actual hosted pool draining, current distribution qualification, security/human reviews and release readiness remain open.

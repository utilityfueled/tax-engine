import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// DSA-6613-1, verified against Debian's signed trixie-security package index.
const packages = {
  amd64: { snapshot: "d2eca18b98f94b9179c90e09da4760a27ad1e107", bytes: 88720, sha256: "8c27c342230503b73dfde629642c3b352e87b554e06d60cf58772f236a305ceb" },
  arm64: { snapshot: "3ba1e9072e91c9d9034c778b94c58e40047ac566", bytes: 85028, sha256: "0e41b3d7ad8ad7fcd36dd4d61ca91a70018478fc4af652e044f4be770784ddff" },
  ppc64el: { snapshot: "9bb7bc7fd22cb73ca85eb7163277e97a6218d4ae", bytes: 87340, sha256: "b78324aed52229bf4b984553f68bf710b2faa41da43250355d072d2ab2f2d11c" },
  s390x: { snapshot: "a1b69065c75effb594bdd7b972e0241b16e3a70d", bytes: 86816, sha256: "b1ba54fa14d8bd9ecb4ef322ca4bc5abb67a68ce5914712bacd401b122d959e5" },
};
const oldVersion = "1:1.3.dfsg+really1.3.1-1+b1";
const fixedVersion = "1:1.3.dfsg+really1.3.1-1+deb13u1";
const installedPackage = () => execFileSync("dpkg-query", ["-W", "-f=${Version}\t${Status}", "zlib1g"], { encoding: "utf8" });
const architecture = execFileSync("dpkg", ["--print-architecture"], { encoding: "utf8" }).trim();
if (!Object.hasOwn(packages, architecture)) throw new Error("Unsupported Debian zlib package architecture.");
if (installedPackage() !== `${oldVersion}\tinstall ok installed`) throw new Error("Unexpected zlib1g version in the pinned Debian base.");

const pin = packages[architecture];
const response = await fetch(`https://snapshot.debian.org/file/${pin.snapshot}`, {
  redirect: "error",
  signal: globalThis.AbortSignal.timeout(30_000),
});
if (!response.ok || !response.body) throw new Error("Debian zlib package download failed.");
const contents = Buffer.alloc(pin.bytes);
let received = 0;
for await (const chunk of response.body) {
  if (received + chunk.byteLength > pin.bytes) throw new Error("Debian zlib package exceeded its expected size.");
  contents.set(chunk, received);
  received += chunk.byteLength;
}
if (received !== pin.bytes || createHash("sha256").update(contents).digest("hex") !== pin.sha256) {
  throw new Error("Debian zlib package integrity mismatch.");
}

const directory = mkdtempSync("/tmp/debian-zlib-");
try {
  const archive = join(directory, "zlib1g.deb");
  writeFileSync(archive, contents, { flag: "wx", mode: 0o600 });
  execFileSync("dpkg", ["--install", archive], { stdio: "inherit" });
  if (installedPackage() !== `${fixedVersion}\tinstall ok installed`) throw new Error("Debian zlib security update did not install.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

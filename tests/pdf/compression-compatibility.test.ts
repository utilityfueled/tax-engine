// Spec: spec/federal/pdf-review-policy.yaml compression-byte-compatibility.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import { expect, it } from "vitest";

type Options = { level?: number; raw?: boolean; gzip?: boolean; dictionary?: Uint8Array; strategy?: number };
type Stream = { result: Uint8Array; err: number; push(data: Uint8Array, flush: boolean | number): boolean; onData(data: Uint8Array): void };
type Pako = { deflate(input: Uint8Array, options?: Options): Uint8Array; Deflate: new (options?: Options) => Stream };
const load = createRequire(createRequire(import.meta.url).resolve("pdf-lib"));
const candidate = load("pako") as Pako;
// The published bundle is unchanged by the patch to lib/zlib/deflate.js.
const baseline = load("pako/dist/pako.js") as Pako;
const buffers = load("pako/lib/utils/common.js") as { setTyped(typed: boolean): void };
const dictionary = new TextEncoder().encode("source evidence audit reference privacy");
const optionsToCheck: Options[] = [{}, { level: 0 }, { level: 1 }, { level: 9 }, { raw: true },
  { gzip: true }, { dictionary }, { strategy: 3 }];
const resetOptions: Options[] = [{}, { raw: true }, { gzip: true }];
const records = [
  new Uint8Array(),
  new TextEncoder().encode("BT /F1 10 Tf (149850.00000000000000000000001 source evidence) Tj ET"),
  new TextEncoder().encode("source evidence audit reference privacy\n".repeat(2500)),
  Uint8Array.from({ length: 70000 }, (_, index) => ((index * 73) ^ (index >>> 4)) & 255),
];

it("preserves compressed bytes and independent decoding across reset modes", () => {
  for (const typed of [true, false]) {
    buffers.setTyped(typed);
    try {
      for (const input of records) for (const options of optionsToCheck) {
        const actual = Buffer.from(candidate.deflate(input, options));
        expect(actual.equals(Buffer.from(baseline.deflate(input, options)))).toBe(true);
        const decoded = options.gzip ? gunzipSync(actual) : options.raw
          ? inflateRawSync(actual) : inflateSync(actual, { dictionary: options.dictionary });
        expect(decoded.equals(Buffer.from(input))).toBe(true);
      }
      // Full flush resets the hash table after it has held actual nonzero data.
      for (const options of resetOptions) {
        const compress = (library: Pako) => {
          const chunks: Buffer[] = [];
          const stream = new library.Deflate(options);
          stream.onData = chunk => chunks.push(Buffer.from(chunk));
          for (const input of records.slice(1)) expect(stream.push(input, 3)).toBe(true);
          expect(stream.push(records[1], true)).toBe(true);
          expect(stream.err).toBe(0);
          return Buffer.concat(chunks);
        };
        const actual = compress(candidate);
        expect(actual.equals(compress(baseline))).toBe(true);
        const decoded = options.gzip ? gunzipSync(actual) : options.raw ? inflateRawSync(actual) : inflateSync(actual);
        expect(decoded.equals(Buffer.concat([...records.slice(1), records[1]].map(x => Buffer.from(x))))).toBe(true);
      }
    } finally { buffers.setTyped(true); }
  }
});

it("retains the original fallback when native buffer filling is unavailable", () => {
  // Remove methods only in an isolated child; the test runner's globals stay intact.
  const result = execFileSync(process.execPath, ["-e", `
const load = require('node:module').createRequire(process.argv[1]);
const pako = load('pako');
const original = load('pako/dist/pako.js');
const utils = load('pako/lib/utils/common.js');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
Uint8Array.prototype.fill = undefined;
Uint16Array.prototype.fill = undefined;
Int32Array.prototype.fill = undefined;
Array.prototype.fill = undefined;
const input = Buffer.from('unchanged source and privacy notice '.repeat(2000));
for (const typed of [true, false]) {
  utils.setTyped(typed);
  const actual = Buffer.from(pako.deflate(input));
  assert.deepEqual(actual, Buffer.from(original.deflate(input)));
  assert.deepEqual(zlib.inflateSync(actual), input);
}
process.stdout.write('compatible');
`, load.resolve("pako")], { encoding: "utf8", timeout: 5000 });
  expect(result).toBe("compatible");
});

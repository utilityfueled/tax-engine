import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("retains all authenticated paired-fixture Python source and custody controls", () => {
  const env = Object.fromEntries(["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"]
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const result = spawnSync("python3", [resolve("tests/scripts/sqlite-distinct-paired.test.py")], {
    encoding: "utf8", env, timeout: 10_000, maxBuffer: 65_536,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toMatch(/Ran 3 tests/);
});

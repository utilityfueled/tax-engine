import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { expect, it } from "vitest";

it("applies the rehearsed privilege and filesystem boundary to ordinary Compose starts", () => {
  const { services } = parse(readFileSync(resolve("compose.yaml"), "utf8"));
  const web = services.web;
  expect(web.read_only).toBe(true);
  expect(web.cap_drop).toContain("ALL");
  expect(web.security_opt).toContain("no-new-privileges:true");
  expect(web.tmpfs).toContain("/tmp:rw,noexec,nosuid,size=64m");
  expect(web.privileged).not.toBe(true);
  expect(web.volumes ?? []).toEqual([]);
  // The database's explicit data volume remains persistent and writable.
  expect(services.postgres.volumes).toContain("postgres-data:/var/lib/postgresql/data");
  expect(services.postgres.read_only).not.toBe(true);
});

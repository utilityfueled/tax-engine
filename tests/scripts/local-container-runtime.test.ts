import { describe, expect, it, vi } from "vitest";
import { resolveLocalContainerRuntime } from "../../scripts/local-container-runtime.mjs";

describe("local container rehearsal endpoint boundary", () => {
  it("pins the inspected Docker socket and clears competing selectors", () => {
    const read = vi.fn(() => JSON.stringify([{ Endpoints: { docker: { Host: "unix:///tmp/docker.sock" } } }]));
    const result = resolveLocalContainerRuntime("docker", { DOCKER_CONTEXT: "desktop", DOCKER_HOST: "ssh://remote", PATH: "/bin" }, read);
    expect(read.mock.calls[0][1]).toEqual(["context", "inspect", "desktop"]);
    expect(result.args).toEqual(["--host", "unix:///tmp/docker.sock"]);
    expect(result.env).toEqual({ PATH: "/bin" });
  });

  it.each(["ssh://remote", "tcp://remote:2375", "tcp://127.0.0.1:2375", "unix://remote/var/run/docker.sock"])("rejects ambiguous or remote Docker transport %s before mutation", endpoint => {
    const read = vi.fn();
    expect(() => resolveLocalContainerRuntime("docker", { DOCKER_HOST: endpoint }, read)).toThrow(/local socket/);
    expect(read).not.toHaveBeenCalled();
  });

  it("pins a local Podman VM URL and identity instead of inheriting mutable context", () => {
    const read = vi.fn(() => JSON.stringify([{ Name: "vm", URI: "ssh://core@127.0.0.1:51094/run/podman.sock", Identity: "/tmp/vm-key", Default: true }]));
    const result = resolveLocalContainerRuntime("podman", {}, read);
    expect(result.args).toEqual(["--url", "ssh://core@127.0.0.1:51094/run/podman.sock", "--identity", "/tmp/vm-key"]);
  });

  it("honors a named local Podman connection and removes selectors from child environment", () => {
    const read = vi.fn(() => JSON.stringify([{ Name: "vm", URI: "unix:///tmp/podman.sock", Default: false }]));
    const result = resolveLocalContainerRuntime("podman", { CONTAINER_CONNECTION: "vm", DOCKER_CONTEXT: "remote" }, read);
    expect(result.args).toEqual(["--url", "unix:///tmp/podman.sock"]);
    expect(result.env).toEqual({});
  });

  it.each(["ssh://core@remote/run/podman.sock", "ssh://core:secret@127.0.0.1/run/podman.sock", "tcp://127.0.0.1:1234", "unix://remote/run/podman.sock"])("rejects unsafe Podman transport %s", endpoint => {
    expect(() => resolveLocalContainerRuntime("podman", { CONTAINER_HOST: endpoint }, vi.fn())).toThrow(/local socket or loopback Podman VM/);
  });

  it("rejects a missing Podman connection and unknown runtime", () => {
    expect(() => resolveLocalContainerRuntime("podman", {}, () => "[]")).toThrow(/connection/);
    expect(() => resolveLocalContainerRuntime("unexpected", {}, vi.fn())).toThrow(/docker or podman/);
  });
});

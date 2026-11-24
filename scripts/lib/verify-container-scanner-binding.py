"""Bind runtime SBOM and scan evidence to the exact intended native image."""
import base64, hashlib, json, os, re
from pathlib import Path

def unique_keys(pairs):
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ValueError("Container evidence contains a duplicate JSON key")
    return result

hashes = {}

def read_evidence(path):
    data = Path(path).read_bytes()
    hashes[path] = hashlib.sha256(data).hexdigest()
    return json.loads(data, object_pairs_hook=unique_keys)

[expected] = read_evidence("container-candidate.json")
image_id = os.environ["CANDIDATE_IMAGE_ID"]
revision = os.environ["GITHUB_SHA"]
architecture = os.environ["EXPECTED_ARCHITECTURE"]
assert architecture in ("amd64", "arm64")
platform = "linux/" + architecture
allowed_variants = (None, "", "v8") if architecture == "arm64" else (None, "")
revision_label = "org.opencontainers.image.revision"
assert expected["Id"] == image_id and re.fullmatch(r"sha256:[0-9a-f]{64}", image_id)
assert expected["Os"] == "linux" and expected["Architecture"] == architecture
assert expected["Config"]["Labels"][revision_label] == revision

sbom = read_evidence("container.syft.json")
assert sbom["descriptor"]["name"] == "syft" and sbom["descriptor"]["version"] == "1.57.1"
source = sbom["source"]
assert source["type"] == "image"
syft_metadata = source["metadata"]
assert syft_metadata["userInput"] == image_id
assert syft_metadata["os"] == "linux" and syft_metadata["architecture"] == architecture
assert syft_metadata["labels"][revision_label] == revision
raw_config = base64.b64decode(syft_metadata["config"], validate=True)
config_id = "sha256:" + hashlib.sha256(raw_config).hexdigest()
assert syft_metadata["imageID"] == config_id
descriptor = expected.get("Descriptor")
if descriptor and descriptor["mediaType"] in (
    "application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"):
    identity = read_evidence("container-image-identity.json")
    archive_identity = read_evidence("container-archive-verification.json")
    assert identity["version"] == 1 and identity["chainVerified"] is True
    assert identity["source"] == revision and identity["platform"] == platform
    assert identity["targetDigest"] == descriptor["digest"] == image_id
    assert identity["configDigest"] == config_id
    assert identity["candidateSha256"] == hashes["container-candidate.json"]
    assert archive_identity["source"] == revision and archive_identity["imageId"] == image_id
    assert archive_identity["platform"] == platform
    assert archive_identity["imageIdentitySha256"] == hashes["container-image-identity.json"]
    assert archive_identity["archiveSha256"] == identity["archiveSha256"]
    assert re.fullmatch(r"[0-9a-f]{64}", identity["archiveSha256"])
    target_bytes = base64.b64decode(identity["targetBytes"], validate=True)
    manifest_bytes = base64.b64decode(identity["manifestBytes"], validate=True)
    assert 0 < len(target_bytes) <= 16 * 1024 ** 1024
    assert 0 < len(manifest_bytes) <= 16 * 1024 ** 1024
    assert "sha256:" + hashlib.sha256(target_bytes).hexdigest() == image_id
    assert len(target_bytes) == descriptor["size"]
    target = json.loads(target_bytes, object_pairs_hook=unique_keys)
    assert target["schemaVersion"] == 2 and target["mediaType"] == descriptor["mediaType"]
    selected = descriptor
    if "manifests" in target:
        assert isinstance(target["manifests"], list) and 0 < len(target["manifests"]) <= 64
        for d in target["manifests"]:
            assert all(isinstance(d.get("platform", {}).get(k), str) and 0 < len(d["platform"][k]) <= 64 for k in ("os", "architecture"))
        native = [d for d in target["manifests"] if d.get("platform", {}).get("os") == "linux"
                  and d.get("platform", {}).get("architecture") == architecture]
        assert len(native) == 1 and native[0]["platform"].get("variant") in allowed_variants
        selected = native[0]
        for d in target["manifests"]:
            if "unknown" in (d["platform"]["os"], d["platform"]["architecture"]):
                assert (d["platform"]["os"], d["platform"]["architecture"]) == ("unknown", "unknown")
                assert d.get("annotations", {}).get("vnd.docker.reference.type") == "attestation-manifest"
                assert d["annotations"].get("vnd.docker.reference.digest") == selected["digest"]
    assert selected["mediaType"] in ("application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json")
    assert "sha256:" + hashlib.sha256(manifest_bytes).hexdigest() == selected["digest"] == identity["manifestDigest"]
    assert len(manifest_bytes) == selected["size"]
    manifest = json.loads(manifest_bytes, object_pairs_hook=unique_keys)
    assert manifest["schemaVersion"] == 2 and manifest["mediaType"] == selected["mediaType"]
    assert manifest["config"]["mediaType"] in ("application/vnd.oci.image.config.v1+json", "application/vnd.docker.container.image.v1+json")
    assert manifest["config"]["digest"] == config_id and manifest["config"]["size"] == len(raw_config)
    assert len(manifest["layers"]) == len(expected["RootFS"]["Layers"])
else:
    assert config_id == image_id
    assert descriptor is None or descriptor["mediaType"] in ("application/vnd.oci.image.config.v1+json", "application/vnd.docker.container.image.v1+json")
config = json.loads(raw_config, object_pairs_hook=unique_keys)
assert config["rootfs"]["diff_ids"] == expected["RootFS"]["Layers"]
assert config["os"] == "linux" and config["architecture"] == architecture
assert config.get("variant") in allowed_variants
assert config["config"]["Labels"][revision_label] == revision
for field in ("User", "Cmd", "Entrypoint", "Env", "Labels"):
    assert config["config"].get(field) == expected["Config"].get(field)

cdx = read_evidence("container.cdx.json")
assert cdx["bomFormat"] == "CycloneDX"
cdx_metadata = cdx["metadata"]
component = cdx_metadata["component"]
assert component["type"] == "container"
# CycloneDX retains the original immutable input target identity.
assert (component["name"], component["version"]) == tuple(image_id.split(":", 1))
revisions = [entry["value"] for entry in cdx_metadata["properties"]
             if entry["name"] == "syft:image:labels:" + revision_label]
assert revisions == [revision], "CycloneDX must identify exactly one matching revision"
syft_versions = [tool["version"] for tool in cdx_metadata["tools"]["components"] if tool["name"] == "syft"]
assert syft_versions == ["1.57.1"]

receipt_path = Path("container-source-binding.json")
receipt = {"imageId": image_id, "source": revision, "platform": platform,
           "rootfs": expected["RootFS"]["Layers"], "scanVerified": False, "sha256": hashes}
if os.environ["REQUIRE_SCAN"] == "true":
    prior_bytes = receipt_path.read_bytes()
    assert hashlib.sha256(prior_bytes).hexdigest() == os.environ["PRIOR_BINDING_SHA256"]
    prior = json.loads(prior_bytes, object_pairs_hook=unique_keys)
    assert prior == receipt, "The verified candidate or SBOM bytes changed during scanning"
    scan = read_evidence("container-vulnerabilities.json")
    assert scan["descriptor"]["version"] == "0.121.3"
    assert scan["descriptor"]["name"] == "grype" and isinstance(scan["matches"], list)
    assert scan["source"]["type"] == "image" and scan["source"]["target"] == syft_metadata
    archive_verified = os.environ["ARCHIVE_OUTCOME"] == "success"
    if archive_verified:
        archive = read_evidence("container-archive-verification.json")
        assert archive["version"] == 1 and archive["stage"] == "verified"
        assert archive["archiveImportVerified"] is True and archive["scratchRemoved"] is True
        assert archive["platform"] == platform and archive["imageId"] == image_id
        assert archive["source"] == revision
        assert re.fullmatch(r"[0-9a-f]{64}", archive["archiveSha256"])
        assert 0 < archive["archiveBytes"] <= 1024 ** 3
    receipt.update(scanVerified=True, archiveImportVerified=archive_verified)
else:
    assert os.environ["REQUIRE_SCAN"] == "false"
    assert not Path("container-vulnerabilities.json").exists(), "Unexpected scan output before running Grype"
receipt_bytes = (json.dumps(receipt, indent=2) + "\n").encode()
receipt_path.write_bytes(receipt_bytes)
if not receipt["scanVerified"]:
    # The scan step cannot replace the earlier step's output value.
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
        output.write(f"receipt_sha256={hashlib.sha256(receipt_bytes).hexdigest()}\n")

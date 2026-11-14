#!/usr/bin/env bash
# The CI build store is used only for export. Load into a fresh local Podman
# store and discard both the archive and the imported copy after verification.
set -euo pipefail
umask 077

revision=${GITHUB_SHA:?Expected the original workflow revision}
image_id=${CANDIDATE_IMAGE_ID:?Expected an immutable Docker image ID}
[[ $revision =~ ^[a-f0-9]{40}$ && $image_id =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1

scratch=$(mktemp -d "${RUNNER_TEMP:?Expected a job-owned temporary directory}/tax-engine-archive.XXXXXXXX")
scratch=$(cd "$scratch" && pwd -P)
receipt=container-archive-verification.json
stage=preflight
archive_sha=
archive_bytes=0
cleanup() {
  local result=$? removed=true verified=false
  trap - EXIT HUP INT TERM
  if ! sudo -n -- rm -rf --one-file-system -- "$scratch" 2>/dev/null || [[ -e $scratch ]]; then
    removed=false
    result=1
  fi
  if [[ $result == 0 ]]; then verified=true; fi
  jq -n --arg source "$revision" --arg imageId "$image_id" --arg stage "$stage" \
    --arg archiveSha256 "$archive_sha" --argjson archiveBytes "$archive_bytes" \
    --argjson verified "$verified" --argjson removed "$removed" \
    '{version: 1, $source, $imageId, platform: "linux/amd64", $stage,
      $archiveSha256, $archiveBytes, importStore: "fresh local Podman vfs",
      archiveImportVerified: $verified, scratchRemoved: $removed}' > "$receipt"
  if [[ $result != 0 ]]; then
    printf 'Archive verification stopped at %s. See the sanitized receipt.\n' "$stage" >&2
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir "$scratch/tmp"
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH CONTAINER_HOST CONTAINER_CONNECTION
docker=(docker --host unix:///var/run/docker.sock)
podman=(sudo -n -- env "TMPDIR=$scratch/tmp" podman --remote=false
  --root "$scratch/storage" --runroot "$scratch/run" --tmpdir "$scratch/libpod" --storage-driver=vfs)
[[ $(uname -sm) == 'Linux x86_64' ]] || exit 1
[[ $("${docker[@]}" version --format '{{.Server.Os}}/{{.Server.Arch}}' 2>/dev/null) == 'linux/amd64' ]] || exit 1

stage=inspect-build-image
# The source binding step has already captured the build-store inspection. Reuse
# it and normalize only the Podman representation of the same config digest.
signature='.[0] | {Id: (.Id | sub("^sha256:"; "")), Os, Architecture,
  RootFS, Config: (.Config | {User, Cmd, Entrypoint, Env, Labels})}'
jq -e --arg id "$image_id" --arg rev "$revision" \
  'length == 1 and (.[0] | .Id == $id and .Os == "linux" and .Architecture == "amd64"
    and .Config.Labels["org.opencontainers.image.revision"] == $rev
    and (.RootFS.Layers | length > 0 and all(.[]; test("^sha256:[a-f0-9]{64}$"))))' \
  container-candidate.json >/dev/null
expected=$(jq -ecS "$signature" container-candidate.json)

stage='archive-capacity'
image_max_bytes=$((1024 * 1024 * 1024))
image_bytes=$(jq -er '.[0].Size | select(type == "number" and floor == . and . > 0)' container-candidate.json)
(( image_bytes <= image_max_bytes )) || exit 1
available_kib=$(df -Pk "$scratch" | awk 'NR == 2 { print $4 }')
[[ $available_kib =~ ^[0-9]+$ ]] || exit 1
# Budget for the export, loader's temporary copy and vfs layer expansion.
# vfs can copy each ancestor when applying a layer, so allow one full image
# per layer plus the export, temporary copy and an additional 1 GiB margin.
layer_count=$(jq -er '.[0].RootFS.Layers | length' container-candidate.json)
(( available_kib * 1024 >= (layer_count + 2) * image_bytes + image_max_bytes )) || exit 1

stage='export'
archive="$scratch/candidate.tar"
# Bash uses 1024-byte blocks. Bound the actual archive on the writer process.
(ulimit -f "$((image_max_bytes / 1024))"; "${docker[@]}" image save --output "$archive" "$image_id") >/dev/null 2>&1
archive_bytes=$(wc -c < "$archive" | tr -d '[:space:]')
(( archive_bytes > 0 && archive_bytes <= image_max_bytes )) || exit 1
archive_sha=$(sha256sum < "$archive")
archive_sha=${archive_sha%% *}
[[ $archive_sha =~ ^[a-f0-9]{64}$ ]] || exit 1
chmod 0400 "$archive"

stage=verify-empty-store
store=$("${podman[@]}" info --format json 2>/dev/null)
jq -e --arg root "$scratch/storage" --arg run "$scratch/run" \
  '.host.os == "linux" and .host.arch == "amd64" and .host.serviceIsRemote == false
   and (.store | .graphRoot == $root and .runRoot == $run and .graphDriverName == "vfs"
     and .imageStore.number == 0 and .containerStore.number == 0)' \
  <<< "$store" >/dev/null

stage=load
"${podman[@]}" load --quiet --input "$archive" >/dev/null 2>&1
stage=verify-loaded-image
loaded_id=$("${podman[@]}" images --all --no-trunc --quiet 2>/dev/null)
[[ ${loaded_id#sha256:} == "${image_id#sha256:}" ]] || exit 1
loaded=$("${podman[@]}" image inspect "${image_id#sha256:}" 2>/dev/null | jq -ecS "$signature")
[[ $loaded == "$expected" ]] || exit 1
loaded_sha=$(sha256sum < "$archive")
[[ ${loaded_sha%% *} == "$archive_sha" ]] || exit 1
stage=verified

#!/usr/bin/env bash
# The CI build store is used only for export. Load into a fresh local Podman
# store and discard both the archive and the imported copy after verification.
set -euo pipefail
umask 077

revision=${GITHUB_SHA:?Expected the original workflow revision}
image_id=${CANDIDATE_IMAGE_ID:?Expected an immutable Docker image ID}
[[ $revision =~ ^[a-f0-9]{40}$ && $image_id =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1

scratch=
scratch_identity=
receipt=container-archive-verification.json
stage=preflight
archive_sha=
archive_bytes=0
store_info_diagnostics=null
loaded_image_diagnostics=null
cleanup() {
  local result=$? removed=true verified=false current_identity=
  trap - EXIT HUP INT TERM
  # Never remove a substituted path, symlink or directory whose custody changed.
  if [[ -z $scratch_identity || ! -d $scratch || -L $scratch ]]; then
    removed=false
    result=1
  elif ! current_identity=$(stat -c '%d:%i:%u:%a' -- "$scratch" 2>/dev/null); then
    removed=false
    result=1
  elif [[ $current_identity != "$scratch_identity" ]]; then
    removed=false
    result=1
  elif ! sudo -n -- rm -rf --one-file-system -- "$scratch" 2>/dev/null || [[ -e $scratch ]]; then
    removed=false
    result=1
  fi
  if [[ $result == 0 && $stage != verified ]]; then result=1; fi
  if [[ $result == 0 ]]; then verified=true; fi
  jq -n --arg source "$revision" --arg imageId "$image_id" --arg stage "$stage" \
    --arg archiveSha256 "$archive_sha" --argjson archiveBytes "$archive_bytes" \
    --argjson verified "$verified" --argjson removed "$removed" \
    --argjson diagnostics "$store_info_diagnostics" \
    --argjson loadedDiagnostics "$loaded_image_diagnostics" \
    '{version: 1, $source, $imageId, platform: "linux/amd64", $stage,
      $archiveSha256, $archiveBytes, importStore: "fresh local Podman vfs",
      archiveImportVerified: $verified, scratchRemoved: $removed, storeInfoDiagnostics: $diagnostics,
      loadedImageDiagnostics: $loadedDiagnostics}' > "$receipt"
  if [[ $result != 0 ]]; then
    printf 'Archive verification stopped at %s. See the sanitized receipt.\n' "$stage" >&2
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

stage=preflight-root
: "${RUNNER_TEMP:?Expected the workflow temporary-directory contract}"
# Podman's native runroot is limited to 50 characters. RUNNER_TEMP/TMPDIR may
# be longer than this, so use one exclusive short root under canonical /tmp.
scratch_parent=$(cd /tmp && pwd -P) || exit 1
scratch=$(mktemp -d /tmp/tax26archive.XXXXXXXX) || exit 1
[[ $scratch =~ ^/tmp/tax26archive\.[A-Za-z0-9]{8}$ ]] || exit 1
[[ -d $scratch && ! -L $scratch && -O $scratch ]] || exit 1
scratch=$(cd "$scratch" && pwd -P) || exit 1
[[ ${scratch%/*} == "$scratch_parent" && ${scratch##*/} =~ ^tax26archive\.[A-Za-z0-9]{8}$ ]] || exit 1
owner_uid=$(id -u) || exit 1
current_identity=$(stat -c '%d:%i:%u:%a' -- "$scratch") || exit 1
[[ $current_identity =~ ^[0-9]+:[0-9]+:${owner_uid}:700$ ]] || exit 1
scratch_identity=$current_identity
(( ${#scratch} + 4 <= 50 )) || exit 1
mkdir "$scratch/tmp" || exit 1
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
# Keep a bounded prefix from this fixed, directly owned local command. Drain
# the rest so the diagnostic reader cannot change the command's exit via SIGPIPE.
mkfifo "$scratch/podman-info.pipe"
{ head -c 8193 > "$scratch/podman-info.stderr"; cat > /dev/null; } < "$scratch/podman-info.pipe" &
collector_pid=$!
info_exit=0
"${podman[@]}" info --format json > "$scratch/podman-info.stdout" \
  2> "$scratch/podman-info.pipe" || info_exit=$?
collector_exit=0
wait "$collector_pid" || collector_exit=$?
stderr_bytes=$(wc -c < "$scratch/podman-info.stderr" | tr -d '[:space:]')
[[ $stderr_bytes =~ ^[0-9]+$ && $stderr_bytes -le 8193 ]] || exit 1
stderr_truncated=false
if (( stderr_bytes > 8192 )); then stderr_truncated=true; fi
head -c 8192 "$scratch/podman-info.stderr" > "$scratch/podman-info-bounded.stderr"
store_info_diagnostics=$(jq -n --argjson exitCode "$info_exit" \
  --argjson truncated "$stderr_truncated" --argjson captured "$([[ $collector_exit == 0 ]] && printf true || printf false)" \
  --arg scratch "$scratch" --arg runnerTmp "$RUNNER_TEMP" --arg home "${HOME:-}" \
  --rawfile stderr "$scratch/podman-info-bounded.stderr" '
  def redact($path; $replacement): if ($path | length) > 0 then split($path) | join($replacement) else . end;
  {command: "podman-info", $exitCode, $truncated, captureComplete: $captured,
   stderr: ($stderr | redact($scratch; "<owned-scratch>") | redact($runnerTmp; "<runner-temp>") | redact($home; "<home>")
     | gsub("/[A-Za-z0-9_.~+:/@%=-]+"; "<path>")
     | gsub("[A-Fa-f0-9]{32,}"; "<identifier>"))}')
# A failed info command or incomplete capture never reaches the load operation.
if (( info_exit != 0 )); then exit "$info_exit"; fi
(( collector_exit == 0 )) || exit 1
store=$(cat "$scratch/podman-info.stdout")
jq -e --arg root "$scratch/storage" --arg run "$scratch/run" \
  '.host.os == "linux" and .host.arch == "amd64" and .host.serviceIsRemote == false
   and (.store | .graphRoot == $root and .runRoot == $run and .graphDriverName == "vfs"
     and .imageStore.number == 0 and .containerStore.number == 0)' \
  <<< "$store" >/dev/null

stage=load
"${podman[@]}" load --quiet --input "$archive" >/dev/null 2>&1
stage=verify-loaded-image
loaded_id=$("${podman[@]}" images --all --no-trunc --quiet 2>/dev/null)
loaded_id_matches=false
if [[ ${loaded_id#sha256:} == "${image_id#sha256:}" ]]; then loaded_id_matches=true; fi
loaded_image_diagnostics=$(jq -n --argjson matches "$loaded_id_matches" \
  '{imageListMatches: $matches, signatureMatches: null, signatureFields: null, archiveHashMatches: null}')
[[ ${loaded_id#sha256:} == "${image_id#sha256:}" ]] || exit 1
loaded=$("${podman[@]}" image inspect "${image_id#sha256:}" 2>/dev/null | jq -ecS "$signature")
signature_matches=false
if [[ $loaded == "$expected" ]]; then signature_matches=true; fi
# Retain fixed equality predicates only. Config values can contain credentials.
loaded_image_diagnostics=$(printf '%s\n%s\n' "$expected" "$loaded" | \
  jq -s --argjson matches "$signature_matches" \
  '.[0] as $expected | .[1] as $loaded |
   {imageListMatches: true, signatureMatches: $matches, archiveHashMatches: null,
    signatureFields: {
      Id: ($expected.Id == $loaded.Id), Os: ($expected.Os == $loaded.Os),
      Architecture: ($expected.Architecture == $loaded.Architecture),
      RootFS: ($expected.RootFS == $loaded.RootFS),
      User: ($expected.Config.User == $loaded.Config.User),
      Cmd: ($expected.Config.Cmd == $loaded.Config.Cmd),
      Entrypoint: ($expected.Config.Entrypoint == $loaded.Config.Entrypoint),
      Env: ($expected.Config.Env == $loaded.Config.Env),
      Labels: ($expected.Config.Labels == $loaded.Config.Labels)}}')
[[ $loaded == "$expected" ]] || exit 1
loaded_sha=$(sha256sum < "$archive")
archive_matches=false
if [[ ${loaded_sha%% *} == "$archive_sha" ]]; then archive_matches=true; fi
loaded_image_diagnostics=$(jq --argjson matches "$archive_matches" '.archiveHashMatches = $matches' \
  <<< "$loaded_image_diagnostics")
[[ ${loaded_sha%% *} == "$archive_sha" ]] || exit 1
stage=verified

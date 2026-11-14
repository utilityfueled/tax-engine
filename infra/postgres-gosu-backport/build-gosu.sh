#!/bin/bash
set -Eeuo pipefail
arch="$1"
case "$arch" in arm64|amd64) ;; *) exit 2 ;; esac
cd /qualification-inputs
sha256sum --check --strict SHA256SUMS
mkdir /qualification-source /qualification-go /qualification-proxy /qualification-out
# Only fixed, hash-verified source and SDK archives enter this build.
tar -xzf gosu-1.20.tar.gz --strip-components=1 -C /qualification-source
tar -xzf "go1.27.4.linux-$arch.tar.gz" --strip-components=1 -C /qualification-go
for prefix in moby-user xsys; do
  case "$prefix" in moby-user) dest=github.com/moby/sys/user; version=v0.4.1 ;; xsys) dest=golang.org/x/sys; version=v0.1.0 ;; esac
  mkdir -p "/qualification-proxy/$dest/@v"
  for extension in zip mod info; do cp "$prefix.$extension" "/qualification-proxy/$dest/@v/$version.$extension"; done
done
export GOTOOLCHAIN=local GOENV=off GOWORK=off CGO_ENABLED=0
export GOOS=linux GOARCH="$arch" GOPROXY=file:///qualification-proxy GOSUMDB=off
export GOCACHE=/qualification-cache GOMODCACHE=/qualification-modules
# Keep frozen go.sum integrity verification even though this build has no network.
go=/qualification-go/bin/go
out=/qualification-out
moduleDownloadExit=255; moduleVerifyExit=255; compileCheckExit=255
buildExit=255; metadataCheckExit=255; functionalCheckExit=255
finish() {
  printf '{"moduleDownloadExit":%s,"moduleVerifyExit":%s,"compileCheckExit":%s,"buildExit":%s,"metadataCheckExit":%s,"functionalCheckExit":%s,"candidateReleaseQualified":false,"riskAccepted":false}\n' \
    "$moduleDownloadExit" "$moduleVerifyExit" "$compileCheckExit" "$buildExit" "$metadataCheckExit" "$functionalCheckExit" > "$out/status.json"
}
trap finish EXIT
cd /qualification-source
test "$("$go" version)" = "go version go1.27.4 linux/$arch"
# Independent statuses are retained; a failed stage cannot be masked by a later pass.
set +e
"$go" mod download; moduleDownloadExit=$?
set -e; test "$moduleDownloadExit" = 0
set +e
"$go" mod verify; moduleVerifyExit=$?
set -e; test "$moduleVerifyExit" = 0
set +e
"$go" test -mod=readonly ./...; compileCheckExit=$?
set -e; test "$compileCheckExit" = 0
set +e
# Do not strip the symbol table; do not fabricate upstream git signatures or commits.
"$go" build -mod=readonly -trimpath -buildvcs=false -ldflags '-d -w' -o "$out/gosu" .; buildExit=$?
set -e; test "$buildExit" = 0
set +e
"$go" version -m "$out/gosu" > "$out/go-metadata.txt"; metadataCheckExit=$?
set -e; test "$metadataCheckExit" = 0
functional_checks() {
  test "$("$out/gosu" --version)" = "1.20 (go1.27.4 on linux/$arch; gc)" || return 1
  local uid gid groups home
  uid=$(id -u postgres) || return 1
  gid=$(id -g postgres) || return 1
  groups=$(id -G postgres) || return 1
  home=$(getent passwd postgres | cut -d: -f6) || return 1
  test -n "$home" || return 1
  test "$("$out/gosu" postgres id -u)" = "$uid" || return 1
  test "$("$out/gosu" postgres id -g)" = "$gid" || return 1
  test "$("$out/gosu" postgres id -G)" = "$groups" || return 1
  test "$("$out/gosu" postgres sh -ec 'printf %s "$HOME"')" = "$home" || return 1
  test "$("$out/gosu" "$uid:$gid" id -g)" = "$gid" || return 1
  test "$("$out/gosu" postgres:postgres id -u)" = "$uid" || return 1
  if "$out/gosu" tax_engine_nonexistent_fixture_user true; then return 1; fi
  if "$out/gosu" postgres:tax_engine_nonexistent_fixture_group true; then return 1; fi
  if "$out/gosu" postgres /tax-engine-nonexistent-fixture-command; then return 1; fi
  local result=0
  "$out/gosu" postgres sh -c 'exit 37' || result=$?
  test "$result" = 37 || return 1
  # syscall.Exec must preserve the PID of the process switching identity.
  sh -ec 'pid=$$; exec "$1" postgres sh -ec '\''test "$$" = "$1"'\'' sh "$pid"' sh "$out/gosu" || return 1
}
set +e
functional_checks; functionalCheckExit=$?
set -e; test "$functionalCheckExit" = 0
cp LICENSE "$out/LICENSE"
{ printf '%s\n' 'github.com/moby/sys/user v0.4.1'; cat "$GOMODCACHE/github.com/moby/sys/user@v0.4.1/LICENSE";
  printf '\n%s\n' 'golang.org/x/sys v0.1.0'; cat "$GOMODCACHE/golang.org/x/sys@v0.1.0/LICENSE";
} > "$out/THIRD-PARTY-LICENSES.txt"
finish
cd "$out"
sha256sum gosu LICENSE THIRD-PARTY-LICENSES.txt go-metadata.txt status.json > ARTIFACTS.sha256

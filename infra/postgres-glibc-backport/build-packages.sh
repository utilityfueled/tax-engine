#!/bin/bash
set -euo pipefail
umask 022
case "${EXPECTED_ARCH:?}" in amd64|arm64) ;; *) exit 1 ;; esac
test "$(dpkg --print-architecture)" = "$EXPECTED_ARCH"
source_version='2.36-9+deb12u14'
candidate_version="${source_version}+vivalatax1"
mkdir /qualification-work /qualification-out
stage=admission
finish() {
    result=$?
    trap - EXIT
    python3 - "$stage" "$result" <<'PY'
from pathlib import Path
import sys,json
p=Path("/qualification-out")
(p/"execution-status.json").write_text(json.dumps({"stage":sys.argv[1],"exit":int(sys.argv[2]),"packageExecutionCompleted":sys.argv[1]=="complete" and sys.argv[2]=="0","candidateReleaseQualified":False,"riskAccepted":False})+"\n")
PY
    (cd /qualification-out && find . -type f ! -name ARTIFACTS.sha256 -print0 | sort -z | xargs -0 sha256sum > ARTIFACTS.sha256)
    exit "$result"
}
trap finish EXIT
cp -a /qualification-toolchain /qualification-out/toolchain
cd /qualification-inputs
sha256sum -c SHA256SUMS > /qualification-out/input-checksums.txt
# The host source preparer already verified this index chain; independently
# verify the exact pinned keyring/Release again inside the build environment.
gpgv --keyring /qualification-inputs/debian-archive-keys.gpg InRelease > /qualification-out/archive-signature.stdout 2> /qualification-out/archive-signature.stderr
stage=source-extraction
cd /qualification-work
dpkg-source --no-check -x "/qualification-inputs/glibc_${source_version}.dsc" baseline > /qualification-out/source-extraction.log 2>&1
cp -a baseline candidate
cd candidate
stage=patch
mkdir -p debian/patches/local
cp /qualification-inputs/CVE-2026-5450.patch debian/patches/local/vivalatax-CVE-2026-5450.patch
printf '\nlocal/vivalatax-CVE-2026-5450.patch\n' >> debian/patches/series
QUILT_PATCHES=debian/patches quilt --quiltrc=- push --fuzz=0 > /qualification-out/patch.log 2>&1
test "$(grep -c 'strsize + (strsize >= width ? width : strsize);' stdio-common/vfscanf-internal.c)" = 3
# Complete upstream regression body, not a replacement assertion or shortened probe.
python3 - <<'PY'
from pathlib import Path
s=Path('/qualification-inputs/upstream-839898777226a3ed88c0859f25ffe712519b4ead.patch').read_text()
s=s.split('@@ -0,0 +1,48 @@\n',1)[1].split('\ndiff --git ',1)[0]
body=''.join(x[1:]+'\n' for x in s.splitlines() if x.startswith('+'))
assert Path('stdio-common/tst-vfscanf-bz34008.c').read_text()==body
PY
DEBFULLNAME='Viva La Tax private qualification' DEBEMAIL='private-qualification@example.invalid' \
    dch --force-distribution --distribution bookworm --newversion "$candidate_version" \
    'Private Bookworm2.36 qualification of upstream839898777226a3ed88c0859f25ffe712519b4ead only. No distro or release approval.'
test "$(dpkg-parsechangelog -S Version)" = "$candidate_version"
# Full existing Debian/upstream tests remain enabled: no nocheck, stage1,
# expected-failure-list edit, skipped architecture pass or forced success.
for variant in baseline candidate; do
    cd "/qualification-work/$variant"
    mkdir "/qualification-out/$variant"
    find . -type f -print0 | sort -z | xargs -0 sha256sum > "/qualification-out/$variant/source-files.sha256"
    stage="${variant}-full-build"
    DEB_BUILD_OPTIONS=parallel=2 dpkg-buildpackage -b -uc -us > "/qualification-out/$variant/package-build.log" 2>&1
    version=$(dpkg-parsechangelog -S Version)
    find /qualification-work -maxdepth 1 -type f -name "*_${version}_*" -exec cp -a '{}' "/qualification-out/$variant/" ';'
    # Retain every original architecture/flavour summary. Unexpected results
    # hold, even when the Debian build happens to continue after a diagnostic.
    find build-tree -mindepth 2 -maxdepth 2 -name tests.sum -type f -print | sort > "/qualification-out/$variant/suite-paths.txt"
    test -s "/qualification-out/$variant/suite-paths.txt"
    while IFS= read -r path; do
        pass=$(basename "$(dirname "$path")")
        cp "$path" "/qualification-out/$variant/${pass}-tests.sum"
        if grep -Eq '^(FAIL|XPASS|UNRESOLVED|ERROR):' "$path"; then exit 1; fi
        grep -q '^PASS:' "$path"
    done < "/qualification-out/$variant/suite-paths.txt"
    mkdir "/qualification-out/$variant/unpacked"
    for deb in "/qualification-out/$variant/"*.deb; do
        test -f "$deb"
        dpkg-deb -x "$deb" "/qualification-out/$variant/unpacked"
    done
    find "/qualification-out/$variant/unpacked" -type f -name '*.so*' -exec readelf --wide --dyn-syms --version-info '{}' ';' > "/qualification-out/$variant/elf-symbols-and-versions.txt"
done
# Build/run the exact candidate regression against the original built libc too.
# This modifies only baseline test registration AFTER its complete original build.
cp /qualification-work/candidate/stdio-common/Makefile /qualification-work/baseline/stdio-common/Makefile
cp /qualification-work/candidate/stdio-common/tst-vfscanf-bz34008.c /qualification-work/baseline/stdio-common/
for variant in baseline candidate; do
    cd "/qualification-work/$variant"
    build="build-tree/${EXPECTED_ARCH}-libc"
    test -f "$build/config.status"
    test -f "$build/malloc/libc_malloc_debug.so"
    stage="${variant}-paired-regression"
    set +e
    make -C "$build" subdirs=stdio-common tests=tst-vfscanf-bz34008 check > "/qualification-out/$variant/upstream-regression.log" 2>&1
    result=$?
    set -e
    printf '%s\n' "$result" > "/qualification-out/$variant/upstream-regression.exit"
    test -f "$build/stdio-common/tst-vfscanf-bz34008.test-result"
    cp "$build/stdio-common/tst-vfscanf-bz34008.test-result" "/qualification-out/$variant/upstream-regression.test-result"
    cp "$build/stdio-common/tst-vfscanf-bz34008.out" "/qualification-out/$variant/upstream-regression.out"
    if [ "$variant" = baseline ]; then
        test "$result" -gt 0 && test "$result" -le 125
        grep -q '^FAIL:' "/qualification-out/$variant/upstream-regression.test-result"
    else
        test "$result" = 0
        grep -q '^PASS:' "/qualification-out/$variant/upstream-regression.test-result"
        grep -q '^PASS: stdio-common/tst-vfscanf-bz34008$' "/qualification-out/$variant/${EXPECTED_ARCH}-libc-tests.sum"
    fi
done
# Compare every same-path shared ELF in the full libc6 runtime package.
# ABI differences are not waived; abidiff must return exactly zero each time.
stage=abi
python3 - <<'PY'
from pathlib import Path
import subprocess,json
root=Path('/qualification-out'); a=root/'baseline/unpacked'; b=root/'candidate/unpacked'
files=[]
for p in sorted(a.rglob('*')):
    if not p.is_file() or p.is_symlink(): continue
    with p.open('rb') as f: magic=f.read(4)
    if magic!=b'\x7fELF': continue
    rel=p.relative_to(a); q=b/rel
    assert q.is_file() and not q.is_symlink(),str(rel)
    # Only ELF ET_DYN objects with actual SONAME are shared ABI providers.
    dyn=subprocess.run(['readelf','-d',str(p)],capture_output=True,text=True,check=True).stdout
    if '(SONAME)' not in dyn:continue
    files.append(str(rel))
    r=subprocess.run(['abidiff','--debug-info-dir1',str(a/'usr/lib/debug'),'--debug-info-dir2',str(b/'usr/lib/debug'),str(p),str(q)],capture_output=True)
    (root/f'abi-{len(files)}.stdout').write_bytes(r.stdout);(root/f'abi-{len(files)}.stderr').write_bytes(r.stderr)
    assert r.returncode==0, 'ABI_DIFFERENCE_OR_ERROR'
assert len(files)>=5
(root/'abi-providers.json').write_text(json.dumps(files,indent=2)+'\n')
PY
printf '%s\n' '{"baselineBuildExit":0,"candidateBuildExit":0,"pairedRegressionVerified":true,"fullOriginalSuitesRetained":true,"abidiffExit":0,"sixConsumersExecuted":false,"genericAbiApproval":false,"riskAccepted":false,"candidateReleaseQualified":false}' > /qualification-out/package-status.json
stage=complete

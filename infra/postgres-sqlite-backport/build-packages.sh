#!/bin/bash
# Offline native source recipe. No runtime image promotion or scanner suppression.
set -euo pipefail
umask 022
arch=$(dpkg --print-architecture)
case "$arch" in arm64|amd64) ;; *) exit 1 ;; esac
test "$arch" = "$EXPECTED_ARCH"
export LC_ALL=C.UTF-8 DEB_BUILD_OPTIONS=parallel=2
mkdir /qualification-work /qualification-out
cp -a /qualification-toolchain /qualification-out/toolchain
cd /qualification-inputs
sha256sum -c SHA256SUMS
cd /qualification-work
# --no-check skips duplicate maintainer-key verification only. Context preparation
# already verified signed release -> source index -> descriptor -> all tarballs.
dpkg-source --no-check -x /qualification-inputs/sqlite3_3.40.1-2+deb12u2.dsc baseline
cp -a baseline candidate
cd candidate
patch --batch --fuzz=0 -p1 < /qualification-inputs/CVE-2025-7458.patch > /qualification-out/patch.log
test "$(grep -c '^patching file ' /qualification-out/patch.log)" = 2
DEBFULLNAME='Viva La Tax private qualification' DEBEMAIL='private-qualification@example.invalid' \
    dch --force-distribution --distribution bookworm --newversion '3.40.1-2+deb12u2+vivalatax1' \
    'Private backport of upstream Fossil12ad822d9b827777; no distribution or release approval.'
# Retain the actual upstream regression file unchanged, including all five cases.
cp test/distinct.test /qualification-out/upstream-distinct.test
sha256sum /qualification-out/upstream-distinct.test > /qualification-out/upstream-regression.sha256
cd /qualification-work
printf '{}\n' > /qualification-out/status.json
record() {
    python3 - "$1" "$2" <<'PY'
import json,sys
p='/qualification-out/status.json'
v=json.load(open(p));assert sys.argv[1]not in v
v[sys.argv[1]]=json.loads(sys.argv[2])
with open(p,'w')as f:json.dump(v,f,indent=2);f.write('\n')
PY
}
# A completed image here is only an artifact carrier. Even an early package/test
# failure is exported with its nonzero recipeExit and missing checks intact;
# assertSqliteChecksPassed must reject it before any candidate can be consumed.
finish_artifacts() {
    result=$?
    trap - EXIT
    record recipeExit "$result"
    cd /qualification-out
    find . -type f ! -name ARTIFACTS.sha256 -print0 | sort -z | xargs -0 sha256sum > ARTIFACTS.sha256
    exit 0
}
trap finish_artifacts EXIT
for variant in baseline candidate; do
    mkdir "/qualification-out/$variant"
    cd "/qualification-work/$variant"
    dpkg-parsechangelog > "/qualification-out/$variant/changelog-fields.txt"
    find . -type f -print0 | sort -z | xargs -0 sha256sum > "/qualification-out/$variant/source-files.sha256"
    set +e
    dpkg-buildpackage -B -uc -us > "/qualification-out/$variant/package-build.log" 2>&1
    result=$?
    set -e
    record "${variant}PackageBuildExit" "$result"
    test "$result" = 0
    version=$(dpkg-parsechangelog -S Version)
    find /qualification-work -maxdepth 1 -type f -name "*_${version}_*" -exec cp -a '{}' "/qualification-out/$variant/" ';'
    set +e
    make -j2 fulltest > "/qualification-out/$variant/fulltest.log" 2>&1
    result=$?
    set -e
    record "${variant}FullTestExit" "$result"
    test "$result" = 0
    cd /qualification-work
done
# Same original patched regression text on both compiled source variants; baseline
# full suite above ran before this copied test. A nonzero exit alone is not proof.
cp /qualification-out/upstream-distinct.test baseline/test/distinct.test.paired
cp /qualification-out/upstream-distinct.test candidate/test/distinct.test.paired
cmp baseline/test/distinct.test.paired candidate/test/distinct.test.paired
for variant in baseline candidate; do
    cd "/qualification-work/$variant"
    make -j2 testfixture > "/qualification-out/$variant/regression-build.log" 2>&1
    set +e
    ./testfixture test/distinct.test.paired '--match=distinct-10.*' > "/qualification-out/$variant/regression.log" 2>&1
    result=$?
    set -e
    record "${variant}RegressionExit" "$result"
    cd /qualification-work
done
python3 - <<'PY'
import json,re
p='/qualification-out/status.json';v=json.load(open(p));log=open('/qualification-out/baseline/regression.log').read()
# A normally completed Tcl failure must explicitly name at least one new upstream
# case. Crash, build failure, timeout and unrelated failure remain unqualified.
failed=re.search(r'!Failures on these tests:([^\n]*)',log)
v['candidateRegressionCasesPassed']=sum(bool(re.search(r'^distinct-10\.'+str(n)+r'\.\.\. Ok$',open('/qualification-out/candidate/regression.log').read(),re.M))for n in range(1,6))
v['baselineRegressionReproduced']=v['baselineRegressionExit']==1 and failed is not None and bool(re.search(r'\bdistinct-10\.[1-5]\b',failed[1]))
with open(p,'w')as f:json.dump(v,f,indent=2);f.write('\n')
PY
# Independent ASan/UBSan build of the candidate and the unchanged upstream cases.
cd /qualification-work
mkdir candidate-sanitizer
cd candidate-sanitizer
CFLAGS='-O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer' \
LDFLAGS='-fsanitize=address,undefined' ../candidate/configure --disable-shared \
    > /qualification-out/candidate/sanitizer-configure.log 2>&1
make -j2 testfixture > /qualification-out/candidate/sanitizer-build.log 2>&1
set +e
ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1 \
    ./testfixture ../candidate/test/distinct.test.paired '--match=distinct-10.*' \
    > /qualification-out/candidate/sanitizer-regression.log 2>&1
result=$?
set -e
record candidateSanitizerRegressionExit "$result"
python3 - <<'PYTEST'
import json,re
p='/qualification-out/status.json';v=json.load(open(p));log=open('/qualification-out/candidate/sanitizer-regression.log').read()
v['candidateSanitizerRegressionCasesPassed']=sum(bool(re.search(r'^distinct-10\.'+str(n)+r'\.\.\. Ok$',log,re.M))for n in range(1,6))
with open(p,'w')as f:json.dump(v,f,indent=2);f.write('\n')
PYTEST
record genericAbiApproval false
record candidateReleaseQualified false
record riskAccepted false
python3 - <<'PY'
import json
v=json.load(open('/qualification-out/status.json'))
for k in ['baselinePackageBuildExit','candidatePackageBuildExit','baselineFullTestExit','candidateFullTestExit','candidateRegressionExit','candidateSanitizerRegressionExit']:assert type(v[k])is int and v[k]==0,k
assert v['baselineRegressionReproduced']is True
assert v['candidateRegressionCasesPassed']==v['candidateSanitizerRegressionCasesPassed']==5
PY

#!/bin/bash
set -euo pipefail
umask 022
build_arch=$(dpkg --print-architecture)
case "$build_arch" in arm64|amd64) ;; *) echo 'Unsupported native architecture' >&2; exit 1 ;; esac
test "$build_arch" = "$EXPECTED_ARCH"
multiarch=$(dpkg-architecture -qDEB_HOST_MULTIARCH)
mkdir -p /qualification-work /qualification-out
cp -a /qualification-toolchain /qualification-out/toolchain
cd /qualification-inputs
sha256sum -c SHA256SUMS
cd /qualification-work
dpkg-source --no-check -x /qualification-inputs/libxml2_2.9.14+dfsg-1.3~deb12u6.dsc baseline
mkdir upstream-fixtures
tar -xJf /qualification-inputs/upstream-fixtures.tar.xz -C upstream-fixtures
cp -an upstream-fixtures/libxml2-2.9.14/test upstream-fixtures/libxml2-2.9.14/result baseline/
cp -a baseline candidate
cd candidate
patch --batch --fuzz=0 -p1 < /qualification-inputs/CVE-2026-6653.patch > /qualification-out/patch.log
test "$(grep -c '^patching file ' /qualification-out/patch.log)" = 7
DEBFULLNAME='Viva La Tax private qualification' DEBEMAIL='private-qualification@example.invalid' \
    dch --force-distribution --distribution bookworm --local +vivalatax1 \
    'Private qualification of the independently hash-verified Canonical maintained source patch. No distro approval is implied.'
mkdir -p /qualification-out/probes
cc -O2 -Wall -Wextra /qualification-inputs/exslt.c -o /qualification-out/probes/exslt $(pkg-config --cflags --libs libexslt)
cd /qualification-work
printf '{\n' > /qualification-out/status.json
failed=0
package_failed=0
for variant in baseline candidate; do
    mkdir "/qualification-out/$variant"
    cd "/qualification-work/$variant"
    dpkg-parsechangelog > "/qualification-out/$variant/changelog-fields.txt"
    find . -type f -print0 | sort -z | xargs -0 sha256sum > "/qualification-out/$variant/source-files.sha256"
    set +e
    DEB_BUILD_OPTIONS=parallel=2 dpkg-buildpackage -B -uc -us > "/qualification-out/$variant/package-build.log" 2>&1
    result=$?
    set -e
    printf '"%sPackageBuildExit":%s,\n' "$variant" "$result" >> /qualification-out/status.json
    if [ "$result" = 0 ]; then
        set +e
        make -C builddir/main check > "/qualification-out/$variant/optimized-check.log" 2>&1
        check_result=$?
        set -e
        printf '"%sOptimizedCheckExit":%s,\n' "$variant" "$check_result" >> /qualification-out/status.json
        if [ "$check_result" != 0 ]; then failed=1; fi
        version=$(dpkg-parsechangelog -S Version)
        find /qualification-work -maxdepth 1 -type f -name "*_${version}_*" -exec cp -a '{}' "/qualification-out/$variant/" ';'
        mkdir "/qualification-out/$variant/unpacked" "/qualification-out/$variant/debug"
        dpkg-deb -x "/qualification-out/$variant/libxml2_${version}_${build_arch}.deb" "/qualification-out/$variant/unpacked"
        for debug in "/qualification-out/$variant/"*-dbgsym_*_${build_arch}.deb; do
            [ -f "$debug" ] || continue
            dpkg-deb -x "$debug" "/qualification-out/$variant/debug"
        done
        provider="/qualification-out/$variant/unpacked/usr/lib/$multiarch/libxml2.so.2.9.14"
        readelf -d "$provider" > "/qualification-out/$variant/elf-dynamic.txt"
        readelf --wide --dyn-syms "$provider" > "/qualification-out/$variant/elf-symbols.txt"
        readelf --wide --version-info "$provider" > "/qualification-out/$variant/elf-versions.txt"
        nm -D --defined-only --with-symbol-versions -S "$provider" > "/qualification-out/$variant/elf-defined.txt"
    else
        failed=1
        package_failed=1
    fi
    cd /qualification-work
done

# Paired diagnostic tests use exactly the maintained candidate testrecurse.c on
# each source library. This establishes bounded parser regression behavior only.
# Authored CVE reproduction remains a separate qualification step.
for variant in baseline candidate; do
    cd "/qualification-work/$variant"
    make distclean > "/qualification-out/$variant/sanitizer-clean.log" 2>&1 || true
    cp /qualification-work/candidate/testrecurse.c ./testrecurse.c.paired
    if [ "$variant" = baseline ]; then
        cp ./testrecurse.c.paired ./testrecurse.c
    fi
    set +e
    CFLAGS='-O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer' \
    LDFLAGS='-fsanitize=address,undefined' ./configure --without-python --with-icu \
        > "/qualification-out/$variant/sanitizer-configure.log" 2>&1 && \
    make -j2 testrecurse runtest > "/qualification-out/$variant/sanitizer-build.log" 2>&1 && \
    ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1 \
        timeout --kill-after=5s 240 ./testrecurse > "/qualification-out/$variant/sanitizer-testrecurse.log" 2>&1 && \
    ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1 \
        timeout --kill-after=5s 240 ./runtest > "/qualification-out/$variant/sanitizer-runtest.log" 2>&1
    result=$?
    set -e
    printf '"%sSanitizerExit":%s,\n' "$variant" "$result" >> /qualification-out/status.json
    if [ "$result" != 0 ]; then failed=1; fi
    sha256sum testrecurse.c > "/qualification-out/$variant/paired-harness.sha256"
done
if [ "$package_failed" = 0 ]; then
    set +e
    abidiff --debug-info-dir1 /qualification-out/baseline/debug/usr/lib/debug \
        --debug-info-dir2 /qualification-out/candidate/debug/usr/lib/debug \
        /qualification-out/baseline/unpacked/usr/lib/$multiarch/libxml2.so.2.9.14 \
        /qualification-out/candidate/unpacked/usr/lib/$multiarch/libxml2.so.2.9.14 \
        > /qualification-out/abidiff.txt 2>&1
    result=$?
    set -e
    printf '"abidiffExit":%s,\n' "$result" >> /qualification-out/status.json
fi
printf '"packageOrSanitizerFailure":%s, "authoredCveReproductionExecuted":false, "genericAbiApproval":false}\n' "$failed" >> /qualification-out/status.json
cd /qualification-out
find . -type f ! -name ARTIFACTS.sha256 -print0 | sort -z | xargs -0 sha256sum > ARTIFACTS.sha256

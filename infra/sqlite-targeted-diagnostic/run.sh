#!/bin/bash
# Standalone nonqualifying measurement; original tests and expected results untouched.
set -euo pipefail
umask 022
export LC_ALL=C.UTF-8 DEB_BUILD_OPTIONS=parallel=2
[[ $(dpkg --print-architecture) == amd64 && $EXPECTED_ARCH == amd64 ]]
mkdir /qualification-work /qualification-out
cp -a /qualification-toolchain /qualification-out/toolchain
cd /qualification-inputs
sha256sum -c SHA256SUMS
cd /qualification-work
printf '{}\n' > /qualification-out/status.json
record(){ python3 - "$1" "$2" <<'PY'
import sys,json
p='/qualification-out/status.json';v=json.load(open(p));assert sys.argv[1]not in v
v[sys.argv[1]]=json.loads(sys.argv[2]);open(p,'w').write(json.dumps(v,indent=2)+'\n')
PY
}
finish(){ result=$?;trap - EXIT;record diagnosticScriptExit "$result";cd /qualification-out;find . -type f ! -name ARTIFACTS.sha256 -print0|sort -z|xargs -0 sha256sum > ARTIFACTS.sha256;exit 0; }
trap finish EXIT
# Separate original source trees, no candidate CVE patch or expected-result edits.
dpkg-source --no-check -x /qualification-inputs/sqlite3_3.40.1-2+deb12u2.dsc baseline
useradd --system --no-create-home --home-dir /qualification-work --shell /usr/sbin/nologin sqlite-test
[[ $(id -u sqlite-test) != 0 ]]
as_test(){ runuser -u sqlite-test -- "$@"; }
cd baseline
sha256sum test/join8.test ext/recover/recoverfault2.test test/tester.tcl test/malloc_common.tcl > /qualification-out/original-tests.sha256
set +e
dpkg-buildpackage -B -uc -us > /qualification-out/baseline-package.log 2>&1
r=$?
set -e
record baselinePackageExit "$r";[[ $r == 0 ]]
cp Makefile /qualification-out/baseline-Makefile
chown -R sqlite-test:sqlite-test /qualification-work /qualification-out
set +e
as_test make -j2 USE_AMALGAMATION=1 testfixture > /qualification-out/fixture-build.log 2>&1
r=$?
set -e
record baselineFixtureBuildExit "$r";[[ $r == 0 ]]
set +e
as_test ./testfixture test/join8.test > /qualification-out/join8.log 2>&1
r=$?;record join8Exit "$r";if ((r>125));then exit "$r";fi
as_test ./testfixture ext/recover/recoverfault2.test > /qualification-out/original-oom.log 2>&1
r=$?;record originalOomExit "$r";if ((r>125));then exit "$r";fi
as_test ./testfixture /qualification-diagnostics/oom-observe.tcl > /qualification-out/instrumented-oom.log 2>&1
r=$?;record instrumentedOomExit "$r";if ((r>125));then exit "$r";fi
set -e
sha256sum -c /qualification-out/original-tests.sha256 > /qualification-out/original-tests-after.log
record originalSourcesUnchanged true
measure_core(){
  local variant=$1
  cp sqlite3 "/qualification-out/$variant-cli-wrapper"
  readelf -d .libs/sqlite3 > "/qualification-out/$variant-cli-elf.txt"
  sha256sum .libs/sqlite3 .libs/libsqlite3.so.0.8.6 > "/qualification-out/$variant-linked-files.sha256"
  ./libtool --mode=link gcc -I. /qualification-diagnostics/core-link.c libsqlite3.la -ldl -o core-link > "/qualification-out/$variant-core-build.log" 2>&1
  chown -R sqlite-test:sqlite-test /qualification-work /qualification-out
  set +e
  as_test ./core-link "$variant" > "/qualification-out/$variant-core.tsv" 2>&1
  local rc=$?;record "${variant}CoreExit" "$rc";if ((rc!=0));then exit "$rc";fi
  as_test env LD_DEBUG=libs ./sqlite3 :memory: 'SELECT sqlite_version(),sqlite_source_id(); PRAGMA compile_options;' > "/qualification-out/$variant-cli-options.txt" 2> "/qualification-out/$variant-cli-loader.txt"
  rc=$?;record "${variant}CliExit" "$rc";if ((rc!=0));then exit "$rc";fi
  set -e
  # Private fixed synthetic fixture only. Its data and generated recovery SQL are retained.
  as_test ./sqlite3 diagnostic-recover.db "CREATE TABLE t1(a INTEGER PRIMARY KEY,b,c); INSERT INTO t1 VALUES(1,4,X'1234567800');"
  set +e
  as_test ./sqlite3 diagnostic-recover.db .recover > "/qualification-out/$variant-recover.sql" 2> "/qualification-out/$variant-recover.stderr"
  rc=$?;record "${variant}RecoverExit" "$rc";if ((rc>125));then exit "$rc";fi
  set -e
  python3 /qualification-diagnostics/project.py "$variant"
}
measure_core baseline
if grep -qx $'dbpage\t0' /qualification-out/baseline-core.tsv;then
  record pairedDbpageAttempted true
  cd /qualification-work
  dpkg-source --no-check -x /qualification-inputs/sqlite3_3.40.1-2+deb12u2.dsc dbpage
  cd dbpage
  set +e
  DEB_CFLAGS_APPEND=-DSQLITE_ENABLE_DBPAGE_VTAB dpkg-buildpackage -B -uc -us > /qualification-out/dbpage-package.log 2>&1
  r=$?
  set -e
  record dbpagePackageExit "$r";[[ $r == 0 ]]
  cp Makefile /qualification-out/dbpage-Makefile
  python3 /qualification-diagnostics/project.py flags
  record flagDeltaVerified true
  measure_core dbpage
else
  record pairedDbpageAttempted false
  record flagDeltaVerified false
fi
record diagnosticMeasurementCompleted true
record fullOriginalSuitesExecuted false
record candidateReleaseQualified false
record riskAccepted false

#!/bin/sh
# Private proposed build-time gate. Do not execute outside the approved image build.
set -eu
umask 077
export LC_ALL=C
evidence=${1:?inventory output directory required}
mkdir -p "$evidence"
fail() { printf '%s\n' "$*" >&2; exit 1; }
expected_status=115f014bc7b114c49ee0321b01f9cd3b3f1bdd608cc97812010c9452970c4806
test "$(dpkg --print-architecture)" = amd64 || fail 'AMD64 base required'
actual_status=$(sha256sum /var/lib/dpkg/status)
test "${actual_status%% *}" = "$expected_status" || fail 'Base dpkg status pin mismatch'
printf '%s\n' "$actual_status" > "$evidence/dpkg-status-before.sha256"
printf '%s\n' gnupg gpg gpg-wks-client gpg-wks-server libsqlite3-0 > "$evidence/expected-removals.txt"

audit() {
  dpkg --audit > "$evidence/dpkg-audit-$1.txt" 2>&1 || fail 'dpkg audit exited nonzero'
  test ! -s "$evidence/dpkg-audit-$1.txt" || fail 'dpkg audit reported problems'
  apt-get check > "$evidence/apt-dependency-check-$1.txt" 2>&1 || fail 'apt dependency check failed'
}
snapshot_packages() {
  dpkg-query -W -f='${Package}\t${Version}\t${Architecture}\t${Status}\n' > "$evidence/packages-all-$1.tsv"
  awk -F '\t' '$4 == "install ok installed" { print $1 "\t" $2 "\t" $3 }' "$evidence/packages-all-$1.tsv" | sort > "$evidence/packages-installed-$1.tsv"
}
snapshot_protected() {
  : > "$evidence/protected-$1.sha256"
  for tool in apt-get dpkg dpkg-query gpgv initdb postgres pg_ctl pg_dump pg_restore psql pg_isready gosu gunzip xzcat zstd docker-entrypoint.sh; do
    executable=$(command -v "$tool") || fail "Required tool absent: $tool"
    test -x "$executable" || fail "Required tool not executable: $tool"
    sha256sum "$executable" >> "$evidence/protected-$1.sha256"
  done
}

audit before
snapshot_packages before
snapshot_protected before
# No index update, installs, blanket autoremove, force-depends or ignored failures.
apt-get --simulate -o APT::Get::AutomaticRemove=false purge \
  gnupg gpg gpg-wks-client gpg-wks-server libsqlite3-0 \
  > "$evidence/apt-purge-plan.txt" 2>&1
awk '
  $1 == "Inst" || $1 == "Conf" { bad=1 }
  $1 == "Remv" || $1 == "Purg" { split($2, p, ":"); print p[1] }
  END { if (bad) exit 1 }
' "$evidence/apt-purge-plan.txt" > "$evidence/plan-removals-unsorted.txt" || fail 'Plan installs or configures packages'
sort "$evidence/plan-removals-unsorted.txt" > "$evidence/plan-removals.txt"
cmp -s "$evidence/expected-removals.txt" "$evidence/plan-removals.txt" || fail 'Removal plan differs from exact five packages'

DEBIAN_FRONTEND=noninteractive apt-get -y -o APT::Get::AutomaticRemove=false purge \
  gnupg gpg gpg-wks-client gpg-wks-server libsqlite3-0 \
  > "$evidence/apt-purge-actual.txt" 2>&1
audit after
snapshot_packages after
snapshot_protected after
comm -23 "$evidence/packages-installed-before.tsv" "$evidence/packages-installed-after.tsv" > "$evidence/removed-package-records.tsv"
comm -13 "$evidence/packages-installed-before.tsv" "$evidence/packages-installed-after.tsv" > "$evidence/new-package-records.tsv"
test ! -s "$evidence/new-package-records.tsv" || fail 'New or changed retained package records'
cut -f1 "$evidence/removed-package-records.tsv" > "$evidence/actual-removals.txt"
cmp -s "$evidence/expected-removals.txt" "$evidence/actual-removals.txt" || fail 'Actual removals differ from exact five packages'
cmp -s "$evidence/protected-before.sha256" "$evidence/protected-after.sha256" || fail 'Protected executable changed'
printf '%s\n' 'private-build-package-controls-passed; native qualification still required' > "$evidence/PACKAGE-CONTROLS.txt"

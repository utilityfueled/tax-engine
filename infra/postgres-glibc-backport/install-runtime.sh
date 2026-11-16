#!/bin/bash
set -euo pipefail
case "${EXPECTED_ARCH:?}" in amd64|arm64) ;; *) exit 1 ;; esac
test "$(dpkg --print-architecture)" = "$EXPECTED_ARCH"
. /etc/os-release
test "$VERSION_CODENAME" = bookworm
base_version='2.36-9+deb12u14'
candidate_version="${base_version}+vivalatax1"
root=/usr/local/share/vivalatax/glibc-private
mkdir "$root/admission"
dpkg-query -W -f='${db:Status-Abbrev}\t${binary:Package}\t${source:Package}\t${Version}\n' | \
    awk -F '\t' '$1 ~ /^ii/ && $3 == "glibc" {print $2 "\t" $4}' | sort > "$root/admission/before.tsv"
test -s "$root/admission/before.tsv"
for required in libc-bin libc6 libc-l10n locales; do
    awk -F '\t' -v p="$required" -v a="$EXPECTED_ARCH" -v v="$base_version" '($1==p || $1==p ":" a) && $2==v {n++} END {exit n!=1}' "$root/admission/before.tsv"
done
locale -a > "$root/admission/locales-before.txt"
postgres_binary=$(command -v postgres)
sha256sum "$postgres_binary" > "$root/admission/postgres-before.sha256"
mapfile -t packages < <(cut -f1 "$root/admission/before.tsv")
test "${#packages[@]}" -ge 4 && test "${#packages[@]}" -le 16
declare -a debs=()
declare -A seen=()
for deb in "$root/packages/"*.deb; do
    test -f "$deb" && test ! -L "$deb"
    package=$(dpkg-deb --field "$deb" Package)
    version=$(dpkg-deb --field "$deb" Version)
    arch=$(dpkg-deb --field "$deb" Architecture)
    source=$(dpkg-deb --field "$deb" Source)
    test "${source%% *}" = glibc && test "$version" = "$candidate_version"
    test "$arch" = "$EXPECTED_ARCH" || test "$arch" = all
    match=0
    for installed in "${packages[@]}"; do
        test "${installed%%:*}" = "$package" || continue
        test -z "${seen[$installed]:-}"
        test "$(awk -F '\t' -v p="$installed" '$1==p{print $2}' "$root/admission/before.tsv")" = "$base_version"
        seen[$installed]=1;match=1
    done
    test "$match" = 1
    debs+=("$deb")
done
test "${#seen[@]}" = "${#packages[@]}" && test "${#debs[@]}" = "${#packages[@]}"
# One coherent same-source transaction; no apt fallback, ignored dependency or downgrade.
dpkg -i "${debs[@]}" > "$root/admission/install.log" 2>&1
for package in "${packages[@]}"; do
    test "$(dpkg-query -W -f='${Version}' "$package")" = "$candidate_version"
done
sha256sum -c "$root/admission/postgres-before.sha256"
locale -a > "$root/admission/locales-after.txt"
cmp "$root/admission/locales-before.txt" "$root/admission/locales-after.txt"
dpkg-query -W -f='${db:Status-Abbrev}\t${binary:Package}\t${source:Package}\t${Version}\n' > "$root/admission/after.tsv"

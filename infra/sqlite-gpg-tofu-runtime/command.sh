#!/bin/sh
# Only fictional fixture data lives below this owned tmpfs. No host home/socket.
set -eu
umask 077
ulimit -f 2048
export HOME=/work LC_ALL=C
step=${1-}
case "$step" in
 init)
  mkdir /work/evidence /work/export /work/signer /work/baseline /work/candidate
  chmod 700 /work/evidence /work/export /work/signer /work/baseline /work/candidate
  printf 'SQLite runtime fixture message A\n' > /work/message-a.txt
  printf 'SQLite runtime fixture message B\n' > /work/message-b.txt
  printf 'SQLite runtime fixture tampered A\n' > /work/tampered.txt
  exit 0;;
 identity-before|identity-after)
  sha256sum /usr/bin/gpg /usr/bin/gpg-agent /usr/bin/gpgconf /usr/bin/gpg-connect-agent /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 /usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6 /candidate/libsqlite3.so.0 > "/work/evidence/$step.out"
  exit 0;;
 version)
  /usr/bin/gpg --no-options --homedir /work/signer --version > /work/evidence/version.out 2>/work/evidence/version.err
  /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 --version > /work/evidence/loader-version.out 2>/work/evidence/loader-version.err
  exit 0;;
 agent-signer|agent-baseline|agent-candidate)
  home=${step#agent-}
  /usr/bin/gpg-connect-agent --homedir "/work/$home" 'GETINFO pid' /bye > "/work/evidence/$step.out" 2> "/work/evidence/$step.err"
  exit 0;;
 close)
  for home in signer baseline candidate; do
   original=$(awk '/^D [0-9]+$/{print $2}' "/work/evidence/agent-$home.out")
   case "$original" in ''|*[!0-9]*|0|1) exit 1;; esac
   /usr/bin/gpg-connect-agent --no-autostart --homedir "/work/$home" 'GETINFO pid' /bye > "/work/evidence/close-$home.out" 2> "/work/evidence/close-$home.err"
   current=$(awk '/^D [0-9]+$/{print $2}' "/work/evidence/close-$home.out")
   test "$current" = "$original"
   /usr/bin/gpgconf --homedir "/work/$home" --kill gpg-agent > "/work/evidence/shutdown-$home.out" 2> "/work/evidence/shutdown-$home.err"
   tries=0
   while kill -0 "$original" 2>/dev/null; do
    tries=$((tries+1)); test "$tries" -le 150; sleep .1
   done
  done
  printf 'owned-agent-closure=3\n' > /work/evidence/closure.out
  exit 0;;
 export)
  # Fixed data-only allowlist; never copy homes, keys, messages, DBs or sockets.
  total=0
  copy_one() {
   source=$1; destination=$2; limit=$3
   test -f "$source" && test ! -L "$source"
   count=$(wc -c < "$source"); test "$count" -le "$limit"
   total=$((total+count)); test "$total" -le 8388608
   cp --no-dereference "$source" "$destination"
  }
  for name in identity-before identity-after version loader-version fingerprint closure; do
   if test -f "/work/evidence/$name.out"; then copy_one "/work/evidence/$name.out" "/work/export/$name.out" 65536; fi
  done
  for phase in baseline candidate; do
   for which in a1 a2 b tamper; do
    name=$phase-verify-$which
    for suffix in status pid exit; do
     if test -f "/work/evidence/$name.$suffix"; then copy_one "/work/evidence/$name.$suffix" "/work/export/$name.$suffix" 65536; fi
    done
    if test -f "/work/evidence/$name.pid"; then
     pid=$(cat "/work/evidence/$name.pid"); case "$pid" in ''|*[!0-9]*|0|1) exit 1;; esac
     if test -f "/work/evidence/loader-$name.$pid"; then copy_one "/work/evidence/loader-$name.$pid" "/work/export/$name.loader" 1048576; fi
    fi
    name=$phase-list-$which
    for suffix in out exit; do
     if test -f "/work/evidence/$name.$suffix"; then copy_one "/work/evidence/$name.$suffix" "/work/export/$name.$suffix" 65536; fi
    done
   done
   if test -f "/work/$phase/tofu.db"; then od -An -tx1 -N16 "/work/$phase/tofu.db" > "/work/export/$phase.dbheader"; fi
  done
  exit 0;;
 generate|public|sign-a|sign-b|fingerprint) phase=signer; library=/usr/lib/x86_64-linux-gnu;;
 baseline-import|baseline-verify-a1|baseline-verify-a2|baseline-verify-b|baseline-verify-tamper|baseline-list-a1|baseline-list-a2|baseline-list-b|baseline-list-tamper) phase=baseline; library=/usr/lib/x86_64-linux-gnu;;
 candidate-import|candidate-verify-a1|candidate-verify-a2|candidate-verify-b|candidate-verify-tamper|candidate-list-a1|candidate-list-a2|candidate-list-b|candidate-list-tamper) phase=candidate; library=/candidate:/usr/lib/x86_64-linux-gnu;;
 *) exit 1;;
esac
set -- --no-options --batch --yes --no-tty --homedir "/work/$phase" --no-auto-key-retrieve --auto-key-locate clear
case "$step" in
 generate) set -- "$@" --pinentry-mode loopback --passphrase '' --quick-generate-key 'SQLite Runtime Fixture <sqlite-fixture@example.invalid>' ed25519 sign never;;
 public) set -- "$@" --output /work/public.gpg --export;;
 sign-a|sign-b) which=${step#sign-}; set -- "$@" --pinentry-mode loopback --passphrase '' --output "/work/message-$which.sig" --detach-sign "/work/message-$which.txt";;
 fingerprint) set -- "$@" --with-colons --fingerprint --list-keys;;
 *-import) set -- "$@" --import /work/public.gpg;;
 *-list-*) set -- "$@" --trust-model tofu --with-colons --fingerprint --with-tofu-info --list-keys;;
 *-verify-*)
  which=${step##*-}; case "$which" in a1|a2) sig=a; data=/work/message-a.txt;; b) sig=b; data=/work/message-b.txt;; tamper) sig=a; data=/work/tampered.txt;; *) exit 1;; esac
  set -- "$@" --trust-model tofu --status-fd 3 --verify "/work/message-$sig.sig" "$data";;
esac
set +e
case "$step" in
 *-verify-*)
  LD_DEBUG=libs LD_DEBUG_OUTPUT="/work/evidence/loader-$step" /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 --library-path "$library" /usr/bin/gpg "$@" 3>"/work/evidence/$step.status" >"/work/evidence/$step.out" 2>"/work/evidence/$step.err" &
  pid=$!; printf '%s\n' "$pid" > "/work/evidence/$step.pid"; wait "$pid"; rc=$?;;
 *) /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 --library-path "$library" /usr/bin/gpg "$@" >"/work/evidence/$step.out" 2>"/work/evidence/$step.err"; rc=$?;;
esac
set -e
printf '%s\n' "$rc" > "/work/evidence/$step.exit"
case "$step" in *-verify-*) exit 0;; *) test "$rc" -eq 0;; esac

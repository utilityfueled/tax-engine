/* Causal environment probe only; not a replacement glibc test or qualification. */
#include <sys/personality.h>
#include <errno.h>
#include <time.h>
#include <stdio.h>
_Static_assert(CLOCK_MONOTONIC == 1, "fixed monotonic clock id");
_Static_assert(PER_LINUX == 0, "fixed process persona");
_Static_assert(EINVAL == 22 && EPERM == 1, "fixed native errno values");
int main(void) {
  const unsigned int query = 0xffffffffU, requested = (unsigned int)-EINVAL;
  int initial = personality(query);
  if (initial != PER_LINUX) {
    puts("{\"initialPersonaZero\":false}");
    return 2;
  }
  errno = 0xdefaced;
  int changed = personality(requested);
  int change_errno = errno;
  int observed = personality(query);
  int query_errno = errno;
  (void)personality(PER_LINUX);
  int restored = personality(query);
  if (restored != PER_LINUX) {
    puts("{\"initialPersonaZero\":true,\"restoreZero\":false}");
    return 3;
  }
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
    puts("{\"initialPersonaZero\":true,\"restoreZero\":true,\"monotonicRead\":false}");
    return 4;
  }
  errno = 0;
  int set_result = clock_settime(CLOCK_MONOTONIC, &ts);
  int set_errno = errno;
  printf("{\"initialPersonaZero\":true,\"restoreZero\":true,\"monotonicRead\":true,\"personalityReturnedSaved\":%s,\"personalityErrno\":%d,\"queryMatchesRequested\":%s,\"errnoSentinelUnchanged\":%s,\"clockReturnedMinusOne\":%s,\"clockErrno\":%d}\n",
      changed == initial ? "true" : "false", change_errno,
      (unsigned int)observed == requested ? "true" : "false",
      change_errno == 0xdefaced && query_errno == 0xdefaced ? "true" : "false",
      set_result == -1 ? "true" : "false", set_errno);
  return set_result == -1 ? 0 : 5;
}

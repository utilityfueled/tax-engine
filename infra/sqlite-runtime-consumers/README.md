# Immutable SQLite consumer discovery

This default-off hosted AMD64 probe identifies regular ELF payloads with a
direct `DT_NEEDED` dependency on `libsqlite3.so.0` in the existing immutable
PostgreSQL base. It does not discover every indirect, script, `dlopen` or alias
use, qualify ABI/runtime compatibility, install a candidate or accept an advisory.
An empty direct-consumer list must not be described as no SQLite uses.

The current Compose index and existing source manifest's AMD64 digest must match
the two declared pins. The inherited source controller retains exact source,
public/default branch, first attempt, native hosted Docker, capacity, bounded
owned-command and normal label-scoped cleanup gates. The job/controller/cleanup
limits are 15/12/3 minutes. Initial capacity remains the inherited 20 GiB floor.

Only a new labeled, unstarted container is created. Its immutable image, created
state, read-only root, no network, dropped capabilities, no privilege,
no-new-privileges and single PostgreSQL-data tmpfs are checked before and after
export. The container is never started. Cleanup removes only this owned container
and its owned volumes; all initially present images are preserved.

The export stays private and is bounded by a 1 GiB inspected image and 2 GiB
archive limit. The reader follows no archive links and extracts no filesystem
tree. It rejects duplicate/traversing names, oversized/incomplete members,
reader failures and unknown dependency records. Before the logical tar reader,
a physical-header scan caps PAX metadata at 64 KiB, GNU names at 4 KiB,
aggregate extension metadata at 16 MiB and
consecutive extension headers at sixteen, rejects sparse headers and excessive
physical counts, checks complete bodies and requires zero end padding. It seeks
over bodies without buffering them. Each regular ELF payload is
temporarily copied under a generated private basename and read by a bounded
Python parser, never executed. It starts no nested process. ELF32/ELF64 and both
byte orders use the official [System V program-header](https://gabi.xinuos.com/elf/07-pheader.html)
and [dynamic-table](https://gabi.xinuos.com/elf/08-dynamic.html) layouts. Program
tables, segments, dynamic entries, mapped string tables and names are bounded;
incomplete or ambiguous metadata holds discovery. All payload hashes, direct dependencies, SQLite SONAME
providers, package ownership/versions, link counts and the complete archive hash
are recorded. A missing provider is a HOLD. Temporary payload removal is required
before a successful report. Exported evidence excludes the raw rootfs archive
and ELF bytes; it contains metadata and the inherited public-image command logs.

Three spec-first controls genuinely failed before implementation. Independent
review then found that the original nested reader buffered before checking its
output limit and managed its own timeout. A new parser regression genuinely
failed before that reader was replaced. A second review reproduced oversized
PAX metadata being read before logical member checks; a further spec-first
regression failed before adding the physical-header scan. All six controls now
pass, including hash/source refusal, container-security mutation,
traversal/duplicate/missing-provider/reader negatives and an injected trace of
the actual discovery method. They make no Docker call. Actual native discovery,
independent source review and runtime qualification remain pending.

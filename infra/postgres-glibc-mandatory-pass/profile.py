"""Fixed six-case admission. Reads existing files; never runs compiler/test/log text.

Spec: spec/ops/glibc-six-mandatory-pass.yaml. Outer source/image/run custody is
required separately. Export-time identities are not historical execution proof.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import struct
import time

TOTAL_MAX = 16 * 1024 * 1024
FILE_MAX = 1024 * 1024
LOG_MAX = 256 * 1024 * 1024
SOURCES = {
    'nptl/tst-create-detached': 'sysdeps/pthread/tst-create-detached.c',
    'nptl/tst-robust8': 'sysdeps/pthread/tst-robust8.c',
    'rt/tst-cpuclock2': 'rt/tst-cpuclock2.c',
    'rt/tst-cputimer1': 'rt/tst-cputimer1.c',
    'rt/tst-timer': 'sysdeps/pthread/tst-timer.c',
    'support/tst-support_descriptors': 'support/tst-support_descriptors.c',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(value, reason):
    if not value:
        raise ValueError(reason)


def signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_uid)


def safe(path):
    path = Path(path).absolute()
    require(path.resolve() == path, 'noncanonical-path')
    for parent in [path.parent, *path.parents]:
        require(stat.S_ISDIR(parent.lstat().st_mode), 'directory-custody')
    return path


def held(path, limit, deadline=None):
    path = safe(path)
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1,
            'regular-single-link-required')
    require(before.st_size <= limit, 'size-limit')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        require(signature(os.fstat(fd)) == signature(before), 'open-custody')
        chunks = []
        count = 0
        while True:
            if deadline is not None:
                require(time.monotonic() < deadline, 'deadline')
            chunk = os.read(fd, min(65536, limit + 1 - count))
            if not chunk:
                break
            chunks.append(chunk)
            count += len(chunk)
            require(count <= limit, 'size-limit')
        require(signature(os.fstat(fd)) == signature(before), 'fd-custody')
        require(signature(path.lstat()) == signature(before), 'path-custody')
        return b''.join(chunks), signature(before)
    finally:
        os.close(fd)


def elf(data, object_file):
    require(len(data) >= 64, 'short-elf')
    require(data[:7] == b'\x7fELF\x02\x01\x01', 'native-elf-format')
    kind, machine, version = struct.unpack_from('<HHI', data, 16)
    require(machine == 62 and version == 1, 'native-elf-machine')
    require(kind == 1 if object_file else kind in (2, 3), 'elf-kind')
    require(struct.unpack_from('<H', data, 52)[0] == 64, 'elf-header-size')
    # Structural identity only. Original test results/commands provide execution
    # evidence; an ELF header alone never proves that a test body executed.


def commands(path, variant, deadline=None):
    data, custody = held(path, LOG_MAX, deadline)
    rows = {case: {} for case in SOURCES}
    prefix = f'/qualification-work/{variant}/build-tree/amd64-libc/'
    for number, raw in enumerate(data.splitlines(), 1):
        if deadline is not None:
            require(time.monotonic() < deadline, 'deadline')
        require(len(raw) <= FILE_MAX, 'log-line-limit')
        if prefix.encode() not in raw:
            continue
        for case, source in SOURCES.items():
            binary = prefix + case
            obj = binary + '.o'
            if not re.search(rb'(?<![A-Za-z0-9_-])' + case.split('/')[-1].encode()
                             + rb'(?![A-Za-z0-9_-])', raw):
                continue
            text = raw.decode('ascii')
            kind = None
            if ' -c ' in text and f'-o {obj} ' in text:
                expected = '../' + source if source.startswith('sysdeps/') else case.split('/')[-1] + '.c'
                require(text.startswith('x86_64-linux-gnu-gcc-12 -Wl,--hash-style=both '
                                        + expected + ' -c '), 'compile-source')
                require(f'-MF {obj}.dt ' in text and f'-MT {obj}' in text,
                        'compile-dependency-target')
                require(f'-include {prefix}libc-modules.h ' in text
                        and '-include ../include/libc-symbols.h ' in text,
                        'compile-forced-headers')
                kind = 'compile'
            elif ' -c ' not in text and f'-o {binary} ' in text:
                require(text.startswith('x86_64-linux-gnu-gcc-12 ')
                        and obj in text.split(), 'link-object')
                kind = 'link'
            elif text.startswith('env ') and binary in text.split():
                require(prefix + 'elf/ld-linux-x86-64.so.2' in text.split()
                        and binary + '.out' in text.split(), 'original-loader-output')
                kind = 'execute'
            elif text.startswith('../scripts/evaluate-test.sh ' + case + ' '):
                require(text == f'../scripts/evaluate-test.sh {case} $? false false > {binary}.test-result',
                        'effective-mandatory-pass-annotation')
                kind = 'evaluate'
            if kind:
                require(kind not in rows[case], 'duplicate-command')
                rows[case][kind] = {'line': number, 'text': text}
    for row in rows.values():
        require(set(row) == {'compile', 'link', 'execute', 'evaluate'}, 'missing-command')
    return {'logSha256': sha(data), 'logBytes': len(data), 'cases': rows}, custody


def file_names():
    result = {'config.h': 65536, 'libc-modules.h': 65536}
    for case in SOURCES:
        result.update({case: FILE_MAX, case + '.o': FILE_MAX,
                       case + '.out': FILE_MAX,
                       case + '.test-result': 65536})
    return result



def dependency_tokens(data, variant, case, source):
    require(data.endswith(b'\n'), 'incomplete-dependency')
    lines = data.decode('ascii').replace('\\\n', ' ').splitlines()
    lines = [line for line in lines if line.strip()]
    require(bool(lines), 'missing-dependency-rule')
    prefix = f'/qualification-work/{variant}/'
    build = prefix + 'build-tree/amd64-libc/'
    def token(value):
        if '$' in value:
            require(value.startswith('$(common-objpfx)') and value.count('$') == 1,
                    'unsupported-dependency-make-syntax')
            value = build + value[len('$(common-objpfx)'):]
        require(re.fullmatch(r'[A-Za-z0-9_./+:-]+', value) is not None,
                'unsupported-dependency-token')
        return value
    main = [token(value) for value in lines[0].split()]
    require(main[0] == build + case + '.o:', 'dependency-target')
    dependencies = main[1:]
    require(dependencies and all(':' not in value for value in dependencies), 'dependency-rule-shape')
    require(len(dependencies) == len(set(dependencies)), 'ambiguous-dependency-duplicates')
    phony = []
    for line in lines[1:]:
        values = line.split()
        require(len(values) == 1, 'unsupported-dependency-extra-rule')
        value = token(values[0])
        require(value.endswith(':') and ':' not in value[:-1], 'dependency-phony-shape')
        phony.append(value)
    require(len(phony) == len(set(phony)), 'ambiguous-phony-duplicates')
    required = [source, 'build-tree/amd64-libc/config.h',
                'build-tree/amd64-libc/libc-modules.h', 'include/libc-symbols.h']
    if case == 'rt/tst-cputimer1':
        required.append('rt/tst-timer4.c')
    for name in required:
        alternatives = [prefix + name]
        if name == source:
            alternatives.append('../' + source if source.startswith('sysdeps/') else case.split('/')[-1] + '.c')
        elif name == 'include/libc-symbols.h':
            alternatives.append('../include/libc-symbols.h')
        elif name == 'rt/tst-timer4.c':
            alternatives.append('tst-timer4.c')
        require(any(item in dependencies for item in alternatives), 'required-source-header-dependency')
    return (main[0], tuple(sorted(dependencies)), tuple(sorted(phony)))


def output(case, data):
    text = data.decode('utf-8')
    require(not re.search(r'skipping test|not supported|does not support|cannot support|'
                          r'mutexattr_init failed|Timed out:|error while loading shared libraries|'
                          r'Segmentation fault|Bus error|unsupported stub', text), 'unsupported-or-tool-failure')
    if case in ('nptl/tst-create-detached', 'nptl/tst-robust8'):
        require(text == '', 'unexpected-quiet-test-output')
    elif case == 'rt/tst-cpuclock2':
        for marker in ['live thread clock ', 'live thread before sleep => ',
                       'self thread before sleep => ', 'live thread after sleep => ',
                       'self thread after sleep => ']:
            require(text.count(marker) == 1, 'missing-cpuclock-full-path')
    elif case == 'rt/tst-cputimer1':
        for marker in ['clock_gettime returned timespec = ', 'clock_getres returned timespec = ']:
            require(text.count(marker) == 1, 'missing-cputimer-full-path')
    elif case == 'rt/tst-timer':
        for marker in ['signal_func', 'notify_func1', 'notify_func2']:
            require(marker in text, 'missing-timer-callback-path')
    else:
        # This body intentionally emits expected negative subprocess diagnostics.
        for marker in ['closed_descriptor', 'opened_descriptor', 'changed_descriptor']:
            require(text.count('info: END subprocess_' + marker + ' output') == 2, 'missing-descriptor-self-check')
        require('info: descriptor set with sentinel descriptor' in text, 'missing-descriptor-sentinel')


def capture(work, out, deadline, budget, authority):
    work, out = Path(work), Path(out)
    dest = out / 'mandatory-pass'
    dest.mkdir(mode=0o700)
    result = {'passed': False, 'files': {}, 'sources': {}, 'variants': ['baseline', 'candidate'],
              'flavour': 'amd64-libc', 'exclusiveBuildTreeRequired': True,
              'historicalExecutionIdentityProven': False, 'outerSourceImageRunBindingRequired': True,
              'unavailableReasons': [], 'aggregateBytes': TOTAL_MAX,
              'priorDiagnosticReservedBytes': budget['reserved'], 'summaryReservationBytes': 65536}
    captures = []
    try:
        require(list(authority['cases']) == list(SOURCES), 'authority-cases')
        require(math.isfinite(deadline) and 0 < deadline - time.monotonic() <= 6, 'shared-deadline')
        require(all(isinstance(budget[k], int) and not isinstance(budget[k], bool) and budget[k] >= 0 for k in ['remaining', 'reserved']) and budget['remaining'] + budget['reserved'] == TOTAL_MAX, 'shared-budget')
        require(budget['remaining'] >= 65536, 'summary-reservation')
        budget['remaining'] -= 65536
        budget['reserved'] += 65536
        for variant in result['variants']:
            source = work / variant
            target = dest / variant
            target.mkdir()
            result['sources'][variant] = {}
            for name, pin in authority['sources'].items():
                data, custody = held(source / name, 65536, deadline)
                require(sha(data) == pin['sha256'] == sha(pin['text'].encode()), 'source-authority')
                result['sources'][variant][name] = sha(data)
                captures.append((source / name, 65536, custody, data))
            names = file_names()
            for case in SOURCES:
                dependencies = [case + suffix for suffix in ['.o.d', '.o.dt'] if os.path.lexists(source / 'build-tree/amd64-libc' / (case + suffix))]
                require(bool(dependencies), 'missing-both-dependency-forms')
                names.update({name: 65536 for name in dependencies})
            for name, limit in names.items():
                path = source / 'build-tree/amd64-libc' / name
                require(path.lstat().st_size <= budget['remaining'], 'aggregate-limit')
                data, custody = held(path, limit, deadline)
                require(len(data) <= budget['remaining'], 'aggregate-limit')
                budget['remaining'] -= len(data)
                budget['reserved'] += len(data)
                copy = target / name
                copy.parent.mkdir(parents=True, exist_ok=True)
                with copy.open('xb') as stream:
                    require(stream.write(data) == len(data), 'short-write')
                result['files'][variant + '/' + name] = {'bytes': len(data), 'sha256': sha(data)}
                captures.append((path, limit, custody, data))
            record, custody = commands(out / variant / 'package-build.log', variant, deadline)
            data = (json.dumps(record, sort_keys=True) + '\n').encode()
            require(len(data) <= 65536, 'commands-file-limit')
            require(len(data) <= budget['remaining'], 'aggregate-limit')
            budget['remaining'] -= len(data)
            budget['reserved'] += len(data)
            with (target / 'commands.json').open('xb') as stream:
                require(stream.write(data) == len(data), 'short-write')
            result['files'][variant + '/commands.json'] = {'bytes': len(data), 'sha256': sha(data)}
            # Log is already exported by the original recipe. Preserve its full
            # digest and custody; do not make a second unbounded artifact copy.
            captures.append((out / variant / 'package-build.log', LOG_MAX, custody, None))
        for path, limit, custody, data in captures:
            current, now = held(path, limit, deadline)
            require(now == custody and (data is None or current == data), 'final-custody')
        result['passed'] = True
    except (OSError, ValueError, UnicodeError, KeyError, TypeError, RuntimeError):
        result['unavailableReasons'].append('missing-size-time-budget-or-custody')
    result['reservedAggregateBytes'] = budget['reserved']
    with (dest / 'summary.json').open('x') as stream:
        json.dump(result, stream, indent=2, sort_keys=True)
        stream.write('\n')
    if result['passed']:
        try:
            verify(out, authority, deadline)
        except (OSError, ValueError, UnicodeError, KeyError, TypeError, RuntimeError):
            result['passed'] = False
            result['unavailableReasons'].append('mandatory-admission')
            (dest / 'summary.json').write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    return result


def verify(out, authority, deadline=None):
    out = Path(out)
    dest = out / 'mandatory-pass'
    result = json.loads(held(dest / 'summary.json', 65536, deadline)[0])
    require(result['passed'] is True and result['unavailableReasons'] == [], 'unavailable-evidence')
    require(result['variants'] == ['baseline', 'candidate'] and result['flavour'] == 'amd64-libc', 'profile-scope')
    expected = {variant + '/' + name for variant in result['variants']
                for name in [*file_names(), 'commands.json']}
    selected_dependencies = {}
    for variant in result['variants']:
        selected_dependencies[variant] = {}
        for case in SOURCES:
            selected = []
            for suffix in ['.o.d', '.o.dt']:
                name = case + suffix
                key = variant + '/' + name
                present = os.path.lexists(dest / variant / name)
                require(present == (key in result['files']), 'dependency-inventory-custody')
                if present:
                    selected.append(name)
                    expected.add(key)
            require(bool(selected), 'missing-both-dependency-forms')
            selected_dependencies[variant][case] = selected
    require(set(result['files']) == expected, 'file-inventory')
    require(0 <= result['reservedAggregateBytes'] <= TOTAL_MAX, 'aggregate-limit')
    require(isinstance(result['priorDiagnosticReservedBytes'], int) and result['priorDiagnosticReservedBytes'] >= 0 and result['summaryReservationBytes'] == 65536, 'prior-budget-binding')
    require(sum(x['bytes'] for x in result['files'].values()) + result['priorDiagnosticReservedBytes'] + 65536 == result['reservedAggregateBytes'], 'budget-binding')
    for variant in result['variants']:
        suite_paths = held(out / variant / 'suite-paths.txt', 65536, deadline)[0].decode().splitlines()
        require(suite_paths.count('build-tree/amd64-libc/tests.sum') == 1, 'original-suite-scope')
        summary = held(out / variant / 'amd64-libc-tests.sum', 16 * 1024 * 1024, deadline)[0].decode().splitlines()
        source_ledger = held(out / variant / 'source-files.sha256', 16 * 1024 * 1024, deadline)[0].decode().splitlines()
        require(result['sources'][variant] == {n: p['sha256'] for n, p in authority['sources'].items()}, 'source-pins')
        for name, pin in authority['sources'].items():
            require(sha(pin['text'].encode()) == pin['sha256'], 'authority-body')
            require(source_ledger.count(pin['sha256'] + '  ./' + name) == 1, 'actual-source-ledger')
        held_files = {}
        dependency_files = [name for names in selected_dependencies[variant].values() for name in names]
        limits = file_names()
        limits.update({name: 65536 for name in dependency_files})
        limits['commands.json'] = 65536
        for name, limit in limits.items():
            data = held(dest / variant / name, limit, deadline)[0]
            require(result['files'][variant + '/' + name] == {'bytes': len(data), 'sha256': sha(data)}, 'held-bytes-digest')
            held_files[name] = data
        observed, _ = commands(out / variant / 'package-build.log', variant, deadline)
        require(json.loads(held_files['commands.json']) == observed, 'actual-command-binding')
        prefix = f'/qualification-work/{variant}/'
        for case, source in SOURCES.items():
            relevant = [line for line in summary if line.split(': ', 1)[-1] == case]
            require(relevant == ['PASS: ' + case], 'mandatory-summary-pass-once')
            require(held_files[case + '.test-result'] == f'PASS: {case}\noriginal exit status 0\n'.encode(), 'mandatory-original-exit')
            elf(held_files[case], False)
            elf(held_files[case + '.o'], True)
            dependency_forms = [dependency_tokens(held_files[name], variant, case, source)
                                for name in selected_dependencies[variant][case]]
            require(all(form == dependency_forms[0] for form in dependency_forms), 'disagreeing-dependency-forms')
            output(case, held_files[case + '.out'])
    if deadline is not None:
        require(time.monotonic() < deadline, 'deadline')
    return True


AUTHORITY_SHA = 'bcb167212f4c0be899a00148252462b19c840d21dcdfffde092d7e8fce8901ee'


def load_authority():
    data = held(Path(__file__).resolve().with_name('authority.json'), 1024 * 1024)[0]
    require(sha(data) == AUTHORITY_SHA, 'authority-file-pin')
    return json.loads(data)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', type=Path, required=True)
    args = parser.parse_args()
    try:
        ok = verify(args.verify, load_authority())
    except (OSError, ValueError, UnicodeError, KeyError, TypeError, RuntimeError):
        ok = False
    raise SystemExit(0 if ok else 1)

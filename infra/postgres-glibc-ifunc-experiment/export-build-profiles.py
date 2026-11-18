"""Export literal per-flavour configuration; never source make/shell input.

This observes an exclusively owned build tree at export time. It does not prove
historical linker execution or resist hostile concurrent writers.
"""
import argparse, hashlib, json, os, re, shutil, stat, subprocess, time
from pathlib import Path

NAMES = {'config.make': 1024*1024, 'configparms': 1024*1024, 'config.log': 4*1024*1024}
FLAVOUR = re.compile(r'(amd64|arm64)-(libc|i386|x32)\Z')
TOKEN = re.compile(r'(?:/[A-Za-z0-9_.+-]+)*/(?:[a-z0-9_]+-linux-gnu-)?ld(?:\.bfd|\.gold|\.lld)?\Z|(?:[a-z0-9_]+-linux-gnu-)?ld(?:\.bfd|\.gold|\.lld)?\Z')

def signature(s):
    return (s.st_dev, s.st_ino, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)

def regular_bytes(path, limit):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
        raise ValueError('source-custody')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if signature(os.fstat(fd)) != signature(before):
            raise ValueError('source-custody')
        chunks=[]; size=0
        while True:
            chunk=os.read(fd, min(65536, limit+1-size))
            if not chunk: break
            chunks.append(chunk); size+=len(chunk)
            if size>limit: raise ValueError('source-size')
        if signature(os.fstat(fd)) != signature(before) or signature(path.lstat()) != signature(before):
            raise ValueError('source-custody')
        return b''.join(chunks)
    finally:
        os.close(fd)

def directory(path):
    s=path.lstat()
    if not stat.S_ISDIR(s.st_mode) or path.resolve() != path:
        raise ValueError('directory-custody')

def linker_identity(value, deadline):
    unavailable={'available':False, 'configured':value, 'reason':'linker-identity-unavailable', 'observedAt':'export-time'}
    if not TOKEN.fullmatch(value): return unavailable
    selected=shutil.which(value) if '/' not in value else value
    if not selected: return unavailable
    path=Path(selected).resolve()
    if not (str(path).startswith('/usr/bin/') or str(path).startswith('/bin/') or re.fullmatch(r'/usr/lib/llvm-[0-9]+/bin/ld\.lld',str(path))): return unavailable
    try:
        data=regular_bytes(path,64*1024*1024)
        if not data.startswith(b'\x7fELF'): return unavailable
        remaining=deadline-time.monotonic()
        if remaining<=0: return unavailable
        import selectors
        started=time.monotonic(); data_out=bytearray()
        proc=subprocess.Popen([str(path),'--version'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,close_fds=True)
        try:
            with selectors.DefaultSelector() as ready:
                ready.register(proc.stdout,selectors.EVENT_READ)
                while ready.get_map():
                    remaining=min(deadline,started+1.0)-time.monotonic()
                    if remaining<=0: return unavailable
                    for key,_ in ready.select(remaining):
                        chunk=os.read(key.fileobj.fileno(),min(4096,65537-len(data_out)))
                        if not chunk: ready.unregister(key.fileobj);break
                        data_out.extend(chunk)
                        if len(data_out)>65536: return unavailable
                remaining=min(deadline,started+1.0)-time.monotonic()
                if remaining<=0 or proc.wait(timeout=remaining)!=0: return unavailable
                version=data_out.decode('utf-8','replace')
        finally:
            if proc.poll() is None: proc.kill();proc.wait()
            proc.stdout.close()
        if regular_bytes(path,64*1024*1024)!=data: return unavailable
        return {'available':True,'configured':value,'resolved':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'version':version,'exit':0,'observedAt':'export-time'}
    except (OSError,ValueError,subprocess.SubprocessError): return unavailable

DEBIAN_XFAIL_SHA='c75938bb76320623f776b29f67bd21bc4d0a782c8495093998ee390db7ed3903'

def assignments(data, required, admitted_include=None):
    """Admit a deliberately limited literal subset, never evaluate GNU Make.

    Non-relevant assignments may contain plain variable references as used by
    the authenticated target template. Functions, directives, indirection on
    the left, relevant prefixes/operators and continuations are unavailable.
    """
    text=data.decode('utf-8',errors='strict');result={};included=False
    if '\r' in text: raise ValueError('unsupported-carriage-return')
    for physical in text.split('\n'):
        line=physical.strip(' \t')
        if line.endswith('\\'): raise ValueError('continuation')
        if not line or line.startswith('#'): continue
        if admitted_include is not None and line==admitted_include:
            if included: raise ValueError('duplicate-include')
            included=True;continue
        m=re.fullmatch(r'([A-Za-z0-9_.+-]+?)[ \t]*([:+?]?=)[ \t]*(.*?)[ \t]*',line)
        if not m: raise ValueError('unsupported-make-statement')
        name,operator,value=m.groups()
        if name in ['MAKEFLAGS','MAKEOVERRIDES','GNUMAKEFLAGS','.RECIPEPREFIX','.SHELLFLAGS']:
            raise ValueError('unsupported-make-special-variable')
        if name in ['with-lld','LD']:
            if operator!='=' or name in result: raise ValueError('ambiguous-assignment')
            if name=='LD' and not TOKEN.fullmatch(value): raise ValueError('nonliteral-linker')
            if name=='with-lld' and not re.fullmatch(r'[A-Za-z0-9_.+-]*',value): raise ValueError('nonliteral-with-lld')
            result[name]=value
        else:
            # Plain references in unrelated values (e.g. AS=$(CC) -c) are
            # retained as raw data. A Make function or other dollar syntax
            # could have side effects and is not admitted.
            literal=re.sub(r'\$\([A-Za-z0-9_.+-]+\)|\$\{[A-Za-z0-9_.+-]+\}','',value)
            if '$' in literal: raise ValueError('unsupported-make-indirection')
    if any(name not in result for name in required): raise ValueError('missing-assignment')
    return result

def collect(work,out,identity=None):
    work=Path(work).absolute();out=Path(out).absolute();directory(work);directory(out)
    dest=out/'build-profiles';dest.mkdir(mode=0o700)
    result={'passed':False,'profiles':[],'packageQualificationClaim':False,'observation':'export-time-source-and-linker-identity','historicalLinkerExecutionProven':False,'exclusiveBuildTreeRequired':True,'missingVariants':[]}
    deadline=time.monotonic()+6.0;identity=identity or linker_identity
    count=0
    for variant in ['baseline','candidate']:
        tree=work/variant/'build-tree'
        if not tree.exists(): result['missingVariants'].append(variant);continue
        try:
            directory(work/variant);directory(tree)
            entries=sorted(tree.iterdir())
            if len(entries)>256: raise ValueError('entry-limit')
            flavours=[p for p in entries if FLAVOUR.fullmatch(p.name) or any(os.path.lexists(p/name) for name in NAMES)]
        except (OSError,ValueError):
            result['profiles'].append({'variant':variant,'available':False,'unavailableReasons':['tree-custody']});continue
        for source in flavours:
            count+=1
            if count>16:
                result['profiles'].append({'variant':variant,'available':False,'unavailableReasons':['profile-limit']});break
            row={'variant':variant,'flavour':source.name,'files':{},'available':False,'unavailableReasons':[],'linker':{'available':False,'reason':'configuration-unavailable'}}
            result['profiles'].append(row)
            try:
                if not FLAVOUR.fullmatch(source.name): raise ValueError('unsupported-profile')
                directory(source); custody={name:signature((source/name).lstat()) for name in NAMES}
                raw={name:regular_bytes(source/name,limit) for name,limit in NAMES.items()}
                # Re-read the complete group before exporting any configuration.
                if any(regular_bytes(source/name,NAMES[name])!=data or signature((source/name).lstat())!=custody[name] for name,data in raw.items()): raise ValueError('source-custody')
                target=dest/variant/source.name;target.mkdir(parents=True,mode=0o700)
                for name,data in raw.items():
                    with (target/name).open('xb') as f: f.write(data)
                    row['files'][name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
                configured=assignments(raw['config.make'],['with-lld','LD'])
                include_path=work/variant/'debian/testsuite-xfail-debian.mk'
                admitted_include='include '+str(include_path)
                include_data=None;include_custody=None;row['sourceIncludes']=[]
                if admitted_include in [line.strip(' \t') for line in raw['configparms'].decode('utf-8').split('\n')]:
                    directory(include_path.parent);include_custody=signature(include_path.lstat())
                    include_data=regular_bytes(include_path,1024*1024)
                    if hashlib.sha256(include_data).hexdigest()!=DEBIAN_XFAIL_SHA: raise ValueError('include-authority')
                    authority=regular_bytes(Path(__file__).resolve().with_name('debian-xfail-authority.mk'),1024*1024)
                    if authority!=include_data: raise ValueError('include-authority')
                    row['sourceIncludes'].append({'path':str(include_path),'bytes':len(include_data),'sha256':DEBIAN_XFAIL_SHA,'role':'exact-Debian-expected-failure-annotations'})
                overrides=assignments(raw['configparms'],[],admitted_include=admitted_include)
                row['configurationWithOverrides']={**configured,**overrides}
                row['makeEvaluationPerformed']=False
                row['identityBasis']='literal-config-with-plain-configparms-overrides-only'
                row.update(configuredWithLld=configured['with-lld'],configuredLd=configured['LD'],configparmsOverrides=overrides)
                effective=overrides.get('LD',configured['LD'])
                if not TOKEN.fullmatch(effective): raise ValueError('unsafe-linker-token')
                row['linker']=identity(effective,deadline)
                if not isinstance(row['linker'],dict) or row['linker'].get('available') is not True: raise ValueError('linker-unavailable')
                if any(regular_bytes(source/name,NAMES[name])!=data or signature((source/name).lstat())!=custody[name] for name,data in raw.items()): raise ValueError('source-custody')
                if include_data is not None and (regular_bytes(include_path,1024*1024)!=include_data or signature(include_path.lstat())!=include_custody): raise ValueError('include-custody')
                row['available']=True
            except (OSError,ValueError,UnicodeError,TypeError,KeyError):
                row['unavailableReasons'].append('configuration-or-linker-unavailable')
    result['passed']=bool(result['profiles']) and all(p['available'] for p in result['profiles'])
    with (dest/'summary.json').open('x') as f: json.dump(result,f,indent=2,sort_keys=True);f.write('\n')
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    try: ok=collect(args.work,args.output)['passed']
    except (OSError,ValueError): ok=False
    raise SystemExit(0 if ok else 1)

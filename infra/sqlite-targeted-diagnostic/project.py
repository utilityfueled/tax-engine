import json,re,shlex,sys
from pathlib import Path

def flags(text,variant):
 rows=[]
 for key in ['CFLAGS','OPT_FEATURE_FLAGS']:
  v=re.findall('^'+key+r' = (.*)$',text,re.M);assert len(v)==1
  rows.extend(shlex.split(v[0].replace('/qualification-work/'+variant,'/qualification-work/VARIANT')))
 return rows

def paired_flags(a,b):
 a,b=flags(a,'baseline'),flags(b,'dbpage')
 assert '-DSQLITE_ENABLE_DBPAGE_VTAB'not in a and b.count('-DSQLITE_ENABLE_DBPAGE_VTAB')==1
 assert [x for x in b if x!='-DSQLITE_ENABLE_DBPAGE_VTAB']==a
 return {'singleAddedFlag':'-DSQLITE_ENABLE_DBPAGE_VTAB','allOtherCompilerFlagsAndOrderExact':True}

def main(p,variant):
 if variant=='flags':
  d=paired_flags((p/'baseline-Makefile').read_text(),(p/'dbpage-Makefile').read_text())
  (p/'paired-flags.json').write_text(json.dumps(d,indent=2)+'\n');return
 assert variant in ['baseline','dbpage']
 rows=[l.split('\t',1)for l in(p/(variant+'-core.tsv')).read_text().splitlines()]
 d={};options=[]
 for k,v in rows:
  if k=='option':options.append(v)
  else:assert k not in d;d[k]=v
 assert set(d)=={'variant','path','version','sourceId','dbpage'}
 assert d['variant']==variant and d['version']=='3.40.1'
 assert re.fullmatch('/qualification-work/'+variant+r'/\.libs/libsqlite3\.so\.0(?:\.8\.6)?',d['path'])
 assert d['dbpage']in['0','1'];d['dbpage']=d['dbpage']=='1';d['options']=options
 loader=(p/(variant+'-cli-loader.txt')).read_text()
 assert re.search(r'calling init: /qualification-work/'+variant+r'/\.libs/libsqlite3\.so\.0(?:\.8\.6)?(?:\s|$)',loader)
 d['cliLoaderSelectedLocalLibrary']=True
 (p/(variant+'-core.json')).write_text(json.dumps(d,indent=2)+'\n')

if __name__=='__main__':main(Path('/qualification-out'),sys.argv[1])

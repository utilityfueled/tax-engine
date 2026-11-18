import {Buffer} from 'node:buffer';
import {gzipSync,zstdCompressSync} from 'node:zlib';
export const ROWS=['sourced-sh','executable-sh','plain-sql','gzip-sql','xz-sql','zstd-sql'];
const insert=kind=>`INSERT INTO public.init_qualification VALUES('${kind}',9007199254740991.01000001,decode('00010aff00f1','hex'),'<probe><value>init-restore</value></probe>');\n`;
export const INIT_ASSERTION=`DO $$ BEGIN IF (SELECT count(*) FROM public.init_qualification)<>6 OR EXISTS(SELECT 1 FROM public.init_qualification WHERE amount<>9007199254740991.01000001 OR body<>decode('00010aff00f1','hex') OR xpath('string(/probe/value)',doc)::text<>'{init-restore}') OR (SELECT array_agg(kind ORDER BY kind) FROM public.init_qualification)<>ARRAY['executable-sh','gzip-sql','plain-sql','sourced-sh','xz-sql','zstd-sql'] THEN RAISE EXCEPTION 'init fixture mismatch'; END IF; END $$;`;
export function fixtureFiles(){return [
 {name:'00-schema.sql',mode:0o644,bytes:Buffer.from('CREATE TABLE public.init_qualification(kind text PRIMARY KEY,amount numeric(38,8) NOT NULL,body bytea NOT NULL,doc xml NOT NULL);\n')},
 {name:'01-sourced.sh',mode:0o644,bytes:Buffer.from("docker_process_sql <<'SQL'\n"+insert('sourced-sh')+'SQL\n')},
 {name:'02-executable.sh',mode:0o755,bytes:Buffer.from('#!/usr/bin/env bash\nset -Eeuo pipefail\npsql -X --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<\'SQL\'\n'+insert('executable-sh')+'SQL\n')},
 {name:'03-plain.sql',mode:0o644,bytes:Buffer.from(insert('plain-sql'))},
 {name:'04-gzip.sql.gz',mode:0o644,bytes:gzipSync(insert('gzip-sql'))},
 {name:'05-xz.sql.xz',mode:0o644,bytes:Buffer.from('/Td6WFoAAATm1rRGAgAhARYAAAB0L+Wj4ACbAIldACSThquuutc4n4SBW1Sukl40GRKd0IwQBlSK4cNXLZt43CL8ywzUJZ93uVoxbG1/Trp15i/YPa0svUbslwtmmvuzL4oKKIILCNmjwiIR1ajvw+Znid0bw5ftXGQ41GCLFf7vSAdasDvrpUUFumbtuK4o9Yjdb0IEAPdW+ToXREJRirol0mXnx54AAAAAACZhgc2xoUQSAAGlAZwBAAAbSbBBscRn+wIAAAAABFla','base64')},
 {name:'06-zstd.sql.zst',mode:0o644,bytes:zstdCompressSync(Buffer.from(insert('zstd-sql')))}
];}

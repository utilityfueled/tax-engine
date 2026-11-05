import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { request } from 'node:http';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const hex64 = /^[a-f0-9]{64}$/u, hex40 = /^[a-f0-9]{40}$/u;
const maxBody = 1024 * 1024, maxProof = 8 * 1024 * 1024;
const hash = (kind, bytes) => createHash(kind).update(bytes).digest('hex');
const need = (ok, message) => { if (!ok) throw Error(message); };
const same = isDeepStrictEqual;
const gitObject = (kind, body) => hash('sha1', Buffer.concat([Buffer.from(`${kind} ${body.length}\0`), body]));
const id = value => typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/u.test(value) ? value.replace(/^sha256:/u, '') : null;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const metadata = s => ({dev:s.dev, ino:s.ino, uid:s.uid, mode:s.mode, nlink:s.nlink});
const publicPath = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value) && value.split('/').every(v => v && v !== '.' && v !== '..' && !['.git','.local','node_modules'].includes(v) && (!v.startsWith('.env') || /^\.env\.[a-z.-]*example$/u.test(v)));

/** Explicit operator mode only. The sidecar never grants operator authority. */
export function nativeAdmission(env, external) {
    if (env.TAX_ENGINE_NATIVE_BROWSER_RUNTIME === undefined) {
        need(env.TAX_ENGINE_NATIVE_BROWSER_PROOF_SHA256 === undefined, 'Native proof without native mode');
        return false;
    }
    need(env.TAX_ENGINE_NATIVE_BROWSER_RUNTIME === 'true' && external && env.GITHUB_ACTIONS !== 'true' && env.PLAYWRIGHT_BASE_URL === 'http://127.0.0.1:3109' && hex64.test(env.TAX_ENGINE_NATIVE_BROWSER_PROOF_SHA256 ?? ''), 'Invalid explicit native runtime mode');
    return true;
}

/** @typedef {import('node:events').EventEmitter & {statusCode?:number, headers:Record<string,string|string[]|undefined>, complete:boolean, destroy:()=>unknown}} RelayResponse */
/** @typedef {import('node:events').EventEmitter & {end:()=>unknown, destroy:()=>unknown}} RelayRequest */
/** @typedef {(options:object, callback:(response:RelayResponse)=>void)=>RelayRequest} RelayTransport */
/** Only these two bounded read-only routes exist; no command/URL/path input.
 * @param {string} socketPath
 * @param {string} kind
 * @param {string} objectId
 * @param {AbortSignal | undefined} signal
 * @param {RelayTransport} transport
 * @returns {Promise<object>}
 */
export function relayJson(socketPath, kind, objectId, signal, transport = request) {
    need(kind === 'containers' || kind === 'images', 'Invalid native inspection kind');
    need(hex64.test(objectId), 'Invalid native inspection identity');
    need(/^\/private\/tmp\/tax-ze-[a-f0-9]{32}\/api\.sock$/u.test(socketPath), 'Invalid native relay path');
    return new Promise((resolve, reject) => {
        let req, response, timer, finished = false, bytes = 0;
        const chunks = [];
        const done = (error, value) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            response?.destroy();
            req?.destroy();
            if (error) reject(Error('Native read-only inspection unavailable')); else resolve(value);
        };
        const abort = () => done(true);
        if (signal?.aborted) { done(true); return; }
        signal?.addEventListener('abort', abort, {once:true});
        timer = setTimeout(() => done(true), 2500);
        try {
            req = transport({socketPath, method:'GET', path:`/${kind}/${objectId}/json`, agent:false, headers:{Accept:'application/json'}}, res => {
                response = res;
                res.on('error', () => done(true));
                if (finished) {res.destroy(); return;}
                if (res.statusCode !== 200 || (res.headers['content-length'] !== undefined && (!/^\d+$/u.test(String(res.headers['content-length'])) || Number(res.headers['content-length']) > maxBody))) {done(true); return;}
                res.on('data', chunk => {
                    if (finished) return;
                    const b = Buffer.from(chunk); bytes += b.length;
                    if (bytes > maxBody) {done(true); return;}
                    chunks.push(b);
                });
                res.on('end', () => {
                    if (finished) return;
                    try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); need(value && typeof value === 'object' && !Array.isArray(value), 'Invalid response'); done(false,value); }
                    catch {done(true);}
                });
                res.on('aborted', () => done(true));
                res.on('close', () => {if (!res.complete) done(true);});
            });
            req.on('error', () => done(true));
            if (finished) req.destroy(); else req.end();
        } catch {done(true);}
    });
}

/** Git tree from literal tracked blobs/modes; no Git process or .git access. */
export function sourceTree(entries) {
    need(Array.isArray(entries) && entries.length > 0 && entries.length <= 20000, 'Invalid tracked source inventory');
    const root = new Map(); let previous = '', total = 0;
    for (const entry of entries) {
        need(entry && same(Object.keys(entry).sort(),['bytes','mode','oid','path']) && publicPath(entry.path) && entry.path > previous && ['100644','100755','120000'].includes(entry.mode) && hex40.test(entry.oid) && integer(entry.bytes) && entry.bytes <= 64 * 1024 * 1024, 'Invalid tracked source entry');
        previous = entry.path; total += entry.bytes;
        need(total <= 512 * 1024 * 1024, 'Tracked source exceeds finite bound');
        const parts = entry.path.split('/'); let current = root;
        for (const part of parts.slice(0,-1)) {
            if (!current.has(part)) current.set(part,{mode:'40000',children:new Map()});
            need(current.get(part).children, 'Conflicting tracked source paths');
            current = current.get(part).children;
        }
        const name = parts.at(-1); need(!current.has(name), 'Conflicting tracked source paths');
        current.set(name,{mode:entry.mode,oid:entry.oid});
    }
    const tree = nodes => {
        const rows = [...nodes].sort(([a,av],[b,bv]) => Buffer.compare(Buffer.from(a+(av.children?'/':'')),Buffer.from(b+(bv.children?'/':''))));
        return gitObject('tree',Buffer.concat(rows.map(([name,node]) => Buffer.concat([Buffer.from(`${node.mode} ${name}\0`),Buffer.from(node.children?tree(node.children):node.oid,'hex')]))));
    };
    return tree(root);
}

async function noSymlinkParents(target, io) {
    const parts = path.resolve(target).split(path.sep).filter(Boolean); let current = path.parse(target).root;
    for (const part of parts) {
        current = path.join(current,part); const s = await io.lstat(current);
        need(s.isDirectory() && !s.isSymbolicLink() && await io.realpath(current) === current, 'Native path parent changed');
    }
}
const runtimeDirectory = name => name.split('/').includes('node_modules') || ['apps/web/.next','apps/web/test-results','apps/web/playwright-report'].some(p => name === p || name.startsWith(p+'/'));
async function census(root, io) {
    const files = []; let nodes = 0;
    const walk = async dir => {
        for (const entry of await io.readdir(path.join(root,dir),{withFileTypes:true})) {
            need(++nodes <= 40000, 'Unbounded source census');
            const name = dir ? `${dir}/${entry.name}` : entry.name;
            if (runtimeDirectory(name)) {need(entry.isDirectory() && !entry.isSymbolicLink(), 'Unsafe generated source directory'); continue;}
            need(publicPath(name), 'Untracked or unsafe native source path');
            if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(name);
            else {need(entry.isFile() || entry.isSymbolicLink(), 'Special native source node'); files.push(name);}
        }
    };
    await walk(''); return files.sort();
}

/** Default reader rejects symlinks and changes across open/read/close. */
async function boundedRead(file, limit) {
    const before = await fs.lstat(file);
    need(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= limit, 'Unsafe native evidence file');
    const handle = await fs.open(file,constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const opened = await handle.stat();
        need(same(metadata(before),metadata(opened)) && before.size === opened.size, 'Native evidence replaced');
        const buffer = Buffer.alloc(limit+1); let count = 0;
        while (count < buffer.length) {const r = await handle.read(buffer,count,buffer.length-count,null); if (!r.bytesRead) break; count += r.bytesRead;}
        const after = await handle.stat();
        need(count <= limit && count === before.size && same(metadata(after),metadata(opened)) && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'Native evidence changed');
        return buffer.subarray(0,count);
    } finally {await handle.close();}
}
const actualIo = {lstat:fs.lstat,realpath:fs.realpath,readdir:fs.readdir,readlink:fs.readlink,read:boundedRead,uid:()=>process.getuid?.(),get:relayJson};

/** @typedef {{dev:number,ino:number,uid:number,mode:number,nlink:number,isDirectory:()=>boolean,isFile:()=>boolean,isSymbolicLink:()=>boolean,isSocket:()=>boolean}} NativeStat */
/** @typedef {{name:string,isDirectory:()=>boolean,isFile:()=>boolean,isSymbolicLink:()=>boolean}} NativeDirent */
/** @typedef {{uid:()=>number|undefined,lstat:(name:string)=>Promise<NativeStat>,realpath:(name:string)=>Promise<string>,readdir:(name:string,options:{withFileTypes:true})=>Promise<NativeDirent[]>,read:(name:string,limit:number)=>Promise<Buffer>,readlink:(name:string)=>Promise<string>,get:(socket:string,kind:string,id:string,signal?:AbortSignal)=>Promise<object>}} NativeIo */
/** Config custody is operator trust, not independent process/authorization proof.
 * @param {{root:string,env:Record<string,string|undefined>,signal?:AbortSignal}} options
 * @param {NativeIo} io
 */
export async function createNativeInspector({root, env, signal}, io = actualIo) {
    need(nativeAdmission(env,true), 'Explicit native mode required');
    const proofSha256 = env.TAX_ENGINE_NATIVE_BROWSER_PROOF_SHA256;
    const uid = io.uid(); need(integer(uid), 'Native POSIX ownership unavailable');
    need(path.isAbsolute(root) && path.basename(root) === 'source' && await io.realpath(root) === root, 'Native source must be fixed fresh export');
    const parent = path.dirname(root), proofPath = path.join(parent,'native-browser-provenance.json');
    await noSymlinkParents(root,io);
    const parentStat = await io.lstat(parent), rootStat = await io.lstat(root);
    need(parentStat.uid === uid && (parentStat.mode & 0o777) === 0o700 && rootStat.uid === uid && (rootStat.mode & 0o777) === 0o700, 'Native export ownership changed');
    const proofStat = await io.lstat(proofPath);
    need(proofStat.isFile() && !proofStat.isSymbolicLink() && proofStat.uid === uid && (proofStat.mode & 0o777) === 0o600 && proofStat.nlink === 1, 'Unsafe native operator sidecar');
    const bytes = await io.read(proofPath,maxProof);
    need(bytes.length <= maxProof && hash('sha256',bytes) === proofSha256, 'Native operator sidecar binding changed');
    const p = JSON.parse(bytes.toString('utf8'));
    need(same(Object.keys(p).sort(),['commit','commitBody','containerId','enabled','imageId','inventory','operation','socket','tree','version'].sort()) && p.version === 1 && p.enabled === true && /^[a-f0-9]{32}$/u.test(p.operation) && path.basename(parent) === `tax-ze-${p.operation}` && hex40.test(p.commit) && hex40.test(p.tree) && hex64.test(p.containerId) && hex64.test(p.imageId), 'Invalid native operator binding');
    need(typeof p.commitBody === 'string' && Buffer.byteLength(p.commitBody) <= 65536 && p.commitBody.startsWith(`tree ${p.tree}\n`) && gitObject('commit',Buffer.from(p.commitBody)) === p.commit && sourceTree(p.inventory) === p.tree, 'Native Git source binding changed');
    need(same(Object.keys(p.socket).sort(),['dev','ino','uid','mode','nlink'].sort()) && Object.values(p.socket).every(integer), 'Invalid native socket binding');
    const socketParent = `/private/tmp/tax-ze-${p.operation}`, socketPath = `${socketParent}/api.sock`;
    const proofIdentity = metadata(proofStat), directoryIdentity = metadata(parentStat), rootIdentity = metadata(rootStat);
    let initialSocketParent = null;
    const custody = async () => {
        need(!signal?.aborted, 'Native inspection cancelled');
        await noSymlinkParents(root,io); await noSymlinkParents(socketParent,io);
        need(same(metadata(await io.lstat(parent)),directoryIdentity) && same(metadata(await io.lstat(root)),rootIdentity), 'Native export custody changed');
        const s = await io.lstat(socketPath), d = await io.lstat(socketParent);
        need(d.uid === uid && (d.mode & 0o777) === 0o700, 'Native relay parent ownership changed');
        if (initialSocketParent === null) initialSocketParent = metadata(d);
        need(same(metadata(d),initialSocketParent) && s.isSocket() && !s.isSymbolicLink() && s.uid === uid && (s.mode & 0o777) === 0o600 && s.nlink === 1 && same(metadata(s),p.socket), 'Native relay identity changed');
        const current = await io.lstat(proofPath);
        need(current.isFile() && !current.isSymbolicLink() && same(metadata(current),proofIdentity) && hash('sha256',await io.read(proofPath,maxProof)) === proofSha256, 'Native operator sidecar changed');
        need(same(await census(root,io),p.inventory.map(v=>v.path)), 'Native tracked source census changed');
        for (const entry of p.inventory) {
            need(!signal?.aborted, 'Native inspection cancelled');
            const file = path.join(root,entry.path), s = await io.lstat(file);
            need(s.uid === uid && s.nlink === 1, 'Native source ownership changed');
            let content;
            if (entry.mode === '120000') {
                need(s.isSymbolicLink(), 'Native source symlink changed');
                content = Buffer.from(await io.readlink(file));
                const destination = path.resolve(path.dirname(file),content.toString('utf8'));
                need(destination.startsWith(root+path.sep) && await io.realpath(file) === destination, 'Native source symlink escapes or chains');
            } else {
                need(s.isFile() && !s.isSymbolicLink() && ((s.mode & 0o111) ? '100755':'100644') === entry.mode, 'Native source mode changed');
                content = await io.read(file,Math.min(64*1024*1024,entry.bytes));
            }
            need(content.length === entry.bytes && gitObject('blob',content) === entry.oid, 'Native tracked source bytes changed');
        }
    };
    const inspect = async () => {
        await custody();
        const container = await io.get(socketPath,'containers',p.containerId,signal);
        const image = await io.get(socketPath,'images',p.imageId,signal);
        need(container && image && id(container.Id) === p.containerId && id(container.Image) === p.imageId && id(image.Id) === p.imageId && container.Name === `/tax-ze-${p.operation}-full` && container.State?.Running === true && container.State?.Status === 'running', 'Native running container changed');
        need(image.Os === 'linux' && image.Architecture === 'arm64' && image.Config?.User === 'appuser' && container.Config?.User === image.Config.User && same(image.Config.Cmd,['node','apps/web/server.js']) && same(container.Config.Cmd,image.Config.Cmd) && same(container.Config.Entrypoint,image.Config.Entrypoint), 'Native image runtime changed');
        need(image.Config.Labels?.['org.opencontainers.image.revision'] === p.commit && container.Config.Labels?.['org.opencontainers.image.revision'] === p.commit && container.Config.Labels?.['io.vivalatax.native-browser.operation'] === p.operation, 'Native source or operation label changed');
        const h = container.HostConfig;
        need(h?.ReadonlyRootfs === true && h.Privileged === false && (h.CapAdd === null || same(h.CapAdd,[])) && Array.isArray(h.CapDrop) && h.CapDrop.includes('ALL') && h.CapDrop.every(v=>typeof v==='string') && Array.isArray(h.SecurityOpt) && h.SecurityOpt.some(v=>v==='no-new-privileges'||v==='no-new-privileges:true') && (h.Binds === null || same(h.Binds,[])), 'Native container hardening changed');
        const tmpfs = {'/tmp':['noexec','nosuid','rw','size=64m'], '/app/apps/web/.next/cache':['mode=1777','nodev','noexec','nosuid','rw','size=64m']};
        need(h.Tmpfs && same(Object.keys(h.Tmpfs).sort(),Object.keys(tmpfs).sort()) && Object.entries(tmpfs).every(([name,flags])=>typeof h.Tmpfs[name]==='string' && same(h.Tmpfs[name].replace('size=67108864','size=64m').split(',').sort(),flags)), 'Native tmpfs layout changed');
        const ports = {'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'3109'}]};
        need(same(h.PortBindings,ports) && same(container.NetworkSettings?.Ports,ports), 'Native localhost port binding changed');
        need(Array.isArray(container.Mounts) && container.Mounts.every(m=>m.Type==='tmpfs' && ['/tmp','/app/apps/web/.next/cache'].includes(m.Destination)), 'Native external mount changed');
        const envMap = rows => {need(Array.isArray(rows),'Native runtime environment missing'); const m=new Map(); for(const value of rows){need(typeof value==='string'&&value.includes('='),'Invalid native runtime environment');const split=value.indexOf('='),key=value.slice(0,split);need(!m.has(key),'Duplicate native runtime environment');m.set(key,value.slice(split+1));}return m;};
        const expectedEnv = envMap(image.Config.Env), actualEnv = envMap(container.Config.Env);
        expectedEnv.set('TAX_ENGINE_DEPLOYMENT_MODE','self-host'); expectedEnv.set('TAX_ENGINE_APP_URL','http://127.0.0.1:3109');
        need(same([...expectedEnv].sort(),[...actualEnv].sort()),'Native runtime environment changed');
        need(Array.isArray(image.RootFS?.Layers) && image.RootFS.Layers.length>0 && image.RootFS.Layers.every(v=>/^sha256:[a-f0-9]{64}$/u.test(v)), 'Native image layers unavailable');
        await custody();
        return {mode:'operator-owned-native',operation:p.operation,containerId:p.containerId,imageId:`sha256:${p.imageId}`,commit:p.commit,tree:p.tree,proofSha256,socket:p.socket};
    };
    return inspect;
}

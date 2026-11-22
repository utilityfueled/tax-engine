#!/usr/bin/env python3
"""Verify exported image content identity without extracting or invoking a daemon."""
import base64
import hashlib
import json
import re
import sys
import tarfile
from pathlib import Path

INDEX = {'application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json'}
MANIFEST = {'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'}
CONFIG = {'application/vnd.oci.image.config.v1+json', 'application/vnd.docker.container.image.v1+json'}
MAX_JSON = 16 * 1024 * 1024

def unique(pairs):
    result = dict(pairs)
    assert len(result) == len(pairs), 'duplicate JSON key'
    return result

def parse(data):
    return json.loads(data, object_pairs_hook=unique)

def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()

def valid_digest(value):
    assert isinstance(value, str) and re.fullmatch(r'sha256:[a-f0-9]{64}', value)
    return value

def verify(archive, candidate, revision, architecture='amd64'):
    assert architecture in ('amd64', 'arm64')
    allowed_variants = (None, '', 'v8') if architecture == 'arm64' else (None, '')
    [expected] = parse(Path(candidate).read_bytes())
    target = valid_digest(expected['Id'])
    assert re.fullmatch(r'[a-f0-9]{40}', revision)
    assert expected['Os'] == 'linux' and expected['Architecture'] == architecture
    assert expected['Config']['Labels']['org.opencontainers.image.revision'] == revision
    assert expected['RootFS']['Type'] == 'layers' and len(expected['RootFS']['Layers']) > 0
    archive_sha = hashlib.sha256()
    with Path(archive).open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            archive_sha.update(chunk)
    assert 0 < Path(archive).stat().st_size <= 1024 ** 3
    with tarfile.open(archive, 'r:') as tar:
        members = {}
        total = 0
        for count, member in enumerate(tar, 1):
            name = member.name
            assert count <= 20000 and name not in members
            assert not name.startswith('/') and all(p not in ('', '.', '..') for p in name.rstrip('/').split('/'))
            assert member.isfile() or member.isdir()
            assert member.size >= 0
            total += member.size
            assert total <= 1024 ** 3
            members[name] = member
        def read(name, limit=MAX_JSON):
            m = members[name]
            assert m.isfile() and 0 < m.size <= limit
            with tar.extractfile(m) as stream:
                body = stream.read(limit + 1)
            assert len(body) == m.size
            return body
        def blob(desc, json_body=True):
            d = valid_digest(desc['digest'])
            assert type(desc['size']) is int and 0 < desc['size'] <= (MAX_JSON if json_body else 1024 ** 3)
            m = members['blobs/sha256/' + d[7:]]
            assert m.isfile() and m.size == desc['size']
            h = hashlib.sha256()
            content = bytearray()
            with tar.extractfile(m) as stream:
                while part := stream.read(1024 * 1024):
                    h.update(part)
                    if json_body:
                        content.extend(part)
            assert 'sha256:' + h.hexdigest() == d
            return bytes(content)
        descriptor = expected.get('Descriptor')
        target_body = manifest_body = None
        selected = None
        if descriptor and descriptor['mediaType'] in INDEX | MANIFEST:
            assert descriptor['digest'] == target
            target_body = blob(descriptor)
            document = parse(target_body)
            assert document['schemaVersion'] == 2 and document['mediaType'] == descriptor['mediaType']
            if descriptor['mediaType'] in INDEX:
                native = []
                attestations = []
                assert isinstance(document['manifests'], list) and 0 < len(document['manifests']) <= 64
                for entry in document['manifests']:
                    assert entry['mediaType'] in MANIFEST
                    blob(entry)
                    platform = entry['platform']
                    assert all(isinstance(platform.get(k), str) and 0 < len(platform[k]) <= 64 for k in ('os', 'architecture'))
                    if platform.get('os') == 'linux' and platform.get('architecture') == architecture:
                        assert platform.get('variant') in allowed_variants
                        native.append(entry)
                    else:
                        if 'unknown' in (platform['os'], platform['architecture']):
                            assert (platform['os'], platform['architecture']) == ('unknown', 'unknown')
                            assert entry.get('annotations', {}).get('vnd.docker.reference.type') == 'attestation-manifest'
                            attestations.append(entry)
                assert len(native) == 1, 'native manifest must be unique'
                selected = native[0]
                assert all(e['annotations'].get('vnd.docker.reference.digest') == selected['digest'] for e in attestations)
                manifest_body = blob(selected)
            else:
                selected = descriptor
                manifest_body = target_body
            manifest = parse(manifest_body)
            assert manifest['schemaVersion'] == 2 and manifest['mediaType'] == selected['mediaType']
            assert manifest['config']['mediaType'] in CONFIG
            raw_config = blob(manifest['config'])
            config_digest = manifest['config']['digest']
            assert isinstance(manifest['layers'], list) and len(manifest['layers']) == len(expected['RootFS']['Layers'])
            for layer in manifest['layers']:
                assert layer['mediaType'] in {'application/vnd.oci.image.layer.v1.tar', 'application/vnd.oci.image.layer.v1.tar+gzip', 'application/vnd.oci.image.layer.v1.tar+zstd', 'application/vnd.docker.image.rootfs.diff.tar', 'application/vnd.docker.image.rootfs.diff.tar.gzip'}
                blob(layer, False)
        else:
            # Legacy Docker archives address the exact config digest directly.
            assert descriptor is None or (descriptor.get('digest') == target and descriptor.get('mediaType') in CONFIG)
            [entry] = parse(read('manifest.json'))
            raw_config = read(entry['Config'])
            config_digest = digest(raw_config)
            assert config_digest == target
            assert descriptor is None or descriptor['size'] == len(raw_config)
            assert len(entry['Layers']) == len(expected['RootFS']['Layers'])
            for layer in entry['Layers']:
                assert layer in members and members[layer].isfile()
        config = parse(raw_config)
        assert digest(raw_config) == config_digest
        assert config['os'] == 'linux' and config['architecture'] == architecture
        assert config.get('variant') in allowed_variants
        assert config['rootfs']['type'] == expected['RootFS']['Type'] == 'layers'
        assert config['rootfs']['diff_ids'] == expected['RootFS']['Layers']
        for field in ('User', 'Cmd', 'Entrypoint', 'Env', 'Labels'):
            assert config['config'].get(field) == expected['Config'].get(field), field
        assert config['config']['Labels']['org.opencontainers.image.revision'] == revision
    return {'version': 1, 'source': revision, 'platform': 'linux/' + architecture, 'targetDigest': target,
            'configDigest': config_digest, 'manifestDigest': selected['digest'] if selected else None,
            'targetMediaType': descriptor['mediaType'] if descriptor else None,
            'targetBytes': base64.b64encode(target_body).decode() if target_body else None,
            'manifestBytes': base64.b64encode(manifest_body).decode() if manifest_body else None,
            'archiveSha256': archive_sha.hexdigest(), 'candidateSha256': hashlib.sha256(Path(candidate).read_bytes()).hexdigest(),
            'chainVerified': True}

if __name__ == '__main__':
    assert len(sys.argv) in (5, 6)
    result = verify(*sys.argv[1:4], architecture=sys.argv[5] if len(sys.argv) == 6 else 'amd64')
    with Path(sys.argv[4]).open('x') as output:
        json.dump(result, output, indent=2)
        output.write('\n')

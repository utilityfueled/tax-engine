import { describe, expect, it, vi } from 'vitest';
import { uploadPersistedWorkspaceDocuments } from '../../../apps/web/src/lib/workspace-persistence';

// spec/federal/hosted-upload-request-limits.yaml. A platform rejection can be
// plaintext or HTML and occurs before the application JSON route is invoked.
const SAFE_ERROR = 'This document is too large for this hosted upload. Please choose a file no larger than 4 MiB and try again.';
const PRIVATE = 'SYNTHETIC_PRIVATE_PLATFORM_BODY';
function file(size = 8) {
  const bytes = new Uint8Array(size);
  return { name: 'synthetic.png', type: 'image/png', size, async arrayBuffer() { return bytes.buffer; } };
}
const uploads = [{ documentId: 'synthetic-doc', uploadedAt: '2026-11-03T20:00:00.000Z', file: file() }];

describe('hosted upload non-JSON response safety through the existing client', () => {
  it.each([
    ['plaintext', `FUNCTION_PAYLOAD_TOO_LARGE ${PRIVATE}`, 'text/plain'],
    ['HTML', `<html><body>${PRIVATE}</body></html>`, 'text/html']
  ])('handles platform non-JSON 413 without exposing body %s', async (_name, body, type) => {
    const response = new Response(body, { status: 413, headers: { 'content-type': type } });
    const json = vi.spyOn(response, 'json');
    const text = vi.spyOn(response, 'text');
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
    await expect(uploadPersistedWorkspaceDocuments({ deploymentMode: 'hosted', workspaceId: 'synthetic-workspace', uploads, fetchFn: async () => response })).rejects.toThrow(SAFE_ERROR);
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('preserves an existing structured safe upload error', async () => {
    const message = 'Server configuration error: the document storage backend is not fully set up. Please contact the administrator.';
    await expect(uploadPersistedWorkspaceDocuments({ deploymentMode: 'hosted', workspaceId: 'synthetic-workspace', uploads,
      fetchFn: async () => new Response(JSON.stringify({ error: message }), { status: 503, headers: { 'content-type': 'application/json' } })
    })).rejects.toThrow(message);
  });

  it('preserves a successful document metadata response', async () => {
    const document = { blobKey: 'synthetic-blob', workspaceId: 'synthetic-workspace', documentId: 'synthetic-doc', fileName: 'synthetic.png', mediaType: 'image/png', size: 8, uploadedAt: '2026-11-03T20:00:00.000Z' };
    const result = await uploadPersistedWorkspaceDocuments({ deploymentMode: 'hosted', workspaceId: 'synthetic-workspace', uploads,
      fetchFn: async () => new Response(JSON.stringify({ availability: 'ready', ownerScope: { ownerId: 'synthetic-owner', ownerLabel: 'Synthetic owner', scopeKey: 'hosted-owner:synthetic-owner' }, document }), { headers: { 'content-type': 'application/json' } })
    });
    expect(result.documents).toEqual([document]);
    expect(result.adapter.availability).toBe('ready');
  });

  it('keeps self-host local uploads above 4 MiB free of hosted fetch calls', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const result = await uploadPersistedWorkspaceDocuments({ deploymentMode: 'self-host', workspaceId: 'synthetic-workspace', uploads: [{ documentId: 'synthetic-local', file: file(4 * 1024 * 1024 + 1) }], fetchFn });
    expect(result.documents).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

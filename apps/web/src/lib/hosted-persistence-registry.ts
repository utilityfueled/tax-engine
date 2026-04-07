import type {
  HostedDocumentBlobStoreFactory,
  HostedWorkspaceStoreFactory
} from "./workspace-persistence";

type HostedPersistenceRegistry = typeof globalThis & {
  __tax_engine_hosted_workspace_store_factory__?: HostedWorkspaceStoreFactory;
  __tax_engine_hosted_document_blob_store_factory__?: HostedDocumentBlobStoreFactory;
};

function getHostedPersistenceRegistry(): HostedPersistenceRegistry {
  return globalThis as HostedPersistenceRegistry;
}

export function getRegisteredHostedWorkspaceStoreFactory(): HostedWorkspaceStoreFactory | null {
  return getHostedPersistenceRegistry().__tax_engine_hosted_workspace_store_factory__ ?? null;
}

export function registerHostedWorkspaceStoreFactory(
  factory: HostedWorkspaceStoreFactory | null
) {
  const registry = getHostedPersistenceRegistry();

  if (factory) {
    registry.__tax_engine_hosted_workspace_store_factory__ = factory;
    return;
  }

  delete registry.__tax_engine_hosted_workspace_store_factory__;
}

export function getRegisteredHostedDocumentBlobStoreFactory(): HostedDocumentBlobStoreFactory | null {
  return getHostedPersistenceRegistry().__tax_engine_hosted_document_blob_store_factory__ ?? null;
}

export function registerHostedDocumentBlobStoreFactory(
  factory: HostedDocumentBlobStoreFactory | null
) {
  const registry = getHostedPersistenceRegistry();

  if (factory) {
    registry.__tax_engine_hosted_document_blob_store_factory__ = factory;
    return;
  }

  delete registry.__tax_engine_hosted_document_blob_store_factory__;
}

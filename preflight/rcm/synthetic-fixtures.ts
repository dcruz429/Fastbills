/** Fabricated metadata ONLY. Not an exporter, migration, or target attestation. */
import { BASE_PREREQUISITES, EXPECTED_RCM_TABLES } from "./expected-schema";
import type { CatalogSnapshot, Identity } from "./catalog-compare";
export function syntheticIdentity(): Identity {
  return {
    format: "rcm-development-identity/v1", targetEnvironment: "DEVELOPMENT",
    projectRef: "synthetic-project", providerAccountRef: "synthetic-account", canonicalDatabaseRef: "synthetic-dev",
    runtimeBindingResourceRef: "synthetic-dev", toolingBindingResourceRef: "synthetic-dev",
    otherEnvironments: [
      { environment: "STAGING", status: "identified", providerAccountRef: "synthetic-account", canonicalDatabaseRef: "synthetic-stage" },
      { environment: "PRODUCTION", status: "identified", providerAccountRef: "synthetic-account", canonicalDatabaseRef: "synthetic-prod" },
    ],
    environmentOwnerApprovalRef: "synthetic-NOT-AN-APPROVAL", metadataExportApprovalRef: "synthetic-NOT-AN-EXPORT-APPROVAL",
    releaseCommit: "eb734d0452acf9da246df4182b3a6b9583ad2366",
  };
}
export function syntheticSnapshot(): CatalogSnapshot {
  const identity = syntheticIdentity();
  return {
    format: "rcm-development-catalog/v1", targetEnvironment: "DEVELOPMENT",
    providerAccountRef: identity.providerAccountRef, canonicalDatabaseRef: identity.canonicalDatabaseRef,
    metadataExportApprovalRef: identity.metadataExportApprovalRef!, releaseCommit: identity.releaseCommit,
    completeness: "all-owned-tables-and-required-base-metadata",
    tables: structuredClone([
      ...EXPECTED_RCM_TABLES,
      ...BASE_PREREQUISITES.map(base => ({
        ...EXPECTED_RCM_TABLES[0], name: base.name, columns: base.columns, primaryKey: base.primaryKey,
        foreignKeys: base.foreignKeys, indexes: [], checks: [],
      })),
    ]),
  };
}

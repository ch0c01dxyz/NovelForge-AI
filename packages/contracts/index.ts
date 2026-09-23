/**
 * @novelforge/contracts — typed cross-package contracts.
 *
 * Contracts are data/types only: no business logic, no HTTP/UI/provider
 * imports (ADR-0001). This package is a leaf — it imports nothing from the
 * workspace.
 */
export {
  DOMAIN_EVENT_NAMES,
  domainEventSchema,
  type DomainEvent,
  type DomainEventName,
} from "./events";

export {
  DOMAIN_PACKAGES,
  MODULE_BOUNDARIES,
  PROVIDER_ADJACENT_PACKAGE,
  mayImport,
  type ModuleBoundary,
  type PackageKind,
} from "./boundaries";

# Security & Safety Engineering

-   Server-side authentication and authorization.
-   Workspace/novel tenant isolation.
-   RBAC for author/editor/admin where applicable.
-   Encrypt OmniRoute credentials at rest; store references rather than
    plaintext in ordinary config.
-   Never expose gateway secrets to browser clients.
-   Never log Authorization headers/secrets.
-   Validate all API input.
-   Rate-limit sensitive and generation endpoints.
-   CSRF/session protections according to chosen auth strategy.
-   File type/size validation for imports.
-   Prompt-injection boundary: references are data, not system
    authority.
-   Agent tools have explicit allowlists.
-   Audit sensitive mutations and admin operations.
-   Backup PostgreSQL and object storage; test restore procedures.
-   Simulation branches and AI proposals cannot bypass canonical
    authorization.

## Workflow and evidence boundaries

Reauthorize queued/resumed mutations and approval decisions against current
membership/capabilities. Pin target/source versions; stale approval cannot
authorize changed text or state. Duplicate delivery cannot duplicate mutation.
Mandatory checkpoint failure and blocking invariant failure refuse writes.

Use [MODEL-EVIDENCE-POLICY](../06-ai/MODEL-EVIDENCE-POLICY.md) for source
validation, hostile references, unsupported claims and fabricated citations.
Schema validity and model agreement are not factual/authorization proofs.
Prevent public leakage through search/cache/download/citation paths as well
as chapter routes. Test non-member reading without weakening author APIs.
Technical/security findings use the single issues register with redacted
evidence; private novel content and credentials must not enter public receipts.

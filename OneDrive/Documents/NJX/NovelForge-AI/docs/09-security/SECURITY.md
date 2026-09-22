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

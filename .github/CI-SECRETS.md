# Retired GitHub Actions credential guide

The previous deployed-auth setup instructions are retired. Do not provision the old legacy-PIN credentials or point a manual workflow at a production or shared database. EFCC has no legacy accounts to import, and Auth provider/session work is deferred to [issue #639](https://github.com/Noahlw/efcc/issues/639).

The workflow files remain temporarily because the `main` ruleset still requires the `Fast CI` status. Their removal and the required-status update must be completed together. Use local `pnpm verify` for repository machine readiness; it does not prove deployment readiness.

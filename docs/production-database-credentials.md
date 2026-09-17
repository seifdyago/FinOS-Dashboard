# FinOS Production Database Credential Handoff

The FinOS Production PostgreSQL connection string is a secret and must not be committed to Git, stored in project source, or included in public documentation.

## Source of truth

The authoritative `DATABASE_URL` must be obtained from the provider and project that currently contains the live FinOS Production data, including the FinOS organization, users, Platform Admin records, account applications, approvals, and subscriptions. Do not substitute a Replit Development/legacy connection string unless the project owner verifies that it is the live Production database.

## Runtime configuration

Configure the secret only in the Vercel project’s **Production** environment as `DATABASE_URL`. Redeploy after changing the variable. Keep Preview and Development values separate from Production.

## Verification checklist

An authorized operator should verify the provider/project identity in the provider dashboard, then confirm the deployed `/api/healthz` endpoint reports `{"status":"ok","database":"ok"}`. After that, verify that the expected FinOS organization and Platform Admin account are present without modifying, resetting, migrating, or deleting data.

Never place the complete URL, password, token, or any secret value in GitHub, source files, issue comments, deployment logs, screenshots, or chat. Store the credential in the project owner’s private password manager or secure note and grant access only through the provider’s approved access controls.

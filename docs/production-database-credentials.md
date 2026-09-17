# FinOS Production Database Credential Handoff

The official FinOS Production PostgreSQL database is the existing Neon project **FinOS Production** (`empty-unit-50986726`), using its existing **production branch**. The Replit database is not Production, and the former Vercel database is not the Production source of truth.

The Production PostgreSQL connection string is a secret and must not be committed to Git, stored in project source, or included in public documentation.

## Source of truth

The authoritative `DATABASE_URL` is managed by the Neon FinOS Production project and is configured in the Vercel project’s **Production** environment. It must point to the existing Neon Production branch and database. Do not substitute a Replit Development/legacy connection string.

## Runtime configuration

Configure the secret only in Vercel’s **Production** environment as `DATABASE_URL`, then redeploy. Keep Preview and Development values separate from Production. GitHub does not need direct access to Neon, and Neon Auth is not used by FinOS.

## Verification checklist

An authorized operator should verify the provider/project identity in Neon, then confirm the deployed `/api/healthz` endpoint reports `{"status":"ok","database":"ok"}`. After that, verify that the expected FinOS organization and Platform Admin account are present without modifying, resetting, migrating, or deleting data.

Never place the complete URL, password, token, or any secret value in GitHub, source files, issue comments, deployment logs, screenshots, or chat. Store the credential in the project owner’s private password manager or secure note and grant access only through the provider’s approved access controls.

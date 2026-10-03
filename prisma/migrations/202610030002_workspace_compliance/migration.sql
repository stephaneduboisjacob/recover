ALTER TABLE "Workspace" ADD COLUMN "businessAddress" TEXT;
ALTER TABLE "OAuthState" ADD COLUMN "details" JSONB NOT NULL DEFAULT '{}';

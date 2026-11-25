import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
const productionCompose = readFileSync(
	new URL("../docker-compose.prod.yml", import.meta.url),
	"utf8",
);
const caddyfile = readFileSync(new URL("../Caddyfile", import.meta.url), "utf8");

test("container production defaults disable local preview exposure and require an API URL", () => {
	assert.match(dockerfile, /^ARG NEXT_PUBLIC_PONYO_API_BASE_URL$/m);
	assert.match(dockerfile, /^ARG NEXT_PUBLIC_ADMIN_PORTAL_HOST=admin\.byponyo\.com$/m);
	assert.match(dockerfile, /^ARG NEXT_PUBLIC_SUPPLIER_PORTAL_HOST=suppliers\.byponyo\.com$/m);
	assert.match(dockerfile, /^ARG PONYO_LOCAL_PREVIEW=false$/m);
	assert.match(dockerfile, /^ARG PONYO_DEV_API_PROXY=false$/m);
	assert.match(dockerfile, /^ARG PONYO_ALLOW_CLOUDFLARE_QUICK_TUNNEL=false$/m);
	assert.match(dockerfile, /RUN test -n "\$NEXT_PUBLIC_PONYO_API_BASE_URL"/);
});

test("local Compose explicitly enables its preview-only proxy and tunnel", () => {
	assert.match(compose, /NEXT_PUBLIC_PONYO_API_BASE_URL: \/ponyo-api/);
	assert.match(compose, /PONYO_LOCAL_PREVIEW: "true"/);
	assert.match(compose, /PONYO_DEV_API_PROXY: "true"/);
	assert.match(compose, /PONYO_ALLOW_CLOUDFLARE_QUICK_TUNNEL: "true"/);
});

test("production Compose keeps app services private and disables preview features", () => {
	assert.match(productionCompose, /NEXT_PUBLIC_PONYO_API_BASE_URL: https:\/\/\$\{API_DOMAIN/);
	assert.match(productionCompose, /NEXT_PUBLIC_ADMIN_PORTAL_HOST: \$\{ADMIN_DOMAIN/);
	assert.match(productionCompose, /NEXT_PUBLIC_SUPPLIER_PORTAL_HOST: \$\{SUPPLIER_DOMAIN/);
	assert.match(productionCompose, /FRONTEND_ORIGINS: "https:\/\/\$\{SITE_DOMAIN.*\$\{ADMIN_DOMAIN.*\$\{SUPPLIER_DOMAIN/);
	assert.match(productionCompose, /PONYO_LOCAL_PREVIEW: "false"/);
	assert.match(productionCompose, /PONYO_DEV_API_PROXY: "false"/);
	assert.match(productionCompose, /PONYO_ALLOW_CLOUDFLARE_QUICK_TUNNEL: "false"/);
	assert.match(productionCompose, /"80:80"/);
	assert.match(productionCompose, /"443:443"/);
	assert.doesNotMatch(productionCompose, /"3000:3000"|"8000:8000"|"6379:6379"|"5000:5000"/);
	assert.doesNotMatch(productionCompose, /cloudflare\/cloudflared|app\.seed|POSTGRES_PASSWORD/);
	assert.match(productionCompose, /REDIS_URL: redis:\/\/redis:6379\/0/);
	assert.match(productionCompose, /env_file:\s*\n\s+- \.\/backend\/\.env\.prod/);
});

test("Caddy serves the configured storefront and API domains over automatic HTTPS", () => {
	assert.match(caddyfile, /\{\$SITE_DOMAIN\}/);
	assert.match(caddyfile, /\{\$ADMIN_DOMAIN\}/);
	assert.match(caddyfile, /\{\$SUPPLIER_DOMAIN\}/);
	assert.match(caddyfile, /\{\$API_DOMAIN\}/);
	assert.match(caddyfile, /reverse_proxy frontend:3000/);
	assert.match(caddyfile, /reverse_proxy api:8000/);
});

## Set global build ENV
ARG NODEJS_VERSION="24"

## Base image for all building stages
FROM node:${NODEJS_VERSION}-slim AS base

ARG USE_CN_MIRROR

ENV DEBIAN_FRONTEND="noninteractive"

RUN set -e && \
    if [ "${USE_CN_MIRROR:-false}" = "true" ]; then \
        sed -i "s/deb.debian.org/mirrors.ustc.edu.cn/g" "/etc/apt/sources.list.d/debian.sources"; \
    fi && \
    apt update && \
    apt install ca-certificates proxychains-ng -qy && \
    mkdir -p /distroless/bin /distroless/etc /distroless/etc/ssl/certs /distroless/lib && \
    cp /usr/lib/$(arch)-linux-gnu/libproxychains.so.4 /distroless/lib/libproxychains.so.4 && \
    cp /usr/lib/$(arch)-linux-gnu/libdl.so.2 /distroless/lib/libdl.so.2 && \
    cp /usr/bin/proxychains4 /distroless/bin/proxychains && \
    cp /etc/proxychains4.conf /distroless/etc/proxychains4.conf && \
    cp /usr/lib/$(arch)-linux-gnu/libstdc++.so.6 /distroless/lib/libstdc++.so.6 && \
    cp /usr/lib/$(arch)-linux-gnu/libgcc_s.so.1 /distroless/lib/libgcc_s.so.1 && \
    cp /usr/lib/$(arch)-linux-gnu/librt.so.1 /distroless/lib/librt.so.1 && \
    cp /usr/local/bin/node /distroless/bin/node && \
    cp /etc/ssl/certs/ca-certificates.crt /distroless/etc/ssl/certs/ca-certificates.crt && \
    rm -rf /tmp/* /var/lib/apt/lists/* /var/tmp/*

## Builder image, install all the dependencies and build the app
FROM base AS builder

ARG USE_CN_MIRROR
ARG NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ANALYTICS_POSTHOG
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_ANALYTICS_UMAMI
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG FEATURE_FLAGS

ENV NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH}" \
    FEATURE_FLAGS="${FEATURE_FLAGS}"

ENV APP_URL="http://app.com" \
    DATABASE_DRIVER="node" \
    DATABASE_URL="postgres://postgres:password@localhost:5432/postgres" \
    KEY_VAULTS_SECRET="use-for-build" \
    AUTH_SECRET="4oBcgQm9reSLx+8a/bqNTcDXJCFusdTO6INtiUKgTZM=" \
    BETTER_AUTH_SECRET="4oBcgQm9reSLx+8a/bqNTcDXJCFusdTO6INtiUKgTZM="

# Sentry
ENV NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN}" \
    SENTRY_ORG="" \
    SENTRY_PROJECT=""

# Posthog
ENV NEXT_PUBLIC_ANALYTICS_POSTHOG="${NEXT_PUBLIC_ANALYTICS_POSTHOG}" \
    NEXT_PUBLIC_POSTHOG_HOST="${NEXT_PUBLIC_POSTHOG_HOST}" \
    NEXT_PUBLIC_POSTHOG_KEY="${NEXT_PUBLIC_POSTHOG_KEY}"

# Umami
ENV NEXT_PUBLIC_ANALYTICS_UMAMI="${NEXT_PUBLIC_ANALYTICS_UMAMI}" \
    NEXT_PUBLIC_UMAMI_SCRIPT_URL="${NEXT_PUBLIC_UMAMI_SCRIPT_URL}" \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID="${NEXT_PUBLIC_UMAMI_WEBSITE_ID}"

# Node
ENV NODE_OPTIONS="--max-old-space-size=8192"

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY .npmrc ./
COPY packages ./packages
COPY patches ./patches
# bring in desktop workspace manifest so pnpm can resolve it
COPY apps/desktop/src/main/package.json ./apps/desktop/src/main/package.json

RUN set -e && \
if [ "${USE_CN_MIRROR:-false}" = "true" ]; then \
export SENTRYCLI_CDNURL="https://npmmirror.com/mirrors/sentry-cli"; \
npm config set registry "https://registry.npmmirror.com/"; \
echo 'canvas_binary_host_mirror=https://npmmirror.com/mirrors/canvas' >> .npmrc; \
fi && \
export COREPACK_NPM_REGISTRY=$(npm config get registry | sed 's/\/$//') && \
npm i -g pnpm@10.33.0 && \
pnpm i && \
mkdir -p /deps && \
cd /deps && \
node -e "require('fs').writeFileSync('package.json', JSON.stringify({name:'deps',version:'1.0.0'}))" && \
pnpm add pg drizzle-orm

# Install sharp linux-x64 native binaries for cross-platform Docker deployment
# pnpm only installs binaries for the build platform (e.g. darwin-arm64 on macOS), 
# but Docker runs on linux-x64, so we need these explicitly
RUN cd /deps && \
npm init -y --scope=sharp-fix 2>/dev/null && \
npm install --ignore-scripts @img/sharp-linux-x64@0.34.5 @img/sharp-libvips-linux-x64@1.2.4 --legacy-peer-deps && \
mkdir -p /sharp-linux-x64/@img/sharp-linux-x64 /sharp-linux-x64/@img/sharp-libvips-linux-x64 && \
cp -r /deps/node_modules/@img/sharp-linux-x64/* /sharp-linux-x64/@img/sharp-linux-x64/ && \
cp -r /deps/node_modules/@img/sharp-libvips-linux-x64/* /sharp-linux-x64/@img/sharp-libvips-linux-x64/ && \
rm -rf /deps/node_modules/@img/sharp-linux-x64 /deps/node_modules/@img/sharp-libvips-linux-x64 /deps/package.json /deps/package-lock.json

# Install @napi-rs/canvas linux-x64-gnu native binaries for cross-platform Docker deployment
# pdfjs-dist 5.x requires DOMMatrix from @napi-rs/canvas at module initialization
# Without these binaries, PDF text extraction fails in Docker containers
RUN cd /deps && \
npm init -y --scope=canvas-fix 2>/dev/null && \
npm install --ignore-scripts @napi-rs/canvas-linux-x64-gnu@0.1.100 --legacy-peer-deps && \
mkdir -p /canvas-linux-x64/@napi-rs/canvas-linux-x64-gnu && \
cp -r /deps/node_modules/@napi-rs/canvas-linux-x64-gnu/* /canvas-linux-x64/@napi-rs/canvas-linux-x64-gnu/ && \
rm -rf /deps/node_modules/@napi-rs/canvas-linux-x64-gnu /deps/package.json /deps/package-lock.json

COPY . .

# Prebuild: env checks (checkDeprecatedAuth, checkRequiredEnvVars, printEnvInfo) then remove desktop-only code
RUN pnpm exec tsx scripts/dockerPrebuild.mts
RUN rm -rf src/app/desktop "src/app/(backend)/trpc/desktop"

# run build standalone for docker version
RUN npm run build:docker

# Fix Turbopack ESM bug in auth route: async ESM route modules get wrongly wrapped under `default`
# The compiled route.js uses __turbopack_esm__({default: ...}) which doesn't export GET/POST
# Replace with module.exports = R.m(moduleId).exports which correctly exposes the handlers
RUN AUTH_ROUTE="$(find /app/.next/server/app -path '*/api/auth/\[...all\]/route.js' | head -1)" && \
if [ -n "$AUTH_ROUTE" ]; then \
  echo "Patching Turbopack auth route: $AUTH_ROUTE" && \
  LAST_LINE="$(tail -1 "$AUTH_ROUTE")" && \
  if echo "$LAST_LINE" | grep -q '__turbopack_esm__'; then \
    MODULE_ID="$(echo "$LAST_LINE" | grep -oP 'R\.m\(\K[0-9]+')" && \
    if [ -n "$MODULE_ID" ]; then \
      sed -i "\$s/.*/R.m($MODULE_ID) module.exports=R.m($MODULE_ID).exports/" "$AUTH_ROUTE" && \
      echo "Auth route patched: replaced __turbopack_esm__ with module.exports" ; \
    else \
      echo "WARNING: Could not extract module ID from auth route" ; \
    fi ; \
  else \
    echo "Auth route already patched or does not need patching" ; \
  fi ; \
else \
  echo "WARNING: Auth route file not found" ; \
fi

## Application image, copy all the files for production
FROM busybox:latest AS app

COPY --from=base /distroless/ /

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone /app/
COPY --from=builder /app/.next/static /app/.next/static
# Copy SPA assets (Vite build output)
COPY --from=builder /app/public/_spa /app/public/_spa
# Copy database migrations
COPY --from=builder /app/packages/database/migrations /app/migrations
COPY --from=builder /app/scripts/migrateServerDB/docker.cjs /app/docker.cjs
COPY --from=builder /app/scripts/migrateServerDB/errorHint.js /app/errorHint.js

# copy dependencies
COPY --from=builder /deps/node_modules/.pnpm /app/node_modules/.pnpm
COPY --from=builder /deps/node_modules/pg /app/node_modules/pg
COPY --from=builder /deps/node_modules/drizzle-orm /app/node_modules/drizzle-orm

# Copy sharp linux-x64 native binaries (cross-platform: built on macOS, runs on linux)
# First, copy to flat node_modules/@img/ (for fallback resolution)
COPY --from=builder /sharp-linux-x64/@img/sharp-linux-x64 /app/node_modules/@img/sharp-linux-x64
COPY --from=builder /sharp-linux-x64/@img/sharp-libvips-linux-x64 /app/node_modules/@img/sharp-libvips-linux-x64
# Then, install into pnpm's hoisted structure so Turbopack/Next.js can resolve them
# pnpm resolves @img/sharp-linux-x64 from sharp@0.34.5/node_modules/@img/
# and from .pnpm/node_modules/@img/
RUN set -e && \
    SHARP_VER="0.34.5" && \
    LIBVIPS_VER="1.2.4" && \
    # Copy entire @img packages to pnpm structure recursively (handles lib/, package.json, etc.)
    mkdir -p "/app/node_modules/.pnpm/@img+sharp-linux-x64@${SHARP_VER}/node_modules/@img" && \
    cp -r /app/node_modules/@img/sharp-linux-x64 \
      "/app/node_modules/.pnpm/@img+sharp-linux-x64@${SHARP_VER}/node_modules/@img/" && \
    mkdir -p "/app/node_modules/.pnpm/@img+sharp-libvips-linux-x64@${LIBVIPS_VER}/node_modules/@img" && \
    cp -r /app/node_modules/@img/sharp-libvips-linux-x64 \
      "/app/node_modules/.pnpm/@img+sharp-libvips-linux-x64@${LIBVIPS_VER}/node_modules/@img/" && \
    # Create symlinks in sharp@0.34.5/node_modules/@img/ (pnpm hoisted resolution)
    SHARP_DIR="/app/node_modules/.pnpm/sharp@${SHARP_VER}/node_modules/@img" && \
    if [ -d "$SHARP_DIR" ]; then \
      ln -sf "../../../@img+sharp-linux-x64@${SHARP_VER}/node_modules/@img/sharp-linux-x64" "$SHARP_DIR/sharp-linux-x64" && \
      ln -sf "../../../@img+sharp-libvips-linux-x64@${LIBVIPS_VER}/node_modules/@img/sharp-libvips-linux-x64" "$SHARP_DIR/sharp-libvips-linux-x64"; \
    fi && \
    # Create symlinks in .pnpm/node_modules/@img/ (Turbopack resolution path)
    PNPM_IMG_DIR="/app/node_modules/.pnpm/node_modules/@img" && \
    if [ -d "$PNPM_IMG_DIR" ]; then \
      ln -sf "../../@img+sharp-linux-x64@${SHARP_VER}/node_modules/@img/sharp-linux-x64" "$PNPM_IMG_DIR/sharp-linux-x64" && \
      ln -sf "../../@img+sharp-libvips-linux-x64@${LIBVIPS_VER}/node_modules/@img/sharp-libvips-linux-x64" "$PNPM_IMG_DIR/sharp-libvips-linux-x64"; \
    fi && \
    echo "Sharp linux-x64 binaries installed successfully"

# Copy @napi-rs/canvas linux-x64-gnu native binaries (cross-platform: built on macOS, runs on linux)
# Required by pdfjs-dist 5.x for DOMMatrix polyfill — without it, PDF text extraction fails
# First, copy to flat node_modules/@napi-rs/ (for fallback resolution)
COPY --from=builder /canvas-linux-x64/@napi-rs/canvas-linux-x64-gnu /app/node_modules/@napi-rs/canvas-linux-x64-gnu
# Then, install into pnpm's hoisted structure so the module resolver can find them
RUN set -e && \
CANVAS_VER="0.1.100" && \
# Copy to pnpm structure (handles .node binary, package.json, etc.)
mkdir -p "/app/node_modules/.pnpm/@napi-rs+canvas-linux-x64-gnu@${CANVAS_VER}/node_modules/@napi-rs" && \
cp -r /app/node_modules/@napi-rs/canvas-linux-x64-gnu \
"/app/node_modules/.pnpm/@napi-rs+canvas-linux-x64-gnu@${CANVAS_VER}/node_modules/@napi-rs/" && \
# Create symlinks in canvas@0.1.100/node_modules/@napi-rs/ (pnpm hoisted resolution)
CANVAS_DIR="/app/node_modules/.pnpm/@napi-rs+canvas@${CANVAS_VER}/node_modules/@napi-rs" && \
if [ -d "$CANVAS_DIR" ]; then \
ln -sf "../../../@napi-rs+canvas-linux-x64-gnu@${CANVAS_VER}/node_modules/@napi-rs/canvas-linux-x64-gnu" "$CANVAS_DIR/canvas-linux-x64-gnu"; \
fi && \
# Create symlinks in .pnpm/node_modules/@napi-rs/ (fallback resolution path)
PNPM_NAPI_DIR="/app/node_modules/.pnpm/node_modules/@napi-rs" && \
if [ -d "$PNPM_NAPI_DIR" ]; then \
ln -sf "../../@napi-rs+canvas-linux-x64-gnu@${CANVAS_VER}/node_modules/@napi-rs/canvas-linux-x64-gnu" "$PNPM_NAPI_DIR/canvas-linux-x64-gnu"; \
fi && \
echo "@napi-rs/canvas linux-x64-gnu binaries installed successfully"

# Copy server launcher and shared scripts
COPY --from=builder /app/scripts/serverLauncher/startServer.js /app/startServer.js
COPY --from=builder /app/scripts/_shared /app/scripts/_shared

RUN set -e && \
    addgroup -S -g 1001 nodejs && \
    adduser -D -G nodejs -H -S -h /app -u 1001 nextjs && \
    chown -R nextjs:nodejs /app /etc/proxychains4.conf

## Production image, copy all the files and run next
FROM scratch

# Copy all the files from app, set the correct permission for prerender cache
COPY --from=app / /

ENV NODE_ENV="production" \
NODE_OPTIONS="--dns-result-order=ipv4first --use-openssl-ca" \
NODE_EXTRA_CA_CERTS="" \
NODE_TLS_REJECT_UNAUTHORIZED="" \
SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt" \
LD_LIBRARY_PATH="/app/node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.2.4/node_modules/@img/sharp-libvips-linux-x64/lib"

# Make the middleware rewrite through local as default
# refs: https://github.com/lobehub/lobehub/issues/5876
ENV MIDDLEWARE_REWRITE_THROUGH_LOCAL="1"

# set hostname to localhost
ENV HOSTNAME="0.0.0.0" \
    PORT="3210"

# General Variables
ENV APP_URL="" \
    API_KEY_SELECT_MODE="" \
    DEFAULT_AGENT_CONFIG="" \
    SYSTEM_AGENT="" \
    FEATURE_FLAGS="" \
    PROXY_URL=""

# Database
ENV KEY_VAULTS_SECRET="" \
    DATABASE_DRIVER="node" \
    DATABASE_URL=""

# Better Auth
ENV AUTH_SECRET="" \
    AUTH_SSO_PROVIDERS="" \
    AUTH_ALLOWED_EMAILS="" \
    AUTH_TRUSTED_ORIGINS="" \
    AUTH_DISABLE_EMAIL_PASSWORD="" \
    AUTH_EMAIL_VERIFICATION="" \
    AUTH_ENABLE_MAGIC_LINK="" \
    # Google
    AUTH_GOOGLE_ID="" \
    AUTH_GOOGLE_SECRET="" \
    # GitHub
    AUTH_GITHUB_ID="" \
    AUTH_GITHUB_SECRET="" \
    # Microsoft
    AUTH_MICROSOFT_ID="" \
    AUTH_MICROSOFT_SECRET="" \
    AUTH_MICROSOFT_AUTHORITY_URL="" \
    AUTH_MICROSOFT_TENANT_ID=""

# Redis
ENV REDIS_URL="" \
    REDIS_PREFIX="" \
    REDIS_TLS=""

# Email
ENV EMAIL_SERVICE_PROVIDER="" \
    SMTP_HOST="" \
    SMTP_PORT="" \
    SMTP_SECURE="" \
    SMTP_USER="" \
    SMTP_PASS="" \
    SMTP_FROM="" \
    RESEND_API_KEY="" \
    RESEND_FROM=""

# S3
ENV NEXT_PUBLIC_S3_DOMAIN="" \
    S3_PUBLIC_DOMAIN="" \
    S3_ACCESS_KEY_ID="" \
    S3_BUCKET="" \
    S3_ENDPOINT="" \
    S3_SECRET_ACCESS_KEY="" \
    S3_ENABLE_PATH_STYLE="" \
    S3_SET_ACL=""

# Model Variables
ENV \
    # AI21
    AI21_API_KEY="" AI21_MODEL_LIST="" \
    # Ai360
    AI360_API_KEY="" AI360_MODEL_LIST="" \
    # AiHubMix
    AIHUBMIX_API_KEY="" AIHUBMIX_MODEL_LIST="" \
    # Anthropic
    ANTHROPIC_API_KEY="" ANTHROPIC_MODEL_LIST="" ANTHROPIC_PROXY_URL="" \
    # Amazon Bedrock
    ENABLED_AWS_BEDROCK="" AWS_ACCESS_KEY_ID="" AWS_SECRET_ACCESS_KEY="" AWS_REGION="" AWS_BEDROCK_MODEL_LIST="" \
    # Azure OpenAI
    AZURE_API_KEY="" AZURE_API_VERSION="" AZURE_ENDPOINT="" AZURE_MODEL_LIST="" \
    # Baichuan
    BAICHUAN_API_KEY="" BAICHUAN_MODEL_LIST="" \
    # Cloudflare
    CLOUDFLARE_API_KEY="" CLOUDFLARE_BASE_URL_OR_ACCOUNT_ID="" CLOUDFLARE_MODEL_LIST="" \
    # Cohere
    COHERE_API_KEY="" COHERE_MODEL_LIST="" COHERE_PROXY_URL="" \
    # ComfyUI
    ENABLED_COMFYUI="" COMFYUI_BASE_URL="" COMFYUI_AUTH_TYPE="" \
    COMFYUI_API_KEY="" COMFYUI_USERNAME="" COMFYUI_PASSWORD="" COMFYUI_CUSTOM_HEADERS="" \
    # DeepSeek
    DEEPSEEK_API_KEY="" DEEPSEEK_MODEL_LIST="" \
    # Fireworks AI
    FIREWORKSAI_API_KEY="" FIREWORKSAI_MODEL_LIST="" \
    # Gitee AI
    GITEE_AI_API_KEY="" GITEE_AI_MODEL_LIST="" \
    # GitHub
    GITHUB_TOKEN="" GITHUB_MODEL_LIST="" \
    # Google
    GOOGLE_API_KEY="" GOOGLE_MODEL_LIST="" GOOGLE_PROXY_URL="" \
    # Vertex AI
    VERTEXAI_CREDENTIALS="" VERTEXAI_PROJECT="" VERTEXAI_LOCATION="" VERTEXAI_MODEL_LIST="" \
    # Groq
    GROQ_API_KEY="" GROQ_MODEL_LIST="" GROQ_PROXY_URL="" \
    # Higress
    HIGRESS_API_KEY="" HIGRESS_MODEL_LIST="" HIGRESS_PROXY_URL="" \
    # HuggingFace
    HUGGINGFACE_API_KEY="" HUGGINGFACE_MODEL_LIST="" HUGGINGFACE_PROXY_URL="" \
    # Hunyuan
    HUNYUAN_API_KEY="" HUNYUAN_MODEL_LIST="" \
    # InternLM
    INTERNLM_API_KEY="" INTERNLM_MODEL_LIST="" \
    # Jina
    JINA_API_KEY="" JINA_MODEL_LIST="" JINA_PROXY_URL="" \
    # Minimax
    MINIMAX_API_KEY="" MINIMAX_MODEL_LIST="" \
    # Mistral
    MISTRAL_API_KEY="" MISTRAL_MODEL_LIST="" \
    # ModelScope
    MODELSCOPE_API_KEY="" MODELSCOPE_MODEL_LIST="" MODELSCOPE_PROXY_URL="" \
    # Moonshot
    MOONSHOT_API_KEY="" MOONSHOT_MODEL_LIST="" MOONSHOT_PROXY_URL="" \
    # Nebius
    NEBIUS_API_KEY="" NEBIUS_MODEL_LIST="" NEBIUS_PROXY_URL="" \
    # NewAPI
    NEWAPI_API_KEY="" NEWAPI_PROXY_URL="" \
    # Novita
    NOVITA_API_KEY="" NOVITA_MODEL_LIST="" \
    # Nvidia NIM
    NVIDIA_API_KEY="" NVIDIA_MODEL_LIST="" NVIDIA_PROXY_URL="" \
    # Ollama
    ENABLED_OLLAMA="" OLLAMA_MODEL_LIST="" OLLAMA_PROXY_URL="" \
    # OpenAI
    ENABLED_OPENAI="" OPENAI_API_KEY="" OPENAI_MODEL_LIST="" OPENAI_PROXY_URL="" \
    # OpenRouter
    OPENROUTER_API_KEY="" OPENROUTER_MODEL_LIST="" \
    # Perplexity
    PERPLEXITY_API_KEY="" PERPLEXITY_MODEL_LIST="" PERPLEXITY_PROXY_URL="" \
    # PPIO
    PPIO_API_KEY="" PPIO_MODEL_LIST="" \
    # Qiniu
    QINIU_API_KEY="" QINIU_MODEL_LIST="" QINIU_PROXY_URL="" \
    # Qwen
    QWEN_API_KEY="" QWEN_MODEL_LIST="" QWEN_PROXY_URL="" \
    # SambaNova
    SAMBANOVA_API_KEY="" SAMBANOVA_MODEL_LIST="" \
    # Search1API
    SEARCH1API_API_KEY="" SEARCH1API_MODEL_LIST="" \
    # SenseNova
    SENSENOVA_API_KEY="" SENSENOVA_MODEL_LIST="" \
    # SiliconCloud
    SILICONCLOUD_API_KEY="" SILICONCLOUD_MODEL_LIST="" SILICONCLOUD_PROXY_URL="" \
    # Spark
    SPARK_API_KEY="" SPARK_MODEL_LIST="" SPARK_PROXY_URL="" SPARK_SEARCH_MODE="" \
    # Stepfun
    STEPFUN_API_KEY="" STEPFUN_MODEL_LIST="" \
    # Taichu
    TAICHU_API_KEY="" TAICHU_MODEL_LIST="" \
    # TogetherAI
    TOGETHERAI_API_KEY="" TOGETHERAI_MODEL_LIST="" \
    # Upstage
    UPSTAGE_API_KEY="" UPSTAGE_MODEL_LIST="" \
    # v0 (Vercel)
    V0_API_KEY="" V0_MODEL_LIST="" \
    # vLLM
    VLLM_API_KEY="" VLLM_MODEL_LIST="" VLLM_PROXY_URL="" \
    # Wenxin
    WENXIN_API_KEY="" WENXIN_MODEL_LIST="" \
    # xAI
    XAI_API_KEY="" XAI_MODEL_LIST="" XAI_PROXY_URL="" \
    # Xinference
    XINFERENCE_API_KEY="" XINFERENCE_MODEL_LIST="" XINFERENCE_PROXY_URL="" \
    # 01.AI
    ZEROONE_API_KEY="" ZEROONE_MODEL_LIST="" \
    # Zhipu
    ZHIPU_API_KEY="" ZHIPU_MODEL_LIST="" \
    # Tencent Cloud
    TENCENT_CLOUD_API_KEY="" TENCENT_CLOUD_MODEL_LIST="" \
    # Infini-AI
    INFINIAI_API_KEY="" INFINIAI_MODEL_LIST="" \
    # 302.AI
    AI302_API_KEY="" AI302_MODEL_LIST="" \
    # FAL
    ENABLED_FAL="" FAL_API_KEY="" FAL_MODEL_LIST="" \
    # BFL
    BFL_API_KEY="" BFL_MODEL_LIST="" \
    # Vercel AI Gateway
    VERCELAIGATEWAY_API_KEY="" VERCELAIGATEWAY_MODEL_LIST="" \
    # Cerebras
    CEREBRAS_API_KEY="" CEREBRAS_MODEL_LIST=""

USER nextjs

EXPOSE 3210/tcp

ENTRYPOINT ["/bin/node"]

CMD ["/app/startServer.js"]

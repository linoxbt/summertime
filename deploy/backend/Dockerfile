# Summertime backend: the ledger (Canton sequencer, mediator and participant), the dev token
# registry, the API and the worker in one container. The ledger stores its state in Postgres
# (canton_* databases on the DATABASE_URL server), so it survives restarts and redeploys.
# Build from the repository root:
#   docker build -f deploy/backend/Dockerfile .

# ---- Stage 1: compile the Daml package and take the Canton jar from the Daml SDK
FROM eclipse-temurin:21-jdk-jammy AS daml
ARG DAML_SDK_VERSION=3.7.1
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar gzip unzip \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://get.digitalasset.com/install/install.sh | sh -s "$DAML_SDK_VERSION"
ENV PATH=/root/.dpm/bin:$PATH
WORKDIR /src
COPY daml ./daml
RUN cd daml && dpm build --all \
 && mkdir -p /out \
 && cp summertime-core/.daml/dist/summertime-core-0.1.0.dar dars/splice-test-token-v1-1.0.2.dar /out/ \
 && cp /root/.dpm/cache/components/canton-open-source/*/lib/canton-open-source-*.jar /out/canton.jar

# ---- Stage 2: Node 22 + Java 21 runtime
FROM node:22-bookworm-slim
COPY --from=eclipse-temurin:21-jre-jammy /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Manifests first so the dependency layer is cached. Only backend workspaces are installed.
COPY package.json package-lock.json tsconfig.base.json ./
COPY web/package.json web/package.json
COPY packages/ledger/package.json packages/ledger/package.json
COPY packages/platform/package.json packages/platform/package.json
COPY services/api/package.json services/api/package.json
COPY services/worker/package.json services/worker/package.json
COPY services/dev-registry/package.json services/dev-registry/package.json
RUN npm ci --no-audit --no-fund \
      -w @summertime/ledger -w @summertime/platform \
      -w @summertime/api -w @summertime/worker -w @summertime/dev-registry \
 && npm cache clean --force

COPY packages packages
COPY services services
COPY --from=daml /out /opt/summertime
COPY deploy/backend /app/deploy/backend
RUN chmod +x /app/deploy/backend/start.sh

ENV NODE_ENV=production \
    DEMO_MODE=true \
    PROGRESS_INTERVAL_SECONDS=15 \
    OPS_INTERVAL_SECONDS=15 \
    PORT=8080
EXPOSE 8080
CMD ["/app/deploy/backend/start.sh"]

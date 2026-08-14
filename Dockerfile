# Star Trek Adventure — production image
# Single Node process: API + static bridge UI + media

FROM node:22-bookworm-slim

WORKDIR /app

# Install production deps first (better layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (no node_modules / data)
COPY tsconfig.json ./
COPY server ./server
COPY apps ./apps
COPY packages ./packages
COPY content ./content

# tsx is a devDependency but we need it to run TypeScript in container
RUN npm install tsx@4.19.3 --no-save

# Writable data dirs (Cloud Run ephemeral unless GCS is wired later)
RUN mkdir -p data/saves data/debug data/media/portraits data/media/viewscreen data/media/tts \
  && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
# Cloud Run sets PORT; keep 8080 as default

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/ai/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "server/src/index.ts"]

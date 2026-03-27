# agent-docs Docusaurus static site
# Expects pre-built static files in build/ (run sync + docusaurus build first)
FROM nginx:alpine

LABEL org.opencontainers.image.source="https://github.com/dadavidtseng/AGENTS"
LABEL org.opencontainers.image.description="AGENTS Documentation Site"

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy pre-built Astro/Starlight output
COPY dist/ /usr/share/nginx/html/

# SPA fallback — serve index.html for client-side routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

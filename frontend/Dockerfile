# Setup the Multi-stage build for the frontend to use a builder to compile React/TypeScript code into static files
# and stage 2 as a server to use Nginx to serve the static files

# --- Stage 1: Builder (Node.js) ---
FROM node:20-alpine AS builder

WORKDIR /app 

# Copy package files first (for Docker layer caching)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci 

# Copy the rest of the source code 
COPY . .

# Build the static site (creates /app/dist)
RUN npm run build

# --- Stage 2: Serve (Nginx) ---
FROM nginx:alpine 

# Copy the build output from the builder stage to Nginx's web root
COPY --from=builder /app/dist /usr/share/nginx/html

# (Optional) Copy custom nginx config if we need to handle React Router paths
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose the port (documentation only)
EXPOSE 80

# Command to run Nginx
CMD ["nginx", "-g", "daemon off;"]  
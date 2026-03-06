FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build-time public envs (Next substitui em build para código client)
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Build-time server envs (usado por next.config.ts durante o build)
ARG API_INTERNAL_BASE_URL
ENV API_INTERNAL_BASE_URL=$API_INTERNAL_BASE_URL

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

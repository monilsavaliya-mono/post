FROM node:20-slim

# Install Python, pip, ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp --break-system-packages

# Set working directory
WORKDIR /app

# Copy and install node deps
COPY package*.json ./
RUN npm install

# Copy bot code
COPY . .

# Create temp folder
RUN mkdir -p temp

# Start bot
CMD ["node", "index.js"]

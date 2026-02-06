FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Vite default port is usually 5173, but we can configure it to 3000 for frontend
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

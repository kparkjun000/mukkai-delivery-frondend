import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV,
    distExists: fs.existsSync(path.join(__dirname, 'dist'))
  });
});

// Proxy API requests to backend (CORS 문제 해결)
const API_TARGET = 'https://mukkai-backend-api-f9dc2d5aad02.herokuapp.com';

app.use('/api', createProxyMiddleware({
  target: API_TARGET,
  changeOrigin: true,
  secure: true,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔗 Proxying API request: ${req.method} ${req.originalUrl} -> ${API_TARGET}${req.url}`);
    // Content-Type 헤더 명시적 설정
    if (req.body && req.method === 'POST') {
      proxyReq.setHeader('Content-Type', 'application/json');
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ Proxy response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy error' });
  }
}));

app.use('/open-api', createProxyMiddleware({
  target: API_TARGET,
  changeOrigin: true,
  secure: true,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔗 Proxying Open-API request: ${req.method} ${req.originalUrl} -> ${API_TARGET}${req.url}`);
    console.log('📋 Request headers:', req.headers);
    console.log('📝 Request body:', req.body);
    
    // JSON 요청인 경우 body를 문자열로 변환하여 전송
    if (req.body && req.method === 'POST') {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ Proxy response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
    console.log('📋 Response headers:', proxyRes.headers);
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}));

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  console.log(`Serving ${req.path} -> ${indexPath}`);
  res.sendFile(indexPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, 'dist')}`);
  console.log(`🌍 Accessible at: http://0.0.0.0:${PORT}`);
});
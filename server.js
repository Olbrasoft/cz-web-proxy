const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;

// Czech proxy backend
const PROXY_BACKEND = 'http://proxy.unas.cz';

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cz-web-proxy',
    endpoints: {
      fetch: '/fetch?url=<encoded_url>',
      stream: '/stream?url=<encoded_url>',
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Proxy fetch endpoint
app.get('/fetch', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // PHP backend uses ?url= directly
    const backendUrl = `${PROXY_BACKEND}/?url=${encodeURIComponent(targetUrl)}`;
    console.log('Fetching from backend:', backendUrl);
    
    const response = await fetch(backendUrl);
    const text = await response.text();
    console.log('Backend response:', text.substring(0, 200));
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON from backend', raw: text.substring(0, 200) });
    }
    
    // Return the body from the proxy response
    if (data.success && data.body) {
      const contentType = data.contentType || 'text/plain';
      res.setHeader('Content-Type', contentType);
      res.send(data.body);
    } else {
      res.status(500).json({ error: data.error || 'Proxy error', details: data });
    }
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Proxy stream endpoint
app.get('/stream', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // PHP backend uses ?action=stream&url=
    const backendUrl = new URL(PROXY_BACKEND);
    backendUrl.searchParams.set('action', 'stream');
    backendUrl.searchParams.set('url', targetUrl);
    
    // Forward range header if present
    const rangeHeader = req.headers.range;
    
    const options = {
      hostname: backendUrl.hostname,
      port: backendUrl.port || 80,
      path: backendUrl.pathname + backendUrl.search,
      method: 'GET',
      headers: {}
    };

    if (rangeHeader) {
      options.headers['Range'] = rangeHeader;
    }

    const proxyReq = http.request(options, (proxyRes) => {
      // Forward status and headers
      res.status(proxyRes.statusCode);
      
      const headersToForward = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges'
      ];
      
      headersToForward.forEach(header => {
        if (proxyRes.headers[header]) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });

      // Pipe the response
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      res.status(500).json({ error: error.message });
    });

    proxyReq.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`CZ Web Proxy running on port ${PORT}`);
});

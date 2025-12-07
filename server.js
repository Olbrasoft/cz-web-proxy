const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 8080;

// Trust Azure's reverse proxy for X-Forwarded-* headers
app.set('trust proxy', true);

// Czech proxy backend
const PROXY_BACKEND = 'http://proxy.unas.cz';

/**
 * Get the proxy base URL with correct protocol
 */
function getProxyBase(req) {
  // Use X-Forwarded-Proto if available (Azure reverse proxy)
  const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'https';
  return `${protocol}://${req.get('host')}`;
}

/**
 * Resolve a URL relative to a base URL
 */
function resolveUrl(baseUrl, relativeUrl) {
  if (!relativeUrl || relativeUrl.startsWith('data:') || relativeUrl.startsWith('javascript:') || relativeUrl.startsWith('#')) {
    return null;
  }
  
  try {
    // Handle protocol-relative URLs
    if (relativeUrl.startsWith('//')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}${relativeUrl}`;
    }
    
    // Handle absolute URLs
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }
    
    // Handle root-relative and relative URLs
    return new URL(relativeUrl, baseUrl).href;
  } catch (e) {
    return null;
  }
}

/**
 * Create a proxied URL for a given target URL
 */
function createProxyUrl(targetUrl, proxyBase, endpoint = 'fetch') {
  if (!targetUrl) return null;
  return `${proxyBase}/${endpoint}?url=${encodeURIComponent(targetUrl)}`;
}

/**
 * Rewrite URLs in HTML content
 */
function rewriteHtml(html, baseUrl, proxyBase) {
  const $ = cheerio.load(html, { decodeEntities: false });
  
  // Attributes that contain URLs
  const urlAttributes = [
    { selector: '[href]', attr: 'href' },
    { selector: '[src]', attr: 'src' },
    { selector: '[action]', attr: 'action' },
    { selector: '[data-src]', attr: 'data-src' },
    { selector: '[data-href]', attr: 'data-href' },
    { selector: '[poster]', attr: 'poster' },
    { selector: '[data-lazy-src]', attr: 'data-lazy-src' },
    { selector: '[data-original]', attr: 'data-original' },
  ];
  
  urlAttributes.forEach(({ selector, attr }) => {
    $(selector).each((_, elem) => {
      const $elem = $(elem);
      const originalUrl = $elem.attr(attr);
      const resolvedUrl = resolveUrl(baseUrl, originalUrl);
      
      if (resolvedUrl) {
        // For links, use /fetch to maintain browsing context (all go through /fetch now)
        $elem.attr(attr, createProxyUrl(resolvedUrl, proxyBase, 'fetch'));
      }
    });
  });
  
  // Handle srcset attribute (responsive images)
  $('[srcset]').each((_, elem) => {
    const $elem = $(elem);
    const srcset = $elem.attr('srcset');
    if (srcset) {
      const rewrittenSrcset = srcset.split(',').map(entry => {
        const parts = entry.trim().split(/\s+/);
        if (parts.length >= 1) {
          const resolvedUrl = resolveUrl(baseUrl, parts[0]);
          if (resolvedUrl) {
            parts[0] = createProxyUrl(resolvedUrl, proxyBase, 'fetch');
          }
        }
        return parts.join(' ');
      }).join(', ');
      $elem.attr('srcset', rewrittenSrcset);
    }
  });
  
  // Rewrite inline styles with url()
  $('[style]').each((_, elem) => {
    const $elem = $(elem);
    const style = $elem.attr('style');
    if (style) {
      $elem.attr('style', rewriteCssUrls(style, baseUrl, proxyBase));
    }
  });
  
  // Rewrite <style> tags
  $('style').each((_, elem) => {
    const $elem = $(elem);
    const css = $elem.html();
    if (css) {
      $elem.html(rewriteCssUrls(css, baseUrl, proxyBase));
    }
  });
  
  // Remove existing base tags
  $('base').remove();
  
  return $.html();
}

/**
 * Rewrite URLs in CSS content
 */
function rewriteCssUrls(css, baseUrl, proxyBase) {
  // Rewrite url() declarations
  css = css.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/gi, (match, url) => {
    const resolvedUrl = resolveUrl(baseUrl, url.trim());
    if (resolvedUrl) {
      return `url('${createProxyUrl(resolvedUrl, proxyBase, 'fetch')}')`;
    }
    return match;
  });
  
  // Rewrite @import declarations
  css = css.replace(/@import\s+['"]([^'"]+)['"]|@import\s+url\(['"]?([^'"\)]+)['"]?\)/gi, (match, url1, url2) => {
    const url = url1 || url2;
    const resolvedUrl = resolveUrl(baseUrl, url?.trim());
    if (resolvedUrl) {
      return `@import url('${createProxyUrl(resolvedUrl, proxyBase, 'fetch')}')`;
    }
    return match;
  });
  
  return css;
}

/**
 * Determine content type from headers or URL
 */
function getContentCategory(contentType, url) {
  if (!contentType) {
    // Guess from URL extension
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    if (['css'].includes(ext)) return 'css';
    if (['html', 'htm'].includes(ext)) return 'html';
    return 'other';
  }
  
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    return 'html';
  }
  if (contentType.includes('text/css')) {
    return 'css';
  }
  return 'other';
}

/**
 * Common proxy handler for both /fetch and /browse
 */
async function handleProxyRequest(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const backendUrl = `${PROXY_BACKEND}/?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(backendUrl);
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON from backend', details: text.substring(0, 200) });
    }
    
    if (data.success && data.body) {
      const contentType = data.contentType || 'text/html';
      const proxyBase = getProxyBase(req);
      const contentCategory = getContentCategory(contentType, targetUrl);
      
      let body = data.body;
      
      // Rewrite URLs in HTML and CSS content
      if (contentCategory === 'html') {
        body = rewriteHtml(body, targetUrl, proxyBase);
      } else if (contentCategory === 'css') {
        body = rewriteCssUrls(body, targetUrl, proxyBase);
      }
      
      res.setHeader('Content-Type', contentType);
      res.send(body);
    } else {
      res.status(500).json({ error: data.error || 'Proxy error' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cz-web-proxy',
    version: '1.2.0',
    endpoints: {
      fetch: '/fetch?url=<encoded_url> - Proxy with full URL rewriting',
      browse: '/browse?url=<encoded_url> - Alias for /fetch',
      stream: '/stream?url=<encoded_url> - Binary streaming (video/audio)',
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Both /fetch and /browse now do full URL rewriting
app.get('/fetch', handleProxyRequest);
app.get('/browse', handleProxyRequest);

// Proxy stream endpoint (for binary streaming - video/audio)
app.get('/stream', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const backendUrl = new URL(PROXY_BACKEND);
    backendUrl.searchParams.set('action', 'stream');
    backendUrl.searchParams.set('url', targetUrl);
    
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
  console.log(`CZ Web Proxy v1.2.0 running on port ${PORT}`);
});

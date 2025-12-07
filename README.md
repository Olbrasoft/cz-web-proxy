# CZ Web Proxy

Universal Czech IP proxy for bypassing geo-restrictions on content that requires Czech IP address.

## Live Instance

**URL:** http://proxy.unas.cz

## Features

- **Fetch any URL** - Returns JSON with response body and headers
- **Stream binary content** - Video, audio, images with Range request support
- **Health check** - Verify proxy status and Czech IP
- **CORS enabled** - Full cross-origin support for browser requests

## API Usage

### Health Check
```
GET http://proxy.unas.cz/?action=health
```
Returns proxy status and Czech IP address.

### Fetch URL (JSON response)
```
GET http://proxy.unas.cz/?url=https://example.com
```

Returns JSON:
```json
{
  "success": true,
  "httpCode": 200,
  "finalUrl": "https://example.com",
  "contentType": "text/html",
  "headers": { ... },
  "body": "<html>..."
}
```

### Stream Binary Content
```
GET http://proxy.unas.cz/?action=stream&url=https://cdn.example.com/video.mp4
```
Streams the content directly with proper headers. Supports video seeking via Range requests.

## Use Cases

- Access Czech-only streaming services from abroad
- Bypass geo-restrictions on CDN content
- Test Czech IP-dependent APIs

## Deployment

1. Upload `index.php` to PHP hosting with Czech IP
2. Ensure `curl` extension is enabled
3. Test with health check endpoint

## Related Projects

- [PrehrajTo](https://github.com/Olbrasoft/PrehrajTo) - Video player using this proxy

## License

MIT

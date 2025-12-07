# CZ Web Proxy

Universal Czech IP proxy for bypassing geo-restrictions on content that requires Czech IP address.

## Live Instances

| Service | URL | Purpose |
|---------|-----|---------|
| **HTTPS Frontend** | https://cz-web-proxy-cha0hvfnhbedfyfh.canadacentral-01.azurewebsites.net | Public HTTPS endpoint (Azure Free) |
| **PHP Backend** | http://proxy.unas.cz | Czech IP proxy (Webzdarma) |

### Architecture

```
Client (HTTPS) → Azure Web App (FREE) → proxy.unas.cz (Czech IP) → Target
```

- **Azure Web App** - Free F1 tier, Node.js 20, handles HTTPS
- **Webzdarma** - Free PHP hosting with Czech IP `185.64.219.24`

## Features

- **Fetch any URL** - Returns JSON with response body and headers
- **Stream binary content** - Video, audio, images with Range request support
- **Health check** - Verify proxy status and Czech IP
- **CORS enabled** - Full cross-origin support for browser requests

## API Usage

### Health Check
```
GET https://cz-web-proxy-cha0hvfnhbedfyfh.canadacentral-01.azurewebsites.net/?action=health
```
Returns proxy status and Czech IP address.

### Fetch URL (JSON response)
```
GET https://cz-web-proxy-cha0hvfnhbedfyfh.canadacentral-01.azurewebsites.net/?url=https://example.com
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
GET https://cz-web-proxy-cha0hvfnhbedfyfh.canadacentral-01.azurewebsites.net/?action=stream&url=https://cdn.example.com/video.mp4
```
Streams the content directly with proper headers. Supports video seeking via Range requests.

## Use Cases

- Access Czech-only streaming services from abroad
- Bypass geo-restrictions on CDN content
- Test Czech IP-dependent APIs

## Deployment

### PHP Backend (proxy.unas.cz)
1. Upload `index.php` to PHP hosting with Czech IP
2. Ensure `curl` extension is enabled
3. Test with health check endpoint

### Azure Frontend
- Resource Group: `cz-web-proxy_group`
- App Service Plan: Free F1
- Runtime: Node.js 20 LTS
- Region: Canada Central

## Related Projects

- [PrehrajTo](https://github.com/Olbrasoft/PrehrajTo) - Video player using this proxy

## License

MIT

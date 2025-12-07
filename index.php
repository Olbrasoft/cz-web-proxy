<?php
/**
 * CZ Web Proxy - Universal Czech IP proxy for bypassing geo-restrictions
 * 
 * Hosted on: proxy.unas.cz (Czech Republic)
 * Repository: https://github.com/Olbrasoft/cz-web-proxy
 * 
 * Usage:
 *   Fetch any URL:    ?url=https://example.com
 *   Stream video:     ?action=stream&url=https://cdn.example.com/video.mp4
 *   Health check:     ?action=health
 */

// CORS headers for cross-origin access
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Range, X-Requested-With');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Determine action
$action = isset($_GET['action']) ? $_GET['action'] : 'fetch';

switch ($action) {
    case 'stream':
        handleStream();
        break;
    case 'health':
        handleHealth();
        break;
    case 'fetch':
    default:
        handleFetch();
        break;
}

/**
 * Health check - verify proxy is working
 */
function handleHealth() {
    header('Content-Type: application/json; charset=utf-8');
    
    // Get external IP to verify Czech location
    $ip = @file_get_contents('https://api.ipify.org');
    
    echo json_encode([
        'status' => 'ok',
        'proxy' => 'cz-web-proxy',
        'location' => 'Czech Republic',
        'ip' => $ip ?: 'unknown',
        'timestamp' => date('c'),
        'php_version' => PHP_VERSION
    ]);
    exit;
}

/**
 * Fetch URL and return content with headers
 * Used for: HTML pages, JSON APIs, etc.
 */
function handleFetch() {
    header('Content-Type: application/json; charset=utf-8');
    
    $url = isset($_GET['url']) ? $_GET['url'] : '';
    
    if (empty($url)) {
        echo json_encode([
            'success' => false,
            'error' => 'Missing url parameter',
            'usage' => [
                'fetch' => '?url=https://example.com',
                'stream' => '?action=stream&url=https://cdn.example.com/video.mp4',
                'health' => '?action=health'
            ]
        ]);
        exit;
    }
    
    // Validate URL
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        echo json_encode([
            'success' => false,
            'error' => 'Invalid URL format'
        ]);
        exit;
    }
    
    // Fetch the URL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HEADER, true);
    
    // Forward custom headers if provided
    $customHeaders = [];
    if (isset($_GET['referer'])) {
        $customHeaders[] = 'Referer: ' . $_GET['referer'];
    }
    if (!empty($customHeaders)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $customHeaders);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        echo json_encode([
            'success' => false,
            'error' => 'Curl error: ' . $error
        ]);
        exit;
    }
    
    // Separate headers and body
    $headers = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    
    // Parse response headers
    $headerLines = explode("\r\n", $headers);
    $responseHeaders = [];
    foreach ($headerLines as $line) {
        if (strpos($line, ':') !== false) {
            list($key, $value) = explode(':', $line, 2);
            $responseHeaders[strtolower(trim($key))] = trim($value);
        }
    }
    
    echo json_encode([
        'success' => $httpCode >= 200 && $httpCode < 400,
        'httpCode' => $httpCode,
        'finalUrl' => $finalUrl,
        'contentType' => $contentType,
        'contentLength' => strlen($body),
        'headers' => $responseHeaders,
        'body' => $body
    ]);
    exit;
}

/**
 * Stream binary content (video, audio, images)
 * Supports Range requests for video seeking
 */
function handleStream() {
    $url = isset($_GET['url']) ? $_GET['url'] : '';
    
    if (empty($url)) {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Missing url parameter']);
        exit;
    }
    
    // Validate URL
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Invalid URL format']);
        exit;
    }
    
    // Get Range header if present (for video seeking)
    $range = isset($_SERVER['HTTP_RANGE']) ? $_SERVER['HTTP_RANGE'] : null;
    
    // Disable output buffering for streaming
    while (ob_get_level()) {
        ob_end_clean();
    }
    
    // First, do a HEAD request to get content info
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_NOBODY, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    curl_exec($ch);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    
    if ($httpCode >= 400) {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Remote server returned HTTP ' . $httpCode]);
        exit;
    }
    
    // Determine content type for response
    if (empty($contentType)) {
        // Guess from URL extension
        $ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
        $mimeTypes = [
            'mp4' => 'video/mp4',
            'm3u8' => 'application/vnd.apple.mpegurl',
            'ts' => 'video/mp2t',
            'mp3' => 'audio/mpeg',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp'
        ];
        $contentType = isset($mimeTypes[$ext]) ? $mimeTypes[$ext] : 'application/octet-stream';
    }
    
    // Now stream the content
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $finalUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 0); // No timeout for streaming
    curl_setopt($ch, CURLOPT_BUFFERSIZE, 65536); // 64KB buffer
    
    // Forward Range header if present
    if ($range) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Range: ' . $range]);
    }
    
    // Set output headers
    header('Content-Type: ' . $contentType);
    header('Accept-Ranges: bytes');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Expose-Headers: Content-Length, Content-Range');
    
    // Handle response headers from remote server
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) {
        $len = strlen($header);
        
        // Forward important headers
        if (stripos($header, 'Content-Length:') === 0) {
            header(trim($header));
        }
        if (stripos($header, 'Content-Range:') === 0) {
            header(trim($header));
            http_response_code(206);
        }
        
        return $len;
    });
    
    // Stream data directly to output
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) {
        echo $data;
        flush();
        return strlen($data);
    });
    
    curl_exec($ch);
    
    if (curl_errno($ch)) {
        error_log('CZ-Web-Proxy stream error: ' . curl_error($ch));
    }
    
    curl_close($ch);
    exit;
}

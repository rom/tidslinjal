# TLS / HTTPS Configuration

Tidslinjal supports HTTPS via TLS. This guide explains how to enable it using
either a self-signed certificate (for development/internal use) or a
certificate from a trusted CA (for production).

---

## Quick Start — Self-Signed Certificate

### 1. Generate the certificate

```bash
./scripts/gen-cert.sh
```

This creates `certs/server.crt` and `certs/server.key`.

Optional parameters:

| Flag | Default | Description |
|------|---------|-------------|
| `--days N` | `3650` | Validity period in days |
| `--host HOSTS` | `localhost,127.0.0.1` | Comma-separated hostnames/IPs for the certificate's Subject Alternative Names |
| `--out DIR` | `certs/` | Output directory |
| `--key-size N` | `2048` | RSA key size in bits |

Example with custom settings:

```bash
./scripts/gen-cert.sh --host "timeline.example.com,192.168.1.10" --days 365 --out /etc/tidslinjal/certs
```

### 2. Start the server with TLS

```bash
./tidslinjal --tls-cert certs/server.crt --tls-key certs/server.key
```

The server will listen on port **8443** by default when TLS is enabled.
You can override the port with `--port`:

```bash
./tidslinjal --tls-cert certs/server.crt --tls-key certs/server.key --port 443
```

### 3. Environment variables (alternative to flags)

```bash
export TLS_CERT=/etc/tidslinjal/certs/server.crt
export TLS_KEY=/etc/tidslinjal/certs/server.key
./tidslinjal
```

---

## Production — Let's Encrypt Certificate

For public-facing deployments use [Let's Encrypt](https://letsencrypt.org) to get
a free, browser-trusted certificate.

### Using Certbot (standalone)

```bash
# Install certbot
sudo apt install certbot   # Debian/Ubuntu
sudo dnf install certbot   # Fedora/RHEL

# Obtain certificate (port 80 must be free)
sudo certbot certonly --standalone -d timeline.example.com

# Start Tidslinjal with the Let's Encrypt certificate
sudo ./tidslinjal \
  --tls-cert /etc/letsencrypt/live/timeline.example.com/fullchain.pem \
  --tls-key  /etc/letsencrypt/live/timeline.example.com/privkey.pem \
  --port 443
```

### Automatic renewal

```bash
# Add to crontab (renews automatically, restarts the server)
0 3 * * * certbot renew --quiet && systemctl restart tidslinjal
```

---

## Trusting the Self-Signed Certificate

### Linux (Chrome / Chromium)

```bash
certutil -d sql:$HOME/.pki/nssdb \
  -A -t 'CT,,' -n tidslinjal \
  -i certs/server.crt
```

### Linux (Firefox)

Open **Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import** and import `certs/server.crt`.

### macOS

```bash
sudo security add-trusted-cert \
  -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  certs/server.crt
```

### Windows

```powershell
Import-Certificate -FilePath .\certs\server.crt `
  -CertStoreLocation Cert:\LocalMachine\Root
```

---

## Security Notes

- **Self-signed certificates** cause browser security warnings — they are suitable for internal/development use only.
- Keep the private key (`server.key`) confidential. It has `chmod 600` permissions after generation.
- For internet-facing deployments, always use a certificate from a trusted CA.
- The server enforces TLS 1.2+ (Go defaults).

---

## Nginx / Reverse Proxy

If you prefer to terminate TLS at a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name timeline.example.com;

    ssl_certificate     /etc/letsencrypt/live/timeline.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/timeline.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket / SSE support
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name timeline.example.com;
    return 301 https://$host$request_uri;
}
```

In this setup, run Tidslinjal **without** TLS flags (it handles plain HTTP on localhost), and Nginx handles the certificate.

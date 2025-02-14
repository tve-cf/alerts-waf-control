# Cloudflare WAF Control

A web application for managing Cloudflare WAF (Web Application Firewall) rules and notifications. This solution provides a user-friendly interface to configure and control WAF rules, along with a webhook endpoint for handling Cloudflare notifications.

## ⚠️ Security Notice

This application must be protected using Cloudflare Zero Trust Access to ensure secure access to the management interface. Before deploying:

1. Set up a Cloudflare Zero Trust Access policy for your Worker's domain
2. Configure appropriate authentication methods (e.g., One-time PIN, Identity providers)
3. Restrict access to authorized users/groups only for all endpoints EXCEPT `/api/webhook`
4. Create a separate bypass policy for `/api/webhook` endpoint as it uses webhook secret for authentication
   - The webhook endpoint is secured using a webhook secret configured in the application
   - This allows Cloudflare to send notifications directly to the endpoint

## Features

- 🛡️ View and manage Cloudflare WAF rules
- 🔄 Enable/disable WAF rules through a user interface
- 🔔 Webhook endpoint for Cloudflare notifications
- ⚙️ Configuration management for API keys and zone settings
- 🔐 Secure storage of settings using Cloudflare KV

## Tech Stack

- Frontend: Hono/JSX + React
- Backend: Cloudflare Workers
- API: Hono framework
- Storage: Cloudflare KV
- Build Tool: Vite

## Prerequisites

- Node.js (Latest LTS version recommended)
- npm
- Cloudflare account with:
  - API token with appropriate permissions
  - Zone ID of the domain you want to manage
  - Access to Workers and KV
  - Cloudflare Zero Trust Access enabled

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `wrangler.toml` file based on `wrangler-sample.toml` and configure your Cloudflare Worker settings.

3. Create a `.dev.vars` file for local development environment variables.

## Development

Run the development server:
```bash
npm run dev
```

This will start both the frontend and backend in development mode.

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Configuration

After deployment, you'll need to configure the following through the web interface:

1. Cloudflare API Key
2. Zone ID
3. WAF Rule settings
4. Webhook secret (for notification endpoint)

## API Endpoints

- `GET /api/zones` - List available Cloudflare zones
- `GET /api/waf/rules` - Get WAF rules for a zone
- `POST /api/waf/rules/enable` - Enable/disable WAF rules
- `GET /api/settings` - Retrieve current settings
- `POST /api/settings` - Update settings
- `GET /api/webhook` - Webhook endpoint test to check if ZT Access is protecting it
- `POST /api/webhook` - Webhook endpoint for Cloudflare notifications

## License

See [LICENSE.md](LICENSE.md) for details.

```
npm run deploy
```

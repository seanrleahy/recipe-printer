# Recipe Printer

A tiny URL-to-printable-recipe app. Static frontend + Cloudflare Worker. No database or accounts.

## Files
- `index.html`, `style.css`, `app.js`: browser app
- `worker.js`: fetches a public recipe page and extracts Schema.org `Recipe` JSON-LD

## Run locally
The frontend expects the Worker endpoint at `/api/recipe`. For local development, use Wrangler:

1. Install Node.js.
2. In this folder, run `npx wrangler dev`.
3. Open the local address Wrangler prints.

You may need to create a `wrangler.toml` (example below) and place the static files in `public/`:

```toml
name = "recipe-printer"
main = "worker.js"
compatibility_date = "2026-11-15"

[assets]
directory = "./public"
binding = "ASSETS"
```

Move `index.html`, `style.css`, and `app.js` into a `public/` folder for this configuration. The included Worker already serves non-API requests from `env.ASSETS`.

## Deploy free with Cloudflare
1. Create a free Cloudflare account.
2. Install Wrangler: `npm install -g wrangler`
3. Log in: `wrangler login`
4. Put the three frontend files in a `public/` folder and use the `wrangler.toml` above.
5. 6. Deploy with `wrangler deploy`.
7. Cloudflare will provide a `workers.dev` address. You can optionally connect a domain you own.

## Notes and limitations
- Extraction relies primarily on Schema.org Recipe JSON-LD, which many recipe sites publish.
- Some sites block automated requests or omit structured recipe data.
- The “A little background” section currently uses a conservative meta-description fallback. Extracting true anecdotes/history from arbitrary pages is inherently less reliable and may need site-specific parsing or an optional AI service.
- No recipe content is stored by this app.
- Before public launch, consider adding rate limiting and a stricter outbound-fetch policy. The Worker rejects common local/private hostnames and validates redirects, but production hardening should include DNS/IP-level protections and abuse controls.

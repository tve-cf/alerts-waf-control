import { Hono } from "hono";
import { Bindings } from "./types";
import { apiRoutes } from "./routes/api";

const app = new Hono<{ Bindings: Bindings }>().route("/", apiRoutes);

app.get("/", (c) => {
  return c.html(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>WAF Control</title>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <link
          rel="stylesheet"
          href="https://cdn.simplecss.org/simple.min.css"
        />
        {import.meta.env.PROD ? (
          <script type="module" src="/client.js" />
        ) : (
          <script type="module" src="/src/client.tsx" />
        )}
      </head>
      <body>
        <div id="root" />
      </body>
    </html>
  );
});

export type AppType = typeof app;
export default app;

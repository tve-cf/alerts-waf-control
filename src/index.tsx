import { Hono } from "hono";
import { Cloudflare } from "cloudflare";

interface Settings {
  apiKey: string;
  zoneId: string;
  rulesetId: string;
  ruleId: string;
}

interface Bindings {
  SETTINGS: KVNamespace;
}

const app = new Hono<{ Bindings: Bindings }>();

// Initialize routes with all API endpoints
const routes = app
  .get("/api/zones", async (c) => {
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
      return c.json({ success: false, error: "API key is required" }, 401);
    }

    const cf = new Cloudflare({
      apiToken: apiKey,
    });

    try {
      const zones = await cf.zones.list();
      return c.json({ success: true, result: zones.result });
    } catch (error) {
      console.error(error);
      return c.json({ success: false, error: "Failed to fetch zones" }, 500);
    }
  })
  .get("/api/waf/rules", async (c) => {
    const apiKey = c.req.header("X-API-Key");
    const zoneId = c.req.query("zoneId");

    if (!apiKey || !zoneId) {
      return c.json(
        { success: false, error: "API key and Zone ID are required" },
        401
      );
    }

    const cf = new Cloudflare({
      apiToken: apiKey,
    });

    try {
      const phaseResponse = await cf.rulesets.phases.get(
        "http_request_firewall_custom",
        { zone_id: zoneId }
      );

      if (!phaseResponse.rules || !phaseResponse.rules.length) {
        return c.json({ success: false, error: "No WAF rules found" }, 404);
      }

      const rulesData = phaseResponse.rules;

      return c.json({
        success: true,
        result: {
          rulesetId: phaseResponse.id,
          rules: rulesData,
        },
        error: null,
      });
    } catch (error) {
      return c.json(
        { success: false, result: null, error: "Failed to fetch WAF rules" },
        500
      );
    }
  })
  .post("/api/waf/rules/enable", async (c) => {
    const apiKey = c.req.header("X-API-Key");
    const body = await c.req.json();
    const { zoneId, ruleId, rulesetId, enabled } = body;

    if (!apiKey || !zoneId || !ruleId || !rulesetId) {
      return c.json(
        { success: false, error: "Missing required parameters" },
        400
      );
    }

    const cf = new Cloudflare({
      apiToken: apiKey,
    });

    try {
      const phaseResponse = await cf.rulesets.phases.get(
        "http_request_firewall_custom",
        { zone_id: zoneId }
      );

      if (!phaseResponse.rules || !phaseResponse.rules.length) {
        return c.json({ success: false, error: "No WAF rules found" }, 404);
      }

      const rulesData = phaseResponse.rules;
      const rule = rulesData.find((rule) => rule.id === ruleId);

      if (!rule) {
        return c.json({ success: false, error: "Rule not found" }, 404);
      }

      // Set the enabled state based on the request
      rule.enabled = enabled;

      const updateRules = await cf.rulesets.update(rulesetId, {
        zone_id: zoneId,
        rules: [rule],
      });

      return c.json({ 
        success: true, 
        result: updateRules,
        message: `Successfully ${enabled ? 'enabled' : 'disabled'} WAF rule ${ruleId}`
      });
    } catch (error) {
      console.error(error);
      return c.json(
        { success: false, error: "Failed to update WAF rules" },
        500
      );
    }
  })
  .get("/api/settings", async (c) => {
    try {
      const settings = await c.env.SETTINGS.get("waf-settings");
      if (!settings) {
        return c.json({ success: true, result: null });
      }
      return c.json({ success: true, result: JSON.parse(settings) });
    } catch (error) {
      console.error(error);
      return c.json({ success: false, error: "Failed to fetch settings" }, 500);
    }
  })
  .post("/api/settings", async (c) => {
    try {
      const body = await c.req.json();
      const { apiKey, zoneId, rulesetId, ruleId } = body as Settings;

      if (!apiKey || !zoneId) {
        return c.json({ success: false, error: "Missing required parameters" }, 400);
      }

      // Verify the API key and zone ID are valid
      const cf = new Cloudflare({
        apiToken: apiKey,
      });

      try {
        await cf.zones.get({ zone_id: zoneId });
        
        // If ruleId is provided, verify it exists
        if (ruleId && rulesetId) {
          const phaseResponse = await cf.rulesets.phases.get(
            "http_request_firewall_custom",
            { zone_id: zoneId }
          );

          if (!phaseResponse.rules?.some(rule => rule.id === ruleId)) {
            return c.json({ success: false, error: "Invalid rule ID" }, 400);
          }
        }
      } catch (error) {
        return c.json({ success: false, error: "Invalid API key or zone ID" }, 400);
      }

      // Save settings to KV
      await c.env.SETTINGS.put("waf-settings", JSON.stringify({ 
        apiKey, 
        zoneId,
        rulesetId: rulesetId || "",
        ruleId: ruleId || ""
      }));

      return c.json({ 
        success: true, 
        result: { 
          apiKey, 
          zoneId,
          rulesetId: rulesetId || "",
          ruleId: ruleId || ""
        } 
      });
    } catch (error) {
      console.error(error);
      return c.json({ success: false, error: "Failed to save settings" }, 500);
    }
  })
  .post("/api/webhook", async (c) => {
    try {
      // Get settings from KV
      const settingsStr = await c.env.SETTINGS.get("waf-settings");
      if (!settingsStr) {
        return c.json({ success: false, error: "No settings found" }, 404);
      }

      const settings = JSON.parse(settingsStr) as Settings;
      const { apiKey, zoneId, rulesetId, ruleId } = settings;

      if (!apiKey || !zoneId || !rulesetId || !ruleId) {
        return c.json({ success: false, error: "Incomplete settings found" }, 400);
      }

      // Initialize Cloudflare client with saved API key
      const cf = new Cloudflare({
        apiToken: apiKey,
      });

      // Get current rules to verify the rule exists
      const phaseResponse = await cf.rulesets.phases.get(
        "http_request_firewall_custom",
        { zone_id: zoneId }
      );

      if (!phaseResponse.rules || !phaseResponse.rules.length) {
        return c.json({ success: false, error: "No WAF rules found" }, 404);
      }

      const rule = phaseResponse.rules.find((r) => r.id === ruleId);
      if (!rule) {
        return c.json({ success: false, error: "Rule not found" }, 404);
      }

      // Enable the rule
      rule.enabled = true;

      // Update the ruleset with the enabled rule
      const updateRules = await cf.rulesets.update(rulesetId, {
        zone_id: zoneId,
        rules: [rule],
      });

      return c.json({ 
        success: true, 
        result: updateRules,
        message: `Successfully enabled WAF rule ${ruleId}`
      });
    } catch (error) {
      console.error("Webhook error:", error);
      return c.json({ 
        success: false, 
        error: "Failed to process webhook request" 
      }, 500);
    }
  });

export type AppType = typeof routes;

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

export default app;

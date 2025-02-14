import { Hono } from "hono";
import { Bindings, Settings } from "../types";
import { Cloudflare } from "cloudflare";
import { Zone } from "cloudflare/src/resources/zones/zones.js";

interface ApiResponse<T> {
  success: boolean;
  result?: T | null;
  error?: string | { message: string } | null;
}

export const apiRoutes = new Hono<{ Bindings: Bindings }>()
  .get("/api/zones", async (c) => {
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
      return c.json<ApiResponse<Zone[]>>(
        {
          success: false,
          error: "API key is required",
          result: null,
        },
        401,
      );
    }

    const cf = new Cloudflare({
      apiToken: apiKey,
    });

    try {
      const zones = await cf.zones.list();
      return c.json<ApiResponse<Zone[]>>(
        {
          success: true,
          result: zones.result,
          error: null,
        },
        200,
      );
    } catch (error) {
      console.error(error);
      return c.json<ApiResponse<Zone[]>>(
        {
          success: false,
          error: "Failed to fetch zones",
          result: null,
        },
        400,
      );
    }
  })
  .get("/api/waf/rules", async (c) => {
    const apiKey = c.req.header("X-API-Key");
    const zoneId = c.req.query("zoneId");

    if (!apiKey || !zoneId) {
      return c.json<ApiResponse<null>>(
        { success: false, error: "API key and Zone ID are required" },
        401,
      );
    }

    const cf = new Cloudflare({
      apiToken: apiKey,
    });

    try {
      const phaseResponse = await cf.rulesets.phases.get(
        "http_request_firewall_custom",
        { zone_id: zoneId },
      );

      if (!phaseResponse.rules || !phaseResponse.rules.length) {
        return c.json<ApiResponse<null>>(
          {
            success: false,
            error: "No WAF rules found",
            result: null,
          },
          404,
        );
      }

      const rulesData = phaseResponse.rules;

      return c.json<
        ApiResponse<{
          rulesetId: string;
          rules: typeof phaseResponse.rules;
        }>
      >({
        success: true,
        result: {
          rulesetId: phaseResponse.id,
          rules: rulesData,
        },
        error: null,
      });
    } catch (error) {
      return c.json<ApiResponse<null>>(
        {
          success: false,
          result: null,
          error: "Failed to fetch WAF rules",
        },
        500,
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
        400,
      );
    }

    const cf = new Cloudflare({
      apiToken: apiKey,
    });

    try {
      const phaseResponse = await cf.rulesets.phases.get(
        "http_request_firewall_custom",
        { zone_id: zoneId },
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
        message: `Successfully ${
          enabled ? "enabled" : "disabled"
        } WAF rule ${ruleId}`,
      });
    } catch (error) {
      console.error(error);
      return c.json(
        { success: false, error: "Failed to update WAF rules" },
        500,
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
      const { apiKey, zoneId, rulesetId, ruleId, secret } = body as Settings;

      if (!apiKey || !zoneId) {
        return c.json<{ success: boolean; error: string; result?: Settings }>(
          { success: false, error: "Missing required parameters" },
          400,
        );
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
            { zone_id: zoneId },
          );

          if (!phaseResponse.rules?.some((rule) => rule.id === ruleId)) {
            return c.json<{
              success: boolean;
              error: string;
              result?: Settings;
            }>({ success: false, error: "Invalid rule ID" }, 400);
          }
        }
      } catch (error) {
        return c.json<{ success: boolean; error: string; result?: Settings }>(
          { success: false, error: "Invalid API key or zone ID" },
          400,
        );
      }

      // Save settings to KV
      await c.env.SETTINGS.put(
        "waf-settings",
        JSON.stringify({
          apiKey,
          zoneId,
          secret,
          rulesetId: rulesetId || "",
          ruleId: ruleId || "",
        }),
      );

      return c.json<{ success: boolean; result: Settings }>({
        success: true,
        result: {
          apiKey,
          zoneId,
          secret,
          rulesetId: rulesetId || "",
          ruleId: ruleId || "",
        },
      });
    } catch (error) {
      console.error(error);
      return c.json<{ success: boolean; error: string; result?: Settings }>(
        { success: false, error: "Failed to save settings" },
        500,
      );
    }
  })
  .get("/api/webhook", async (c) => {
    return c.json({ message: "Webhook" });
  })
  .post("/api/webhook", async (c) => {
    try {
      const secretHeader = c.req.header("cf-webhook-auth");

      if (!secretHeader) {
        return c.json({ success: false, error: "Access denied" }, 401);
      }

      // Get settings from KV
      const settingsStr = await c.env.SETTINGS.get("waf-settings");
      if (!settingsStr) {
        return c.json({ success: false, error: "No settings found" }, 404);
      }

      const settings = JSON.parse(settingsStr) as Settings;
      const { apiKey, zoneId, rulesetId, ruleId, secret } = settings;

      if (settingsStr !== secret) {
        return c.json({ success: false, error: "Access denied" }, 401);
      }

      if (!apiKey || !zoneId || !rulesetId || !ruleId) {
        return c.json(
          { success: false, error: "Incomplete settings found" },
          400,
        );
      }

      // Initialize Cloudflare client with saved API key
      const cf = new Cloudflare({
        apiToken: apiKey,
      });

      // Get current rules to verify the rule exists
      const phaseResponse = await cf.rulesets.phases.get(
        "http_request_firewall_custom",
        { zone_id: zoneId },
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
        message: `Successfully enabled WAF rule ${ruleId}`,
      });
    } catch (error) {
      console.error("Webhook error:", error);
      return c.json(
        {
          success: false,
          error: "Failed to process webhook request",
        },
        500,
      );
    }
  });

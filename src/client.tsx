import { hc } from "hono/client";
import { useState, useEffect } from "hono/jsx";
import { render } from "hono/jsx/dom";
import type { AppType } from ".";

const client = hc<AppType>("/");

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  error: string | null;
  errors?: Array<{
    code: number;
    message: string;
  }>;
  messages?: string[];
  message?: string;
}

interface Zone {
  id: string;
  name: string;
}

interface WAFRuleResponse {
  rulesetId: string;
  rules: WAFRule[];
}

interface WAFRule {
  id: string;
  version: string;
  action: string;
  description: string;
  enabled: boolean;
  ref: string;
  last_updated: string;
}

interface Settings {
  apiKey: string;
  zoneId: string;
  rulesetId: string;
  ruleId: string;
}

function App() {
  const [apiKey, setApiKey] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState("");
  const [wafRules, setWafRules] = useState<WAFRule[]>([]);
  const [selectedRule, setSelectedRule] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rulesetId, setRulesetId] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Create a new client instance when API key changes
  const getClient = () => {
    return hc<AppType>("/", {
      headers: {
        "X-API-Key": apiKey,
      },
    });
  };

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const client = getClient();
        const response = await client.api.settings.$get();
        const data =
          (await response.json()) as CloudflareResponse<Settings | null>;
        if (data.success && data.result) {
          setApiKey(data.result.apiKey);
          setSelectedZone(data.result.zoneId);
          setRulesetId(data.result.rulesetId);
          if (data.result.ruleId) {
            setSelectedRule(data.result.ruleId);
          }
          setSettingsSaved(true);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadSettings();
  }, []);

  // Fetch zones when API key is provided
  useEffect(() => {
    const fetchZones = async () => {
      if (!apiKey) return;
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      try {
        const client = getClient();
        const response = await client.api.zones.$get();
        const data = (await response.json()) as CloudflareResponse<Zone[]>;
        if (data.success) {
          setZones(data.result);
        } else {
          setError(data.errors?.[0]?.message || "Failed to fetch zones");
        }
      } catch (err) {
        setError("Error fetching zones: " + (err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchZones();
  }, [apiKey]);

  // Fetch WAF rules when zone is selected
  useEffect(() => {
    const fetchWAFRules = async () => {
      if (!apiKey || !selectedZone) return;
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      try {
        const client = getClient();
        const response = await client.api.waf.rules.$get({
          query: { zoneId: selectedZone },
        });
        const data =
          (await response.json()) as CloudflareResponse<WAFRuleResponse>;

        if (data.success) {
          setRulesetId(data.result.rulesetId);
          setWafRules(data.result.rules);
          setSelectedRule(""); // Reset selected rule when zone changes
        } else {
          setError(data.error || "Failed to fetch WAF rules");
        }
      } catch (err) {
        setError("Error fetching WAF rules: " + (err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchWAFRules();
  }, [selectedZone, apiKey]);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!apiKey || !selectedZone || !selectedRule) {
      setError("Please fill in all required fields");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Find the current rule to toggle its state
    const currentRule = wafRules.find(rule => rule.id === selectedRule);
    if (!currentRule) {
      setError("Selected rule not found");
      setLoading(false);
      return;
    }

    try {
      const client = getClient();
      const response = await client.api.waf.rules.enable.$post({
        json: {
          rulesetId: rulesetId ?? "",
          zoneId: selectedZone,
          ruleId: selectedRule,
          enabled: !currentRule.enabled // Toggle the current state
        },
      });
      const data = (await response.json()) as CloudflareResponse<{
        id: string;
      }>;

      if (data.success) {
        setSuccessMessage(data.message || `Successfully ${!currentRule.enabled ? 'enabled' : 'disabled'} WAF rule`);
        // Refresh the rules list
        const rulesResponse = await client.api.waf.rules.$get({
          query: { zoneId: selectedZone },
        });
        const rulesData =
          (await rulesResponse.json()) as CloudflareResponse<WAFRuleResponse>;
        if (rulesData.success) {
          setWafRules(rulesData.result.rules);
        }
      } else {
        setError(data.error || "Failed to update WAF rule");
      }
    } catch (err) {
      setError("Error updating WAF rule: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!apiKey || !selectedZone) {
      setError(
        "Please fill in API key and select a zone before saving settings"
      );
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const client = getClient();
      const response = await client.api.settings.$post({
        json: {
          apiKey,
          zoneId: selectedZone,
          rulesetId: rulesetId || "",
          ruleId: selectedRule || "",
        },
      });
      const data = (await response.json()) as CloudflareResponse<Settings>;
      if (data.success) {
        setSuccessMessage("Settings saved successfully");
        setSettingsSaved(true);
      } else {
        setError(data.error || "Failed to save settings");
      }
    } catch (err) {
      setError("Error saving settings: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="container">
      <h1>Cloudflare WAF Control</h1>

      {error && <div class="error">{error}</div>}
      {successMessage && <div class="success">{successMessage}</div>}

      <form onSubmit={handleSubmit}>
        <div class="form-group">
          <label htmlFor="apiKey">Cloudflare API Key:</label>
          <div class="input-with-button">
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label htmlFor="zone">Select Zone:</label>
          <select
            id="zone"
            value={selectedZone}
            onChange={(e) =>
              setSelectedZone((e.target as HTMLSelectElement).value)
            }
            disabled={!apiKey || loading}
            required
          >
            <option value="">Select a zone...</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        <div class="form-group">
          <label>Select WAF Rule:</label>
          <div class="rules-container">
            {wafRules.map((rule) => (
              <label key={rule.id} class="rule-item">
                <input
                  type="radio"
                  name="wafRule"
                  value={rule.id}
                  checked={selectedRule === rule.id}
                  onChange={(e) =>
                    setSelectedRule((e.target as HTMLInputElement).value)
                  }
                />
                <div class="rule-info">
                  <div class="rule-description">{rule.description}</div>
                  <div class="rule-details">
                    ID: {rule.id} | Action: {rule.action} | Status:{" "}
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            class="save-button"
            onClick={handleSaveSettings}
            disabled={loading || !apiKey || !selectedZone}
          >
            {settingsSaved ? "Update Settings" : "Save Settings"}
          </button>
          <button
            type="submit"
            disabled={loading || !apiKey || !selectedZone || !selectedRule}
          >
            {loading ? "Processing..." : selectedRule ? 
              `${wafRules.find(r => r.id === selectedRule)?.enabled ? 'Disable' : 'Enable'} WAF Rule` : 
              'Update WAF Rule'}
          </button>
        </div>
      </form>

      <style>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input[type="password"],
        select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .rules-container {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid #ddd;
          padding: 10px;
          border-radius: 4px;
        }
        .rule-item {
          display: flex;
          align-items: flex-start;
          margin-bottom: 12px;
          padding: 8px;
          border: 1px solid #eee;
          border-radius: 4px;
          cursor: pointer;
        }
        .rule-item:hover {
          background-color: #f5f5f5;
        }
        .rule-info {
          margin-left: 8px;
          flex: 1;
        }
        .rule-description {
          font-weight: 500;
          margin-bottom: 4px;
        }
        .rule-details {
          font-size: 0.9em;
          color: #666;
        }
        .error {
          color: #d32f2f;
          margin-bottom: 20px;
          padding: 10px;
          background-color: #ffebee;
          border-radius: 4px;
        }
        .success {
          color: #2e7d32;
          margin-bottom: 20px;
          padding: 10px;
          background-color: #e8f5e9;
          border-radius: 4px;
        }
        button {
          background-color: #2196f3;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover:not(:disabled) {
          background-color: #1976d2;
        }
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        input[type="radio"] {
          margin-right: 8px;
          margin-top: 4px;
        }
        .input-with-button {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .save-button {
          white-space: nowrap;
          padding: 8px 16px;
          height: 38px;
        }
        input[type="password"] {
          flex: 1;
        }
      `}</style>
    </div>
  );
}

const root = document.getElementById("root")!;
render(<App />, root);

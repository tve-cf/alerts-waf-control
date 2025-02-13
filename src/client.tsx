import { hc } from "hono/client";
import { useState, useEffect, useCallback, useMemo } from "hono/jsx";
import { render } from "hono/jsx/dom";
import { AppType } from ".";
import { handleError } from "./common";
import debounce from "lodash/debounce";

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
  id?: string;
  version?: string;
  action?: string;
  description?: string;
  enabled?: boolean;
  ref?: string;
  last_updated?: string;
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

  // Memoize the client creation
  const getClient = useCallback(() => {
    return hc<AppType>("/", {
      headers: {
        "X-API-Key": apiKey,
      },
    });
  }, [apiKey]);

  // Debounced API key setter
  const debouncedSetApiKey = useMemo(
    () => debounce((value: string) => setApiKey(value), 300),
    []
  );

  // Load saved settings on mount
  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const client = getClient();
        const response = await client.api.settings.$get();
        const data =
          (await response.json()) as CloudflareResponse<Settings | null>;

        if (mounted && data.success && data.result) {
          const savedSettings = data.result;
          setApiKey(savedSettings.apiKey);
          setRulesetId(savedSettings.rulesetId);
          if (savedSettings.ruleId) {
            setSelectedRule(savedSettings.ruleId);
          }
          setSettingsSaved(true);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };

    loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch zones when API key is provided
  useEffect(() => {
    let mounted = true;

    const fetchZones = async () => {
      if (!apiKey) return;

      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const client = getClient();
        const response = await client.api.zones.$get();
        const data = await response.json();

        if (mounted && data.success) {
          const fetchedZones = data?.result ?? [];
          setZones(fetchedZones);
        } else if (mounted) {
          setError(handleError(data.error, "Failed to fetch zones"));
        }
      } catch (err) {
        if (mounted) {
          setError(handleError(err as Error, "Failed to fetch zones"));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchZones();
    return () => {
      mounted = false;
    };
  }, [apiKey, getClient]);

  // Fetch WAF rules when zone is selected
  useEffect(() => {
    let mounted = true;

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
        const data = await response.json();

        if (mounted && data.success && data.result) {
          setRulesetId(data?.result?.rulesetId);
          setWafRules(data?.result?.rules!);

          // Only reset selected rule if it doesn't exist in new rules
          if (selectedRule) {
            const ruleExists = data?.result?.rules?.some(
              (rule) => rule.id === selectedRule
            );
            if (!ruleExists) {
              setSelectedRule("");
            }
          }
        } else if (mounted) {
          setError(handleError(data.error, "Failed to fetch WAF rules"));
        }
      } catch (err) {
        if (mounted) {
          setError(handleError(err as Error, "Failed to fetch WAF rules"));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchWAFRules();
    return () => {
      mounted = false;
    };
  }, [selectedZone, apiKey, selectedRule, getClient]);

  useEffect(() => {
    if (zones.length > 0) {
      setSelectedZone(selectedZone || zones[0].id);
    }
  }, [zones, selectedZone, settingsSaved]);

  // Memoize the filtered WAF rules
  const sortedWafRules = useMemo(() => {
    return [...wafRules].sort((a, b) => {
      return (a.description || "").localeCompare(b.description || "");
    });
  }, [wafRules]);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!apiKey || !selectedZone || !selectedRule) {
      setError("Please fill in all required fields");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const currentRule = wafRules.find((rule) => rule.id === selectedRule);
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
          enabled: !currentRule.enabled,
        },
      });
      const data = (await response.json()) as CloudflareResponse<{
        id: string;
      }>;

      if (data.success) {
        setSuccessMessage(
          data.message ||
            `Successfully ${
              !currentRule.enabled ? "enabled" : "disabled"
            } WAF rule`
        );

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
        setError(handleError(data.error, "Failed to update WAF rule"));
      }
    } catch (err) {
      setError(handleError(err as Error, "Failed to update WAF rule"));
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
        setError(handleError(data.error, "Failed to save settings"));
      }
    } catch (err) {
      setError(handleError(err as Error, "Failed to save settings"));
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
              onChange={(e) =>
                debouncedSetApiKey((e.target as HTMLInputElement).value)
              }
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label htmlFor="zone">Select Zone:</label>
          <select
            id="zone"
            value={selectedZone || ""}
            onChange={(e) => {
              const value = (e.target as HTMLSelectElement).value;
              setSelectedZone(value);
            }}
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
            {sortedWafRules.map((rule) => (
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

        <div class="form-group">
          <p>Zone ID: {selectedZone}</p>
          <p>Ruleset ID: {rulesetId}</p>
          <p>Rule ID: {selectedRule}</p>
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
            {loading
              ? "Processing..."
              : selectedRule
              ? `${
                  wafRules.find((r) => r.id === selectedRule)?.enabled
                    ? "Disable"
                    : "Enable"
                } WAF Rule`
              : "Update WAF Rule"}
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

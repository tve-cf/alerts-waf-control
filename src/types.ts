import type { apiRoutes } from "./routes/api";

export interface Settings {
  apiKey: string;
  zoneId: string;
  rulesetId: string;
  ruleId: string;
  secret: string;
}

export interface CloudflareResponse<T> {
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

export interface Zone {
  id: string;
  name: string;
}

export interface WAFRuleResponse {
  rulesetId: string;
  rules: WAFRule[];
}

export interface WAFRule {
  id?: string;
  version?: string;
  action?: string;
  description?: string;
  enabled?: boolean;
  ref?: string;
  last_updated?: string;
}

export interface Bindings {
  SETTINGS: KVNamespace;
}

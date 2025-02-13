import type { apiRoutes } from "./routes/api";

export interface Settings {
  apiKey: string;
  zoneId: string;
  rulesetId: string;
  ruleId: string;
  secret: string;
}

export interface Bindings {
  SETTINGS: KVNamespace;
}

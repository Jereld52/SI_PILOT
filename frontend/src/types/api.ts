export interface Permission {
  id: string;
  code: string;
  module: string;
  action: string;
  description: string | null;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  data_scope_default: string;
  is_system: boolean;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role_id: string;
  role: Role;
  data_scope: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface LoginResponse {
  user: User;
  permissions: string[];
  csrf_token: string;
  expires_at: string;
}

export interface MeResponse {
  user: User;
  permissions: string[];
  modules: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface KpiValue {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  hint: string | null;
  severity: string;
  link: string | null;
}

export interface ChartPoint {
  label: string;
  value: number;
  color: string | null;
}

export interface ChartSeries {
  key: string;
  label: string;
  points: ChartPoint[];
  unit: string | null;
}

export interface AlertItem {
  id: string;
  severity: string;
  title: string;
  detail: string | null;
  link: string | null;
  category: string;
}

export interface ActivityItem {
  id: string;
  occurred_at: string;
  actor: string | null;
  module: string;
  action: string;
  label: string | null;
  status: string;
  link: string | null;
}

export interface DashboardSummary {
  kpis: KpiValue[];
  generated_at: string;
}

export interface DashboardCharts {
  series: ChartSeries[];
  generated_at: string;
}

export interface DashboardAlerts {
  items: AlertItem[];
  generated_at: string;
}

export interface DashboardActivity {
  items: ActivityItem[];
  generated_at: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  occurred_at: string;
  actor_user_id: string | null;
  actor_label: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  before_json: string | null;
  after_json: string | null;
  diff_json: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  source: string;
  status: string;
}

export interface SettingItem {
  key: string;
  value: unknown;
  category: string;
  is_secret: boolean;
  description: string | null;
  updated_at: string;
}

export interface SessionInfo {
  id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  link: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  took_ms: number;
}

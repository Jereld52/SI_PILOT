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

export interface ServiceItem {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  manager_user_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LocationItem {
  id: string;
  code: string | null;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  building: string | null;
  floor: string | null;
  room: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AssetCategoryItem {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  is_infrastructure: boolean;
  is_workstation: boolean;
  requires_network_fields: boolean;
  default_life_months: number;
  tag_prefix: string | null;
  tag_template: string;
  tag_sequence_mode: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface AgentRef {
  id: string;
  first_name: string;
  last_name: string;
  email_pro: string;
}

export interface AgentItem {
  id: string;
  first_name: string;
  last_name: string;
  email_pro: string;
  phone_pro: string | null;
  service_id: string | null;
  service: ServiceItem | null;
  function_label: string | null;
  location_id: string | null;
  location: LocationItem | null;
  manager_agent_id: string | null;
  login: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetItem {
  id: string;
  asset_tag: string;
  name: string;
  category_id: string;
  category: AssetCategoryItem;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  mac_address: string | null;
  ip_address: string | null;
  hostname: string | null;
  os_name: string | null;
  os_version: string | null;
  purchase_date: string | null;
  commissioning_date: string | null;
  warranty_end: string | null;
  supplier_id: string | null;
  supplier: { id: string; name: string } | null;
  purchase_price: number | null;
  status: string;
  condition: string;
  assigned_agent_id: string | null;
  assigned_agent: AgentRef | null;
  service_id: string | null;
  service: ServiceItem | null;
  location_id: string | null;
  location: LocationItem | null;
  comments: string | null;
  is_critical: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetAssignmentItem {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  service_name: string | null;
  location_name: string | null;
  started_at: string;
  ended_at: string | null;
  reason: string | null;
}

export interface AssetTagPreview {
  tag: string;
  prefix: string | null;
  template: string;
  next_sequence: number;
  year: number;
}

export interface ImportJob {
  id: string;
  entity_type: string;
  original_filename: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  duplicate_rows: number;
  created_at: string;
  applied_at: string | null;
}

export interface ImportRowPreview {
  row_number: number;
  status: string;
  label: string;
  errors: string[];
}

export interface ImportPreviewResponse {
  job: ImportJob;
  rows: ImportRowPreview[];
  can_apply: boolean;
  message: string;
  detected_format: string;
}

export interface ImportApplyResponse {
  job: ImportJob;
  created: number;
  skipped: number;
  errors: number;
  message: string;
}

export interface MobileLineItem {
  id: string;
  line_number: string;
  civility: string | null;
  holder_name: string | null;
  role_label: string | null;
  email: string | null;
  siren: string | null;
  company_name: string | null;
  contract_number: string | null;
  titulaire_number: string | null;
  cf_number: string | null;
  cf_name: string | null;
  status: string;
  activation_date: string | null;
  commitment_end_date: string | null;
  billing_date: string | null;
  portability_date: string | null;
  list_name: string | null;
  plan_name: string | null;
  terminal_communicating: string | null;
  terminal_purchased: string | null;
  imei_communicating: string | null;
  imei_purchased: string | null;
  out_of_bundle: number | null;
  sim_format: string | null;
  vpn_identifier: string | null;
  private_number: string | null;
  terminal_change_date: string | null;
  plan_change_date: string | null;
  is_secondary_line: boolean;
  main_line_number: string | null;
  master_access_id: string | null;
  offer_type: string | null;
  company_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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
  wapt_status: string | null;
  wapt_reachable: string | null;
  wapt_last_seen: string | null;
  wapt_last_user: string | null;
  wapt_groups: string | null;
  wapt_domain: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetDetailItem extends AssetItem {
  external_data: Record<string, unknown> | null;
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
  rio: string | null;
  qr_code: string | null;
  eid: string | null;
  csim_number: string | null;
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
  has_secrets: boolean;
  created_at: string;
  updated_at: string;
}

export interface MobileSecrets {
  pin_1: string | null;
  pin_2: string | null;
  puk_1: string | null;
  puk_2: string | null;
}

export interface SupplierContactItem {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}

export interface SupplierItem {
  id: string;
  name: string;
  type: string | null;
  siret: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  contacts: SupplierContactItem[];
  asset_count: number;
  license_count: number;
  created_at: string;
  updated_at: string;
}

export interface LicenseItem {
  id: string;
  name: string;
  vendor: string | null;
  license_type: string | null;
  seats: number | null;
  seats_used: number | null;
  start_date: string | null;
  end_date: string | null;
  contract_id: string | null;
  annual_cost: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovementItem {
  id: string;
  asset_id: string | null;
  asset: { id: string; asset_tag: string; name: string } | null;
  category_id: string | null;
  category: AssetCategoryItem | null;
  direction: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  moved_at: string;
  created_by_id: string | null;
  created_by_label: string | null;
}

export interface StockSummaryItem {
  category_id: string;
  category_name: string;
  in_stock: number;
  in_service: number;
  maintenance: number;
  broken: number;
  total: number;
}

export interface TicketCategoryItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sla_hours: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface TicketStatusItem {
  id: string;
  code: string;
  name: string;
  is_closed: boolean;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface TicketPriorityItem {
  id: string;
  code: string;
  name: string;
  level: number;
  color: string | null;
  response_hours: number | null;
  resolution_hours: number | null;
  is_active: boolean;
}

export interface TicketUserRef {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface TicketItem {
  id: string;
  reference: string;
  subject: string;
  description: string | null;
  requester_agent_id: string | null;
  requester_agent: AgentRef | null;
  service_id: string | null;
  service: ServiceItem | null;
  category_id: string;
  category: TicketCategoryItem;
  priority_id: string;
  priority: TicketPriorityItem;
  status_id: string;
  status: TicketStatusItem;
  assignee_user_id: string | null;
  assignee: TicketUserRef | null;
  source: string;
  opened_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  due_at: string | null;
  resolution: string | null;
  time_spent_minutes: number;
  satisfaction_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface TicketCommentItem {
  id: string;
  body: string;
  is_internal: boolean;
  author: TicketUserRef | null;
  created_at: string;
  edited_at: string | null;
}

export interface TicketHistoryItem {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
}

export interface TicketTimeEntryItem {
  id: string;
  user_id: string | null;
  minutes: number;
  performed_on: string;
  comment: string | null;
  created_at: string;
}

export interface TicketDetailItem extends TicketItem {
  assets: { id: string; asset_tag: string; name: string }[];
  comments: TicketCommentItem[];
  history: TicketHistoryItem[];
  time_entries: TicketTimeEntryItem[];
}

export interface TicketMeta {
  categories: TicketCategoryItem[];
  statuses: TicketStatusItem[];
  priorities: TicketPriorityItem[];
  status_counts: { code: string; name: string; count: number }[];
  open_count: number;
  unassigned_count: number;
}

export interface InterventionItem {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  ticket_id: string | null;
  ticket_reference: string | null;
  asset_id: string | null;
  asset_label: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  type: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  technician_user_id: string | null;
  technician: TicketUserRef | null;
  status: string;
  report: string | null;
  duration_minutes: number | null;
  cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface RgpdDeadline {
  id: string;
  kind: string;
  label: string;
  due_date: string | null;
  status: string;
  link: string;
}

export interface RgpdOverview {
  processing_total: number;
  processing_active: number;
  collections_total: number;
  open_requests: number;
  open_rights: number;
  open_breaches: number;
  reviews_due: number;
  deadlines: RgpdDeadline[];
}

export interface ProcessingActivityItem {
  id: string;
  reference: string;
  name: string;
  purpose: string | null;
  legal_basis: string | null;
  data_categories: string | null;
  data_subjects: string | null;
  recipients: string | null;
  retention_period: string | null;
  security_measures: string | null;
  suppliers: string | null;
  owner_user_id: string | null;
  owner: TicketUserRef | null;
  dpo_notes: string | null;
  status: string;
  last_review_at: string | null;
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataCollectionItem {
  id: string;
  name: string;
  collection_type: string;
  purpose: string | null;
  processing_activity_id: string | null;
  processing_activity: ProcessingActivityItem | null;
  data_categories: string | null;
  subjects_count: number | null;
  collected_at: string | null;
  retention_end: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DpoRequestItem {
  id: string;
  reference: string;
  subject: string;
  requester_name: string | null;
  requester_type: string | null;
  description: string | null;
  response: string | null;
  recommendations: string | null;
  due_date: string | null;
  status: string;
  closed_at: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RightsRequestItem {
  id: string;
  reference: string;
  request_type: string;
  requester_name: string | null;
  processing_activity_id: string | null;
  processing_activity: ProcessingActivityItem | null;
  received_at: string | null;
  due_date: string | null;
  status: string;
  response: string | null;
  resolution: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataBreachItem {
  id: string;
  reference: string;
  occurred_at: string | null;
  discovered_at: string | null;
  description: string | null;
  severity: string;
  affected_count: number | null;
  containment: string | null;
  cnil_notified_at: string | null;
  subjects_notified_at: string | null;
  status: string;
  lessons_learned: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractCategoryItem {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface ContractItem {
  id: string;
  supplier_id: string;
  supplier: SupplierItem;
  reference: string;
  object: string;
  category_id: string | null;
  category: ContractCategoryItem | null;
  start_date: string | null;
  end_date: string | null;
  duration_months: number | null;
  amount_ht: number | null;
  amount_ttc: number | null;
  vat_rate: number | null;
  annual_cost: number | null;
  monthly_cost: number | null;
  notice_days: number | null;
  auto_renew: boolean;
  responsible_user_id: string | null;
  responsible: TicketUserRef | null;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  comments: string | null;
  days_to_end: number | null;
  alert_level: string | null;
  renewal_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategoryItem {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface BudgetLineItem {
  id: string;
  budget_id: string;
  category_id: string;
  category: BudgetCategoryItem;
  label: string;
  planned_amount: number | null;
  voted_amount: number | null;
  contract_id: string | null;
  notes: string | null;
  committed_amount: number;
  invoiced_amount: number;
  available_amount: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetCommitmentItem {
  id: string;
  budget_line_id: string;
  line_label: string | null;
  reference: string | null;
  object: string;
  amount_ht: number | null;
  amount_ttc: number | null;
  ordered_at: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  contract_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetInvoiceItem {
  id: string;
  budget_line_id: string;
  line_label: string | null;
  commitment_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  amount_ht: number | null;
  amount_ttc: number | null;
  vat_rate: number | null;
  paid_at: string | null;
  status: string;
  supplier_id: string | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetItem {
  id: string;
  year: number;
  name: string;
  status: string;
  planned_total: number | null;
  voted_total: number | null;
  committed_total: number;
  invoiced_total: number;
  paid_total: number;
  available_total: number;
  notes: string | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetDetailItem extends BudgetItem {
  lines: BudgetLineItem[];
  commitments: BudgetCommitmentItem[];
  invoices: BudgetInvoiceItem[];
}

export interface InfraEquipmentItem {
  id: string;
  asset_id: string | null;
  asset: { id: string; asset_tag: string; name: string } | null;
  name: string;
  type: string;
  ip_address: string | null;
  mac_address: string | null;
  role: string | null;
  location_id: string | null;
  location: LocationItem | null;
  os_name: string | null;
  os_version: string | null;
  config_notes: string | null;
  criticality: string;
  status: string;
  responsible_user_id: string | null;
  responsible: TicketUserRef | null;
  parent_id: string | null;
  map_x: number | null;
  map_y: number | null;
  last_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfraDependencyItem {
  id: string;
  source_id: string;
  source_name: string;
  target_id: string;
  target_name: string;
  dependency_type: string;
  description: string | null;
}

export interface MonitoringCheckItem {
  id: string;
  infra_id: string;
  infra_name: string;
  check_type: string;
  config_json: string | null;
  interval_seconds: number;
  is_enabled: boolean;
  requires_authorization: boolean;
  authorized_by_id: string | null;
  authorized_by: TicketUserRef | null;
  authorized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitoringResultItem {
  id: string;
  check_id: string;
  checked_at: string;
  status: string;
  latency_ms: number | null;
  message: string | null;
}

export interface SecurityIncidentItem {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  severity: string;
  category: string;
  detected_at: string;
  status: string;
  owner_user_id: string | null;
  owner: TicketUserRef | null;
  actions_taken: string | null;
  corrective_measures: string | null;
  lessons_learned: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityActionItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  due_date: string | null;
  owner_user_id: string | null;
  owner: TicketUserRef | null;
  status: string;
  evidence: string | null;
  incident_id: string | null;
  incident_reference: string | null;
  asset_id: string | null;
  asset_label: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VulnerabilityItem {
  id: string;
  title: string;
  cve_id: string | null;
  cvss_score: number | null;
  severity: string;
  asset_id: string | null;
  asset_label: string | null;
  detected_at: string | null;
  source: string | null;
  status: string;
  remediation: string | null;
  due_date: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupCheckItem {
  id: string;
  scope: string;
  backup_type: string | null;
  run_at: string;
  status: string;
  size_bytes: number | null;
  duration_minutes: number | null;
  restore_tested_at: string | null;
  restore_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificateItem {
  id: string;
  common_name: string;
  issuer: string | null;
  valid_from: string | null;
  valid_to: string;
  owner_user_id: string | null;
  owner: TicketUserRef | null;
  status: string;
  auto_renew: boolean;
  notes: string | null;
  days_to_expiry: number | null;
  alert_level: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityAuditItem {
  id: string;
  title: string;
  auditor: string | null;
  type: string | null;
  planned_at: string | null;
  completed_at: string | null;
  status: string;
  findings: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityOverview {
  open_incidents: number;
  critical_incidents: number;
  open_actions: number;
  overdue_actions: number;
  open_vulnerabilities: number;
  critical_vulnerabilities: number;
  expiring_certificates: number;
  last_backup_status: string | null;
  last_backup_at: string | null;
}

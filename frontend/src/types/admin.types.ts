export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_banned: boolean;
  is_active: boolean;
  analyses_count: number;
  chat_messages_count: number;
  last_login: string | null;
  created_at: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  google_id: string | null;
  github_id: string | null;
  analyses: Record<string, unknown>[];
  recent_activity: Record<string, unknown>[];
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  total: number;
  skip: number;
  limit: number;
}

export interface UserPatchRequest {
  is_admin?: boolean;
  is_banned?: boolean;
  is_active?: boolean;
}

export interface AdminChatSessionSummary {
  session_id: string;
  user_email: string;
  user_name: string | null;
  repo_name: string;
  ai_provider: string;
  status: string;
  message_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface AdminChatSessionListResponse {
  items: AdminChatSessionSummary[];
  total: number;
  skip: number;
  limit: number;
}

export interface ProviderStats {
  enabled: boolean;
  is_default: boolean;
  api_key_configured: boolean;
  total_requests: number;
  total_cost_usd: number;
  avg_response_time_ms: number | null;
}

export interface ProviderUpdateRequest {
  enabled?: boolean;
  is_default?: boolean;
}

export interface ProviderTestResponse {
  success: boolean;
  latency_ms: number | null;
  message: string;
}

export interface SystemSettingsResponse {
  rate_limits: Record<string, unknown>;
  feature_flags: Record<string, unknown>;
  ai_defaults: Record<string, unknown>;
  security: Record<string, unknown>;
}

export interface OverviewStats {
  total_users: number;
  active_users_7d: number;
  total_analyses: number;
  analyses_24h: number;
  total_chats: number;
  avg_followups: number;
  ai_requests_24h: number;
}

export interface AuditLogEntry {
  id: string;
  admin_email: string | null;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  skip: number;
  limit: number;
}

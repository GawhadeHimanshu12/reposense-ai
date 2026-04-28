export interface User {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  google_id: string | null;
  github_id: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_admin: boolean;
  last_login: string | null;
  created_at: string;
}

export interface UserStats {
  member_since: string;
  total_analyses_completed: number;
  total_questions_asked: number;
  favorite_language: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

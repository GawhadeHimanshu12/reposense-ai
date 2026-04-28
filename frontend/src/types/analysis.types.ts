export type SessionStatus = "pending" | "analyzing" | "completed" | "failed" | "deleted";

export interface AnalysisDetail {
  summary: string | null;
  tech_stack: Record<string, unknown> | null;
  architecture: Record<string, unknown> | null;
  code_quality: Record<string, unknown> | null;
  security: Record<string, unknown> | null;
  performance: Record<string, unknown> | null;
  scalability: Record<string, unknown> | null;
  recommendations: string[] | null;
  complexity_score: number | null;
  complexity_explanation: string | null;
  code_quality_score: number | null;
  security_score: number | null;
  maintainability_score: number | null;
}

export interface RepoData {
  metadata?: {
    name?: string;
    full_name?: string;
    description?: string | null;
    language?: string | null;
    stars?: number;
    forks?: number;
    open_issues?: number;
    topics?: string[];
    [key: string]: unknown;
  };
  languages: Record<string, number>;
  file_tree?: string[];
  file_extensions?: Record<string, number>;
  folder_structure?: string[];
  key_files?: Record<string, string>;
  rag_documents?: Record<string, string>;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export type InsightSeverity = "info" | "warning" | "critical";

export interface AnalysisInsight {
  id: string;
  category: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  file_path: string | null;
  line_number?: number | null;
}

export interface Repository {
  id: string;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  is_private: boolean;
  topics: string[];
  created_at: string;
}

export interface RepositoryAnalysis {
  id: string;
  repository_id: string;
  status: "pending" | "running" | "completed" | "failed";
  ai_provider: string;
  summary: string | null;
  code_quality_score: number | null;
  security_score: number | null;
  maintainability_score: number | null;
  insights: AnalysisInsight[];
  error_message?: string | null;
  created_at: string;
}

export interface AnalysisSession {
  session_id: string;
  status: SessionStatus;
  repo_url: string;
  repo_name: string;
  repo_data: RepoData | null;
  analysis: AnalysisDetail | null;
  ai_provider: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AnalysisSessionSummary {
  session_id: string;
  repo_name: string;
  repo_url: string;
  ai_provider: string;
  status: SessionStatus;
  created_at: string;
  completed_at: string | null;
}

export interface AnalyzeRequest {
  repo_url: string;
}

export interface AnalyzeResponse {
  session_id: string;
  status: SessionStatus;
}

export interface RateLimitBucket {
  used: number;
  limit: number;
  remaining: number;
  resets_at: string | null;
}

export interface RepoRateLimit {
  repo_analysis: RateLimitBucket;
}

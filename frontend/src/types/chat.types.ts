export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tokens_used: number | null;
  created_at: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
}

export interface SendMessageRequest {
  message: string;
}

export interface SendMessageResponse {
  message_id: string;
  response: string;
  follow_up_suggestions: string[];
  followup_count: number;
  followups_remaining: number;
}

export interface FollowupRemaining {
  used: number;
  remaining: number;
  limit: number;
}

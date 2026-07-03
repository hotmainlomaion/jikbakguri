export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AtlasError {
  ok: false;
  error: string;
}

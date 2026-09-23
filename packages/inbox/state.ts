export type InboxAction = "TAKE_OVER" | "RETURN_TO_AI" | "MARK_READ" | "CLOSE" | "REOPEN";

export type ConversationControlState = {
  aiEnabled: boolean;
  status: string;
  unreadCount: number;
};

export function conversationMode(state: Pick<ConversationControlState, "aiEnabled" | "status">) {
  if (state.status === "CLOSED") return "CLOSED" as const;
  return state.aiEnabled ? "AI" as const : "HUMAN" as const;
}

export function applyInboxAction(state: ConversationControlState, action: InboxAction): ConversationControlState {
  switch (action) {
    case "TAKE_OVER":
      return { ...state, aiEnabled: false, status: state.status === "CLOSED" ? "OPEN" : state.status };
    case "RETURN_TO_AI":
      return { ...state, aiEnabled: true, status: "OPEN" };
    case "MARK_READ":
      return { ...state, unreadCount: 0 };
    case "CLOSE":
      return { ...state, aiEnabled: false, status: "CLOSED" };
    case "REOPEN":
      return { ...state, status: "OPEN" };
  }
}

export function canAccessArtist(role: string, userId: string, artistUserId: string | null) {
  return role === "OWNER" || (role === "ARTIST" && artistUserId === userId);
}

export function shouldRunAi(state: Pick<ConversationControlState, "aiEnabled" | "status">) {
  return state.aiEnabled && state.status !== "CLOSED";
}

"use client";

import { useState } from "react";

export function DemoBooking() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState(
    "Hi! I’m Mike’s AI receptionist. What tattoo are you thinking about?"
  );

  async function send() {
    if (!message.trim()) return;
    const current = message;
    setMessage("");
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: current })
    });
    const data = await res.json();
    setReply(data.reply);
  }

  return (
    <section style={{ background: "white", padding: 24, borderRadius: 12, maxWidth: 650 }}>
      <div style={{ minHeight: 120, padding: 16, background: "#eee", borderRadius: 8 }}>
        <strong>AI:</strong> {reply}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Try: I want a 7 inch black and gray lion..."
          style={{ flex: 1, padding: 12 }}
        />
        <button onClick={send} style={{ padding: "12px 18px" }}>Send</button>
      </div>
    </section>
  );
}

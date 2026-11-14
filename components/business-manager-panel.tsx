'use client';

import { useState, useRef, useEffect, CSSProperties } from 'react';
import UiIcon from './ui-icon';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type BusinessManagerPanelProps = {
  firstName?: string;
};

export function BusinessManagerPanel({ firstName = 'there' }: BusinessManagerPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with greeting message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: '1',
        role: 'assistant',
        content: `Hi ${firstName}! I'm your Maia Business Manager. I can walk you through setup or help you check your bookings, unpaid invoices, and revenue. If you're still setting up, I'll show you what's next and take you to the right screen.`,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, firstName, messages.length]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 700);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/business-manager/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      if (!response.ok) throw new Error('Failed to get response');
      const data = await response.json();

      const assistantMessage: Message = {
        id: String(Date.now()),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: String(Date.now()),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleStarterChip = (action: string) => {
    setInput(action);
    inputRef.current?.focus();
  };

  if (isMobile && isOpen) {
    // Mobile full-screen view
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          bottom: 0,
        }}
      >
        {/* Mobile Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e4e5e6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 56,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Business Manager</h2>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#111',
              padding: '4px 8px',
            }}
            aria-label="Close Business Manager"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 8,
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 14,
                  lineHeight: 1.5,
                  background: msg.role === 'user' ? '#111' : '#f0f0f0',
                  color: msg.role === 'user' ? '#fff' : '#111',
                  wordWrap: 'break-word',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {messages.length === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => handleStarterChip('Walk me through setup')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e4e5e6',
                  background: '#f9f9f9',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                  transition: 'background 0.2s',
                }}
              >
                ✦ Walk me through setup
              </button>
              <button
                onClick={() => handleStarterChip('This week\'s bookings')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e4e5e6',
                  background: '#f9f9f9',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                📅 This week's bookings
              </button>
              <button
                onClick={() => handleStarterChip('Unpaid invoices')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e4e5e6',
                  background: '#f9f9f9',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                📋 Unpaid invoices
              </button>
              <button
                onClick={() => handleStarterChip('Monthly revenue')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e4e5e6',
                  background: '#f9f9f9',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                $ Monthly revenue
              </button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Mobile Composer - stays above keyboard */}
        <div
          style={{
            borderTop: '1px solid #e4e5e6',
            padding: '12px 16px',
            background: '#fff',
          }}
        >
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about setup, bookings, invoices..."
              style={{
                flex: 1,
                border: '1px solid #e4e5e6',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                resize: 'none',
                minHeight: 40,
                maxHeight: 80,
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 14px',
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                opacity: loading || !input.trim() ? 0.6 : 1,
                fontSize: 13,
                fontWeight: 600,
                minWidth: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {loading ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Desktop view
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#111',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 100,
        }}
        aria-label="Open Business Manager"
      >
        ✦
      </button>
    );
  }

  // Desktop panel
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 360,
        height: 520,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* Desktop Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #e4e5e6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Business Manager</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              color: '#666',
              padding: '4px 6px',
            }}
            aria-label={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? '−' : '+'}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: '#999',
              padding: '4px 6px',
            }}
            aria-label="Close Business Manager"
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 6,
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.4,
                background: msg.role === 'user' ? '#111' : '#f0f0f0',
                color: msg.role === 'user' ? '#fff' : '#111',
                wordWrap: 'break-word',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {messages.length === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            <button
              onClick={() => handleStarterChip('Walk me through setup')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #e4e5e6',
                background: '#fafafa',
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
                transition: 'background 0.2s',
              }}
            >
              ✦ Walk me through setup
            </button>
            <button
              onClick={() => handleStarterChip('This week\'s bookings')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #e4e5e6',
                background: '#fafafa',
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
              }}
            >
              📅 This week's bookings
            </button>
            <button
              onClick={() => handleStarterChip('Unpaid invoices')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #e4e5e6',
                background: '#fafafa',
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
              }}
            >
              📋 Unpaid invoices
            </button>
            <button
              onClick={() => handleStarterChip('Monthly revenue')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #e4e5e6',
                background: '#fafafa',
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
              }}
            >
              $ Monthly revenue
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Desktop Composer */}
      <form
        onSubmit={handleSendMessage}
        style={{
          borderTop: '1px solid #e4e5e6',
          padding: '10px 12px',
          display: 'flex',
          gap: 6,
          background: '#fff',
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question..."
          style={{
            flex: 1,
            border: '1px solid #e4e5e6',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'none',
            minHeight: 32,
            maxHeight: 60,
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 12px',
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            opacity: loading || !input.trim() ? 0.6 : 1,
            fontSize: 12,
            fontWeight: 600,
            minWidth: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading ? '...' : '→'}
        </button>
      </form>
    </div>
  );
}

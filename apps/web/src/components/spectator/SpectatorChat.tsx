'use client';

import { useRef, useEffect } from 'react';
import { useSpectatorChatStore } from '@/store/spectatorChat';
import { useAuthStore } from '@/store/auth';
import { useWebSocket } from '@/hooks/useWebSocket';

interface SpectatorChatProps {
  gameId: string;
}

export function SpectatorChat({ gameId }: SpectatorChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, chatInputValue, setChatInputValue } = useSpectatorChatStore();
  const { user } = useAuthStore();
  const { sendSpectatorChat } = useWebSocket();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = chatInputValue.trim();
    if (!trimmed || !user) return;

    sendSpectatorChat(gameId, trimmed);
    setChatInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="card h-full flex flex-col">
      <p className="text-xs font-mono text-mid-light mb-3">spectator_chat</p>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[200px] max-h-[300px]">
        {messages.length === 0 ? (
          <p className="text-mid font-mono text-xs text-center py-4">
            no messages yet
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-sm font-mono ${
                msg.userId === user?.id ? 'text-usdc' : 'text-light'
              }`}
            >
              <span className="text-mid-light">{msg.username}:</span>{' '}
              <span className="text-pure-white">{msg.message}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {user ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInputValue}
            onChange={(e) => setChatInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="type a message..."
            className="input flex-1 text-sm"
            maxLength={500}
          />
          <button
            onClick={handleSend}
            disabled={!chatInputValue.trim()}
            className="btn btn-primary px-4 text-sm"
          >
            send
          </button>
        </div>
      ) : (
        <p className="text-xs font-mono text-mid text-center">
          login to chat
        </p>
      )}
    </div>
  );
}

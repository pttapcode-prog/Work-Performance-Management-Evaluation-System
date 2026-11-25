import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Sparkles,
  Bot,
  User as UserIcon,
  KeyRound,
  Eye,
  EyeOff,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../api/client.js';
import WpmesLogo from './WpmesLogo.jsx';

const QUICK_PROMPTS = [
  'Ai chưa đạt chất lượng trong tuần này?',
  'Ai đang chậm deadline và nguyên nhân?',
  'Xem chi tiết công việc của Phan Thắng',
  'Xem chi tiết công việc của Lê Hoàng Nam',
  'Xem chi tiết công việc của Nguyễn Minh Quân',
  'Tổng hợp KPI theo từng dự án tuần này',
];

function renderFormattedText(text) {
  return text.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      return (
        <h4 key={idx} className="font-bold text-slate-900 text-sm mt-2 mb-1">
          {trimmed.replace('### ', '')}
        </h4>
      );
    }
    if (trimmed.startsWith('#### ')) {
      return (
        <h5 key={idx} className="font-semibold text-slate-800 text-xs mt-2 mb-0.5">
          {trimmed.replace('#### ', '')}
        </h5>
      );
    }
    if (!trimmed) return <div key={idx} className="h-1.5" />;

    // Bold **text** parsing
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={idx} className="text-xs leading-relaxed text-slate-700">
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="font-semibold text-slate-900">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <span key={pIdx}>{part}</span>;
        })}
      </p>
    );
  });
}

export default function AICopilotDrawer({
  isOpen,
  onClose,
  weekId,
  projectId,
  onInspectEmployee,
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Xin chào! Tôi là **WPMES AI Copilot** — trợ lý phân tích hiệu suất công việc & KPI trực tiếp từ dữ liệu hệ thống WPMES.\nHãy hỏi tôi về **ai chưa đạt chất lượng**, **ai chậm deadline**, hoặc **chi tiết công việc của từng nhân sự**!',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('wpmes_gemini_key') || '');
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [showKeyText, setShowKeyText] = useState(false);

  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSaveKey = (val) => {
    setApiKey(val);
    localStorage.setItem('wpmes_gemini_key', val);
  };

  const handleSend = async (promptText) => {
    const query = (promptText ?? input).trim();
    if (!query || loading) return;

    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) setInput('');
    setLoading(true);

    try {
      const res = await api.chatCopilot(query, weekId, projectId, apiKey);
      const botMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        usedGemini: res.usedGemini,
        matchedUserId: res.matchedUserId,
        structuredCards: res.structuredCards || [],
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `❌ Có lỗi khi truy vấn AI Copilot: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-200 bg-gradient-to-r from-[#3370FF] to-[#5E47FF] text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <WpmesLogo size="sm" variant="light" />
          <div>
            <h3 className="text-sm font-bold leading-tight">WPMES AI Copilot</h3>
            <p className="text-[11px] text-blue-100">
              {apiKey ? 'Chế độ Gemini API + Live DB' : 'Chế độ AI Nội bộ + Live DB'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowKeyConfig((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-white/20 transition"
            title="Cấu hình Gemini API Key (tùy chọn)"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 transition"
            title="Đóng Copilot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional Gemini Key Drawer */}
      {showKeyConfig && (
        <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>Google Gemini API Key (Tùy chọn nâng cao)</span>
            {apiKey && <span className="text-emerald-600 font-semibold">Đã cấu hình</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type={showKeyText ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              placeholder="AIzaSy... (để trống vẫn chạy AI nội bộ)"
              className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowKeyText((v) => !v)}
              className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-600"
            >
              {showKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Quick Prompts */}
      <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Câu hỏi gợi ý cho Quản lý / PM
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => handleSend(q)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F7F8FA]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-slate-800 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {msg.role === 'user' ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[#3370FF] text-white text-xs'
                  : 'bg-white border border-slate-200 text-slate-800'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="leading-relaxed">{msg.content}</p>
              ) : (
                <div className="space-y-1">
                  {renderFormattedText(msg.content)}
                  {msg.usedGemini && (
                    <div className="pt-1 text-[10px] text-indigo-600 font-medium">
                      ✨ Tổng hợp bởi Gemini 2.5 Flash từ dữ liệu MongoDB
                    </div>
                  )}
                  {msg.matchedUserId && onInspectEmployee && (
                    <button
                      onClick={() => onInspectEmployee(msg.matchedUserId)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition"
                    >
                      Mở hồ sơ chi tiết 360° <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-500">
              AI đang truy vấn dữ liệu công việc & phân tích KPI...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hỏi AI: ai trễ hạn, ai chưa đạt CL, việc của Thắng..."
          className="flex-1 text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2.5 rounded-xl bg-[#3370FF] text-white hover:bg-[#245BDB] disabled:opacity-50 transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}

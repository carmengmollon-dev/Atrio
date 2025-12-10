
import React from 'react';
import { MessageSquare, Mic, Radio } from 'lucide-react';

interface FloatingChatBubbleProps {
  onClick: () => void;
  isActive: boolean;
  hasNotification?: boolean;
  variant?: 'confession' | 'radio';
}

const FloatingChatBubble: React.FC<FloatingChatBubbleProps> = ({ 
  onClick, 
  isActive, 
  hasNotification,
  variant = 'confession' 
}) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 group flex items-center justify-center animate-fade-in-up"
    >
      <div className="relative">
        {/* Pulsing Ring for active session */}
        {isActive && (
            <div className={`absolute inset-0 rounded-full animate-ping opacity-20 duration-1000 ${variant === 'radio' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
        )}
        
        <div className={`relative w-14 h-14 bg-zinc-900 border rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-300 ${
            variant === 'radio' 
            ? 'border-emerald-500/30 shadow-emerald-900/20 text-emerald-500 hover:border-emerald-500 hover:text-emerald-400' 
            : 'border-amber-500/30 shadow-amber-900/20 text-amber-500 hover:border-amber-500 hover:text-amber-400'
        }`}>
           {variant === 'radio' ? <Radio className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </div>

        {/* Notification Dot */}
        {hasNotification && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 border-2 border-zinc-950 rounded-full flex items-center justify-center">
             <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
          </span>
        )}
      </div>
      
      {/* Tooltip Label */}
      <span className="absolute right-full mr-4 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-medium text-zinc-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none translate-x-2 group-hover:translate-x-0">
        {variant === 'radio' ? 'Volver a la Radio' : 'Volver a la confesión'}
      </span>
    </button>
  );
};

export default FloatingChatBubble;

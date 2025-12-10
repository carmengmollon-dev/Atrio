
import React, { useState, useEffect, useRef } from 'react';
import { Message, UserProfile, SimulatedUser, UserLevel } from '../types';
import { createPenitentSession, generateInitialConfession } from '../services/geminiService';
import { updateStatsForProfile, getProgressToNextLevel } from '../services/gamificationService';
import { CATEGORIES, LEVEL_CONFIG } from '../constants';
import Button from '../components/Button';
import AudioVisualizer from '../components/AudioVisualizer';
import { useVoiceModulator } from '../hooks/useVoiceModulator';
import { Ear, X, MessageSquare, Mic, StopCircle, Sparkles, User, ThumbsUp, ShieldCheck } from 'lucide-react';
import { Chat, GenerateContentResponse } from '@google/genai';

interface ListenerProps {
  topic: string;
  userProfile: UserProfile;
  targetUser: SimulatedUser;
  onExit: () => void;
}

const Listener: React.FC<ListenerProps> = ({ topic, userProfile, targetUser, onExit }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Gamification State
  const [currentProfile, setCurrentProfile] = useState<UserProfile>(userProfile);
  // Using ref to track current profile for interval closure (avoids stale state)
  const profileRef = useRef(userProfile);
  const [sessionInteractionCount, setSessionInteractionCount] = useState(0);
  
  // Voice State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const { start: startVoice, stop: stopVoice, isProcessing: isRecording } = useVoiceModulator({ enabled: isVoiceMode });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const category = CATEGORIES.find(c => c.id === topic);
  const levelConfig = LEVEL_CONFIG[currentProfile.stats.level];

  // Sync ref with state
  useEffect(() => {
    profileRef.current = currentProfile;
  }, [currentProfile]);

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        // Create session with target user's archetype
        const session = createPenitentSession(
            category?.label || 'General',
            targetUser.archetype.systemInstruction
        );
        setChatSession(session);

        // Generate the initial "confession" with the same instruction
        const initialText = await generateInitialConfession(
            category?.label || 'Algo',
            targetUser.archetype.systemInstruction
        );
        
        const penitentMsg: Message = {
          id: 'init',
          role: 'model', // AI plays the penitent
          text: initialText,
          timestamp: Date.now()
        };
        setMessages([penitentMsg]);
      } catch (e) {
        console.error("Failed to init listener session", e);
      } finally {
        setIsLoading(false);
      }
    };
    init();

    // Update stats every minute (60000ms)
    // Uses profileRef.current to get the most up-to-date stats before incrementing
    const interval = setInterval(() => {
       const updated = updateStatsForProfile(profileRef.current, 1, 0, 0);
       setCurrentProfile(updated);
    }, 60000);

    return () => clearInterval(interval);
  }, [topic, category, targetUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleExit = () => {
    // Calculate final stats for session
    // Simulating "Rating" from the penitent based on interaction count
    let reputationEarned = 0;
    if (sessionInteractionCount > 2) reputationEarned += 5; // Good conversation
    if (sessionInteractionCount > 5) reputationEarned += 5; // Deep conversation
    
    // Save final interactions and reputation
    // NOTE: Minutes are already updated by the interval logic
    updateStatsForProfile(profileRef.current, 0, 1, reputationEarned); 
    onExit();
  };

  const handleVoiceToggle = () => {
    if (isRecording) {
        stopVoice();
        setIsVoiceMode(false);
        // Simulate sending the audio message
        handleReply("(Mensaje de voz enviado: La voz ha sido modulada para proteger la identidad)", true);
    } else {
        setIsVoiceMode(true);
        startVoice();
    }
  };

  const handleReply = async (text: string, isAudio = false) => {
    if (!chatSession) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text,
      timestamp: Date.now(),
      isAudio: isAudio
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setSessionInteractionCount(prev => prev + 1);

    try {
      const result = await chatSession.sendMessageStream({ message: text });
      
      let fullText = '';
      const botMsgId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: 'model',
        text: '',
        timestamp: Date.now(),
        isStreaming: true
      }]);

      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        fullText += c.text || '';
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: fullText } : m));
      }
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false } : m));
      
      // Small reputation bump for every interaction
      const updated = updateStatsForProfile(currentProfile, 0, 0, 1);
      setCurrentProfile(updated);

    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/90">
       {/* Header with Halo System */}
       <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950 relative overflow-hidden">
        <div className="flex items-center gap-4 z-10">
          {/* Avatar with Halo */}
          <div className={`relative p-0.5 rounded-full transition-all duration-1000 ${levelConfig.glow}`}>
            <div className={`w-10 h-10 rounded-full bg-zinc-900 border-2 ${levelConfig.color} flex items-center justify-center overflow-hidden`}>
               <Ear className={`w-5 h-5 ${currentProfile.stats.level === 'Santo' ? 'text-yellow-400' : 'text-indigo-400'}`} />
            </div>
            {currentProfile.stats.level === 'Santo' && (
                <div className="absolute inset-0 animate-ping opacity-20 rounded-full bg-yellow-400"></div>
            )}
          </div>
          
          <div>
            <div className="flex items-center gap-2">
                <h2 className="font-serif text-zinc-200 text-sm">{currentProfile.username} <span className="text-zinc-500">({levelConfig.title})</span></h2>
                {currentProfile.stats.level === 'Santo' && <Sparkles className="w-3 h-3 text-yellow-400 animate-pulse" />}
            </div>
            
            {/* XP Bar */}
            <div className="w-32 h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                <div 
                    className="h-full bg-indigo-500 transition-all duration-500" 
                    style={{ width: `${getProgressToNextLevel(currentProfile.stats)}%` }} 
                />
            </div>
          </div>
        </div>

        {/* Target User Info (Who I am listening to) */}
        <div className="hidden md:flex flex-col items-end opacity-70">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-300">{targetUser.username}</span>
                <User className="w-4 h-4 text-zinc-500" />
            </div>
            <span className="text-xs text-indigo-400">{targetUser.archetype.name}</span>
        </div>

        <Button variant="ghost" size="sm" onClick={handleExit}>
          <X className="w-5 h-5" />
        </Button>
      </header>

      <div className="flex-grow p-6 overflow-y-auto flex flex-col gap-6 relative">
        {/* Ambient Particles for High Levels */}
        {currentProfile.stats.level === 'Santo' && (
             <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
                <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-yellow-400 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-yellow-400 rounded-full animate-ping" style={{ animationDuration: '4s' }} />
             </div>
        )}

        {isLoading && (
           <div className="flex flex-col items-center justify-center h-full opacity-50 animate-pulse">
             <div className="w-12 h-12 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-4"></div>
             <p>Conectando con un alma...</p>
           </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
             <div className={`max-w-[80%] p-5 rounded-2xl text-lg ${
               msg.role === 'user' 
               ? 'bg-zinc-800 text-zinc-200 rounded-br-none'
               : 'bg-black/40 border border-zinc-800 text-zinc-300 font-serif italic rounded-bl-none shadow-lg'
             }`}>
               {msg.isAudio && <div className="flex items-center gap-2 text-zinc-400 text-sm italic mb-1"><Mic className="w-3 h-3"/> Voz Modulada</div>}
               {msg.text}
             </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Visualizer */}
      <div className="h-8 flex justify-center items-center overflow-hidden relative bg-black/20">
         <AudioVisualizer isActive={isRecording} color="#818cf8" />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-zinc-950 border-t border-zinc-800">
        {/* Quick replies */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
           {["Te escucho...", "No te juzgo.", "Gracias por confiar."].map(text => (
               <button key={text} onClick={() => handleReply(text)} className="whitespace-nowrap px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors">
                 {text}
               </button>
           ))}
        </div>

        <div className="flex gap-3 items-end">
           {/* Voice Button */}
           <button 
             onClick={handleVoiceToggle}
             className={`p-3 rounded-full transition-all border ${
                 isRecording 
                 ? 'bg-indigo-900/20 border-indigo-500 text-indigo-400 animate-pulse' 
                 : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
             }`}
             title="Responder con voz (Modulada)"
           >
             {isRecording ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
           </button>

           <div className="flex-grow flex gap-2">
                <input 
                    type="text" 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReply(inputValue)}
                    placeholder={isRecording ? "Hablando (Voz anónima activada)..." : "Escribe tu consejo..."}
                    disabled={isRecording}
                    className="flex-grow bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500/50 text-zinc-200 placeholder-zinc-600"
                />
                <Button onClick={() => handleReply(inputValue)} disabled={!inputValue || isRecording} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl w-12 !p-0 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                </Button>
           </div>
        </div>
        <div className="text-center mt-2">
             <span className="text-[10px] text-zinc-600 uppercase tracking-widest flex items-center justify-center gap-2">
                {isRecording ? <><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"/> Modulando Voz en Tiempo Real</> : "Tu identidad está protegida"}
             </span>
        </div>
      </div>
    </div>
  );
};

export default Listener;

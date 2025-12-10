import React, { useState, useEffect, useRef } from 'react';
import { Message, UserProfile, SimulatedUser, HistoryEntry, ChatMessage } from '../types';
import { updateStatsForProfile } from '../services/gamificationService';
import { addPublicConfession, getRadioChatMessages, setBroadcasterStatus, addPublicAudioConfession } from '../services/radioService';
import { saveToHistory, getHistory } from '../services/historyService';
import { CATEGORIES, OFFICIAL_AI_ARCHETYPE } from '../constants';
import Button from '../components/Button';
// Remove useSpeechRecognition as we are replacing it with Live API
// import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useLiveSession } from '../hooks/useLiveSession';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import AudioVisualizer from '../components/AudioVisualizer';
import { Send, Mic, X, StopCircle, BookOpen, Clock, Lock, Wifi, AlertCircle, CheckCircle, ChevronDown, Phone, PhoneOff, Settings2, Volume2, VolumeX, Eye } from 'lucide-react';

interface ConfessionalProps {
  topic: string;
  userProfile: UserProfile;
  targetUser?: SimulatedUser | null;
  onExit: () => void;
  onMinimize?: () => void;
}

// comentario de prueba para hacer un commit

const VOICE_OPTIONS = [
  { id: 'Kore', label: 'Kore', desc: 'Sereno y profundo (Predeterminado)' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Grave y solemne' },
  { id: 'Puck', label: 'Puck', desc: 'Suave y empático' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Neutro y tranquilo' },
  { id: 'Charon', label: 'Charon', desc: 'Autoridad silenciosa' },
];

const Confessional: React.FC<ConfessionalProps> = ({ topic, userProfile, onExit, onMinimize }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // History State
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  // Broadcast State
  const [isPublicBroadcast, setIsPublicBroadcast] = useState(false);
  
  // Voice Selection State
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Live Audience Echo State
  const [radioChatMessages, setRadioChatMessages] = useState<ChatMessage[]>([]);
  const [isChatTTSActive, setIsChatTTSActive] = useState(true);
  const lastReadChatIdRef = useRef<string | null>(null);
  const { speak, stop: stopSpeaking } = useTextToSpeech();

  // Notification / Toast State
  const [notification, setNotification] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const radioChatEndRef = useRef<HTMLDivElement>(null);
  const category = CATEGORIES.find(c => c.id === topic);

  // Live Session Buffer Refs
  const isPublicBroadcastRef = useRef(isPublicBroadcast);
  const userTranscriptBuffer = useRef('');
  const modelTranscriptBuffer = useRef('');

  useEffect(() => {
      isPublicBroadcastRef.current = isPublicBroadcast;
  }, [isPublicBroadcast]);

  // --- LIVE SESSION INTEGRATION ---
  const systemInstruction = `You are "El Confesor", an empathetic, non-judgmental entity. 
  The user is confessing about "${category?.label || topic}". 
  Listen patiently. Keep responses very short, calm, and supportive. 
  Do not lecture. Just be present. Speak in Spanish.`;

  const { connect, disconnect, isConnected, isConnecting, setOnMessage, setOnUserAudio, setOnModelAudio } = useLiveSession({
      systemInstruction,
      voiceName: selectedVoice
  });

  // Handle Live API Messages
  useEffect(() => {
      setOnMessage((msg) => {
          const content = msg.serverContent;
          if (!content) return;

          // 1. Handle Input Transcription (User Voice)
          // Accumulate transcribed text from user
          if (content.inputTranscription?.text) {
               userTranscriptBuffer.current += content.inputTranscription.text;
          }

          // 2. Handle Model Output Transcription (AI Voice -> Text)
          // We prioritize outputTranscription for text representation of audio
          const transcriptionText = content.outputTranscription?.text;
          
          if (transcriptionText) {
             modelTranscriptBuffer.current += transcriptionText;
             
             // Stream to UI immediately
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 if (lastMsg && lastMsg.role === 'model' && lastMsg.isStreaming) {
                     return prev.map((m, i) => i === prev.length - 1 ? { ...m, text: m.text + transcriptionText } : m);
                 } else {
                     return [...prev, {
                         id: Date.now().toString(),
                         role: 'model',
                         text: transcriptionText,
                         timestamp: Date.now(),
                         isStreaming: true
                     }];
                 }
             });
          } else {
              // Fallback for text-only models or mixed modality where text comes in parts
              const modelTextPart = content.modelTurn?.parts?.[0]?.text;
              if (modelTextPart) {
                  modelTranscriptBuffer.current += modelTextPart;
                  setMessages(prev => {
                     const lastMsg = prev[prev.length - 1];
                     if (lastMsg && lastMsg.role === 'model' && lastMsg.isStreaming) {
                         return prev.map((m, i) => i === prev.length - 1 ? { ...m, text: m.text + modelTextPart } : m);
                     } else {
                         return [...prev, {
                             id: Date.now().toString(),
                             role: 'model',
                             text: modelTextPart,
                             timestamp: Date.now(),
                             isStreaming: true
                         }];
                     }
                  });
              }
          }
          
          // 3. Handle Turn Complete (Flush buffers for UI)
          if (content.turnComplete) {
              setMessages(prev => prev.map(m => ({ ...m, isStreaming: false })));

              // Process User Transcript
              if (userTranscriptBuffer.current.trim()) {
                  const text = userTranscriptBuffer.current.trim();
                  
                  // Add user text to UI (since it wasn't there before)
                  setMessages(prev => {
                      return [...prev, {
                          id: Date.now().toString(),
                          role: 'user',
                          text: text,
                          timestamp: Date.now(),
                          isAudio: true
                      }].sort((a, b) => a.timestamp - b.timestamp);
                  });

                  // NOTE: We do NOT broadcast text here if we are in a live call.
                  // We rely on setOnUserAudio to broadcast the real voice.
                  // Only if we were doing text-only chat would we broadcast here, but turnComplete implies model spoke.
                  
                  userTranscriptBuffer.current = '';
              }

              // Process AI Transcript
              if (modelTranscriptBuffer.current.trim()) {
                   // We rely on setOnModelAudio to broadcast the real voice.
                   modelTranscriptBuffer.current = '';
              }
          }
          
          // Handle Interruption
          if (content.interrupted) {
              userTranscriptBuffer.current = '';
              modelTranscriptBuffer.current = '';
              setMessages(prev => prev.map(m => ({ ...m, isStreaming: false })));
          }
      });

      // Handle Real Audio Broadcasting
      setOnUserAudio(async (blob) => {
          if (isPublicBroadcastRef.current) {
               const url = URL.createObjectURL(blob);
               const transcript = userTranscriptBuffer.current.trim() || "(Audio en vivo)";
               await addPublicAudioConfession(url, transcript, userProfile.username);
               setNotification("Tu voz está al aire.");
               setTimeout(() => setNotification(null), 2000);
          }
      });

      setOnModelAudio(async (blob) => {
          if (isPublicBroadcastRef.current) {
              const url = URL.createObjectURL(blob);
              const transcript = modelTranscriptBuffer.current.trim() || "(Voz del Confesor)";
              await addPublicAudioConfession(url, transcript, "El Confesor");
          }
      });

  }, [setOnMessage, setOnUserAudio, setOnModelAudio, userProfile.username]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Load history when toggled
  useEffect(() => {
    if (showHistory) {
        setHistoryEntries(getHistory(userProfile.username));
    }
  }, [showHistory, userProfile.username]);

  // Handle Broadcast Status Presence
  // CRITICAL: Ensure we signal presence when isPublicBroadcast is true
  useEffect(() => {
    let interval: any;
    
    // Function to update status
    const notifyPresence = (active: boolean) => {
        setBroadcasterStatus(userProfile.username, active);
    };

    if (isPublicBroadcast) {
        // Immediately notify
        notifyPresence(true);
        // Then keepalive every 3 seconds
        interval = setInterval(() => {
             notifyPresence(true);
        }, 3000);
    } else {
        // Immediately remove
        notifyPresence(false);
    }

    return () => {
        if (interval) clearInterval(interval);
        // Important: When component unmounts or state changes, we remove status ONLY if it was true
        if (isPublicBroadcast) {
             notifyPresence(false);
        }
    };
  }, [isPublicBroadcast, userProfile.username]);

  // Polling for Radio Chat with TTS
  useEffect(() => {
      let interval: any;
      if (isPublicBroadcast) {
          // Initial load
          const initialMsgs = getRadioChatMessages();
          setRadioChatMessages(initialMsgs);
          if (initialMsgs.length > 0) {
              // Mark last message as read to avoid reading old history
              lastReadChatIdRef.current = initialMsgs[initialMsgs.length - 1].id;
          }

          interval = setInterval(() => {
              const msgs = getRadioChatMessages();
              setRadioChatMessages(msgs);
              
              if (isChatTTSActive && msgs.length > 0) {
                   const lastMsg = msgs[msgs.length - 1];
                   
                   // Check if this is a new message we haven't read yet
                   if (lastMsg.id !== lastReadChatIdRef.current) {
                       lastReadChatIdRef.current = lastMsg.id;
                       
                       // Don't read my own messages
                       if (lastMsg.sender !== 'Tú' && lastMsg.sender !== userProfile.username) {
                           // Speak the message
                           speak(`${lastMsg.sender} dice: ${lastMsg.text}`);
                       }
                   }
              }
          }, 1000);
      } else {
          // If broadcast stops, stop speaking
          stopSpeaking();
      }
      return () => {
          if (interval) clearInterval(interval);
          stopSpeaking();
      };
  }, [isPublicBroadcast, isChatTTSActive, speak, stopSpeaking, userProfile.username]);
  
  useEffect(() => {
      radioChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [radioChatMessages]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || inputValue;
    if (!textToSend.trim()) return;

    setIsTyping(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: Date.now(),
      isAudio: !!textOverride
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    
    // Broadcast if Public
    if (isPublicBroadcast) {
        addPublicConfession(textToSend, userProfile.username);
        setNotification("Confesión enviada al aire.");
        setTimeout(() => setNotification(null), 3000);
    }

    // Save to Personal History
    saveToHistory(userProfile.username, textToSend, topic, isPublicBroadcast);
    
    setTimeout(() => {
        setIsTyping(false);
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleCall = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  const handleEndSession = () => {
    if (isConnected) disconnect();
    updateStatsForProfile(userProfile, 0, 0, 0, 1);
    // Explicitly remove broadcast status on exit
    setBroadcasterStatus(userProfile.username, false);
    onExit();
  };

  const renderHistory = () => (
      <div className="flex-grow overflow-y-auto p-6 space-y-4 animate-fade-in">
          <div className="text-center mb-6">
              <h3 className="font-serif text-xl text-zinc-300">Tu Diario de Almas</h3>
              <p className="text-sm text-zinc-500">Tus confesiones pasadas, guardadas solo para ti.</p>
          </div>
          
          {historyEntries.length === 0 ? (
              <div className="text-center text-zinc-600 mt-10 italic">
                  Aún no has guardado pensamientos en este dispositivo.
              </div>
          ) : (
              historyEntries.map(entry => (
                  <div key={entry.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest bg-zinc-950 px-2 py-1 rounded-md border border-zinc-800 flex items-center gap-1">
                             <Clock className="w-3 h-3"/> {new Date(entry.timestamp).toLocaleDateString()}
                          </span>
                          {entry.wasBroadcast && (
                              <span className="text-[10px] text-amber-500 uppercase tracking-widest flex items-center gap-1">
                                  <Wifi className="w-3 h-3"/> Emitido
                              </span>
                          )}
                      </div>
                      <p className="text-zinc-300 font-serif leading-relaxed text-sm whitespace-pre-wrap">
                          {entry.text}
                      </p>
                  </div>
              ))
          )}
      </div>
  );

  const renderActiveSession = () => {
      const lastMessage = messages[messages.length - 1];
      const isActivity = isConnected || isTyping || !!(lastMessage?.isStreaming);

      return (
      <>
        <div className="flex flex-grow overflow-hidden relative">
            {notification && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
                    <div className={`
                        px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-sm backdrop-blur-md border
                        ${notification.includes('error') ? 'bg-red-900/90 text-red-100 border-red-500/30' : 'bg-emerald-900/90 text-emerald-100 border-emerald-500/30'}
                    `}>
                        {notification.includes('error') ? <AlertCircle className="w-4 h-4"/> : <CheckCircle className="w-4 h-4" />}
                        {notification}
                    </div>
                </div>
            )}

            {isPublicBroadcast ? (
                // --- MIRROR MODE (Broadcast View) ---
                <div className="flex-grow flex flex-col items-center justify-center p-8 relative overflow-hidden animate-fade-in">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/50 via-zinc-950 to-transparent pointer-events-none" />
                    
                    {/* Monitor Visualizer */}
                    <div className="w-full max-w-xl h-40 flex items-center justify-center mb-8 relative z-10 transition-all duration-700">
                        <AudioVisualizer 
                            isActive={isActivity} 
                            color={isConnected ? '#ef4444' : (lastMessage?.role === 'user' ? '#10b981' : '#f59e0b')} 
                        />
                    </div>
                    
                    {/* Monitor Text Display */}
                    <div className="max-w-3xl text-center relative z-10 space-y-6">
                        {messages.length > 0 ? (
                            <>
                                <div className={`text-2xl md:text-3xl font-serif leading-relaxed transition-all duration-500 ${lastMessage?.role === 'user' ? 'text-zinc-100' : 'text-amber-100'}`}>
                                    "{lastMessage?.text}"
                                </div>
                                <div className="text-sm text-zinc-500 uppercase tracking-widest flex items-center justify-center gap-2 animate-fade-in-up">
                                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-red-500 animate-pulse' : 'bg-zinc-700'}`}></span>
                                    {lastMessage?.role === 'user' ? userProfile.username : "El Confesor"}
                                    {lastMessage?.isAudio && <Mic className="w-3 h-3" />}
                                </div>
                            </>
                        ) : (
                            <div className="text-zinc-600 italic font-serif">
                                El micrófono está abierto. Tu voz resonará aquí.
                            </div>
                        )}
                    </div>
                    
                    {/* Hint overlay */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] text-zinc-600 uppercase tracking-widest border border-zinc-800 px-3 py-1 rounded-full bg-zinc-950/50 backdrop-blur-sm">
                        <Eye className="w-3 h-3" /> Modo Espejo Activo
                    </div>
                </div>
            ) : (
                // --- STANDARD CHAT VIEW ---
                <div className="flex-grow flex flex-col overflow-hidden relative">
                    <div className="flex-grow overflow-y-auto p-6 space-y-6">
                        {messages.length === 0 && (
                            <div className="flex h-full flex-col items-center justify-center text-zinc-600 opacity-50 space-y-4">
                                <div className="w-16 h-1 bg-zinc-800 rounded-full"></div>
                                <p className="text-sm font-serif italic text-center max-w-xs">
                                    Este es tu espacio. Escribe o llama para liberarte. <br/>
                                    Nadie responderá. Solo tú escuchas.
                                </p>
                            </div>
                        )}
                        
                        {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl leading-relaxed shadow-lg ${
                                msg.role === 'user' ? 'bg-zinc-800 text-zinc-100 rounded-tr-sm' : 'bg-black/40 border border-zinc-800 text-zinc-300 rounded-tl-sm'
                            }`}>
                            {msg.isAudio && (
                                <div className="flex items-center gap-2 text-xs mb-2 uppercase tracking-widest text-zinc-500">
                                    <Mic className="w-3 h-3"/>
                                    {msg.role === 'user' ? 'Voz Transcrita' : 'Voz del Confesor'}
                                </div>
                            )}
                            {msg.text}
                            </div>
                        </div>
                        ))}
                        
                        {isTyping && (
                        <div className="flex justify-end text-xs text-zinc-600 pr-2">
                            Guardando en el eco...
                        </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
            )}

            {isPublicBroadcast && (
                <div className="absolute right-0 top-0 bottom-0 w-64 z-20 md:static md:flex flex-col animate-fade-in-right transition-all border-l border-zinc-800 bg-zinc-950/90 md:bg-zinc-950/40 backdrop-blur-sm">
                    <div className="p-3 border-b border-zinc-800 bg-amber-900/10 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <Wifi className="w-3 h-3 text-amber-500 animate-pulse"/>
                             <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Eco de la Audiencia</span>
                         </div>
                         <button 
                            onClick={() => setIsChatTTSActive(!isChatTTSActive)}
                            className={`p-1.5 rounded-full transition-colors ${isChatTTSActive ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                            title={isChatTTSActive ? "Silenciar Voz de la Audiencia" : "Escuchar Voz de la Audiencia"}
                         >
                            {isChatTTSActive ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                         </button>
                    </div>
                    <div className="flex-grow overflow-y-auto p-3 space-y-3 font-mono text-xs">
                        {radioChatMessages.length === 0 && (
                            <div className="text-center text-zinc-700 mt-10 italic">
                                Esperando reacciones...
                            </div>
                        )}
                        {radioChatMessages.map((msg, index) => (
                            <div key={index} className="animate-fade-in-up">
                                <span className={`font-bold ${msg.color || 'text-zinc-500'}`}>
                                    {msg.sender}:
                                </span> <span className="text-zinc-400">{msg.text}</span>
                            </div>
                        ))}
                        <div ref={radioChatEndRef} />
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 md:p-6 bg-zinc-900/80 border-t border-zinc-800 backdrop-blur-md relative">
            <div className="relative flex items-end gap-3 max-w-4xl mx-auto">
            
            <div className="absolute -top-6 right-0 flex items-center gap-2 pointer-events-none">
                 {isPublicBroadcast && (
                     <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold flex items-center gap-1 animate-fade-in">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        En Vivo (Frecuencia Pública)
                     </span>
                 )}
            </div>

            {/* CALL BUTTON (Replaces Dictation) */}
            <button 
                onClick={toggleCall}
                disabled={isConnecting}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 border shadow-lg flex-shrink-0 relative z-20 ${
                    isConnected
                    ? 'bg-red-600 border-red-500 text-white shadow-red-500/30 scale-105 hover:bg-red-700'
                    : (isConnecting ? 'bg-amber-100 border-amber-300 text-amber-600' : 'bg-zinc-100 border-zinc-300 text-zinc-600 hover:bg-white hover:scale-105')
                }`}
                title={isConnected ? "Desactivar Micrófono" : "Activar Micrófono"}
            >
                {isConnected ? <PhoneOff className="w-6 h-6" /> : (isConnecting ? <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <Phone className="w-6 h-6" />)}
            </button>
            
            <div className={`flex-grow bg-zinc-900 border rounded-2xl transition-all ${isPublicBroadcast ? 'border-amber-500/30 focus-within:border-amber-500/60' : 'border-zinc-800 focus-within:border-zinc-600'}`}>
                <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isConnected ? "Habla o escribe para responder..." : (isPublicBroadcast ? "Escribe para transmitir..." : "Escribe tu confesión...")}
                rows={1}
                disabled={false} 
                className={`w-full bg-transparent p-4 text-zinc-200 focus:outline-none resize-none max-h-32 min-h-[56px] ${isConnected ? 'opacity-80' : ''}`}
                style={{ height: 'auto', overflow: 'hidden' }}
                />
            </div>
            
            <button
                onClick={() => setIsPublicBroadcast(!isPublicBroadcast)}
                className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center transition-all border ${
                    isPublicBroadcast 
                    ? 'bg-amber-900/20 text-amber-500 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                    : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300'
                }`}
                title={isPublicBroadcast ? "Transmitiendo al Aire" : "Modo Privado"}
            >
                 {isPublicBroadcast ? <Wifi className="w-5 h-5 animate-pulse" /> : <Lock className="w-5 h-5" />}
            </button>

            <Button 
                onClick={() => handleSend()} 
                disabled={!inputValue.trim() || isTyping || isConnected}
                className={`rounded-full w-12 h-12 !p-0 flex-shrink-0 ${isPublicBroadcast ? '!bg-amber-500 hover:!bg-amber-400 !shadow-amber-500/20' : ''}`}
                title="Enviar Texto"
            >
                <Send className="w-5 h-5" />
            </Button>
            </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col h-full bg-black/40 backdrop-blur-sm relative">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400">
             {category?.icon}
          </div>
          
          <div>
            <h2 className="font-serif text-zinc-200 text-sm">Espacio de {category?.label}</h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>Reflexión personal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-full bg-transparent text-zinc-500 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800 transition-all mr-2"
                title="Configuración de Voz"
            >
                <Settings2 className="w-5 h-5" />
            </button>

            {onMinimize && (
                <button
                    onClick={onMinimize}
                    className="p-2 rounded-full bg-transparent text-zinc-500 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800 transition-all mr-2"
                    title="Minimizar"
                >
                    <ChevronDown className="w-5 h-5" />
                </button>
            )}
            <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-full transition-all border ${showHistory ? 'bg-amber-900/30 text-amber-200 border-amber-500/30' : 'bg-transparent text-zinc-500 border-zinc-800 hover:text-zinc-200'}`}
                title="Historial"
            >
                <BookOpen className="w-5 h-5" />
            </button>
            <Button variant="ghost" size="sm" onClick={handleEndSession}>
                <X className="w-5 h-5" />
            </Button>
        </div>
      </header>

      {showHistory ? renderHistory() : renderActiveSession()}

      {/* Settings Modal */}
      {isSettingsOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-6 relative shadow-2xl">
                   <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-serif text-zinc-100 flex items-center gap-2">
                            <Volume2 className="w-5 h-5 text-zinc-400" /> Voz del Confesor
                        </h3>
                        <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                   </div>
                   
                   <div className="space-y-3">
                       {VOICE_OPTIONS.map((voice) => (
                           <button
                               key={voice.id}
                               onClick={() => setSelectedVoice(voice.id)}
                               className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between group ${
                                   selectedVoice === voice.id 
                                   ? 'bg-amber-900/20 border-amber-500/40' 
                                   : 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900'
                               }`}
                           >
                               <div>
                                   <div className={`font-medium ${selectedVoice === voice.id ? 'text-amber-100' : 'text-zinc-300'}`}>
                                       {voice.label}
                                   </div>
                                   <div className="text-xs text-zinc-500 mt-1">{voice.desc}</div>
                               </div>
                               {selectedVoice === voice.id && (
                                   <CheckCircle className="w-5 h-5 text-amber-500" />
                               )}
                           </button>
                       ))}
                   </div>
                   
                   <div className="mt-6 text-center text-xs text-zinc-500">
                       {isConnected ? "Los cambios se aplicarán en la próxima llamada." : "Selecciona el tono que mejor resuene contigo."}
                   </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default Confessional;
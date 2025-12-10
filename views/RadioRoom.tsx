
import React, { useState, useEffect, useRef } from 'react';
import { Radio, Volume2, VolumeX, MessageCircle, X, Wifi, Mic, User, Play, ListMusic, ChevronDown, Clock, Calendar, BarChart3, Signal, Send, StopCircle, Trash2, UploadCloud, CheckCircle } from 'lucide-react';
import Button from '../components/Button';
import AudioVisualizer from '../components/AudioVisualizer';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { getNextPublicConfession, getQueuePreview, addRadioChatMessage, getRadioChatMessages, addPublicConfession, addPublicAudioConfession, getActiveBroadcasterNames, getNextConfessionFromAuthor } from '../services/radioService';
import { getAllProfilesWithBroadcasts, getGuestProfile } from '../services/gamificationService';
import { ChatMessage, RadioContent, UserProfile } from '../types';
import { RADIO_BOT_COLORS } from '../constants';
import { useVoiceModulator } from '../hooks/useVoiceModulator';

interface RadioRoomProps {
  onExit: () => void;
  onMinimize?: () => void;
}

const RadioRoom: React.FC<RadioRoomProps> = ({ onExit, onMinimize }) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentContent, setCurrentContent] = useState<RadioContent | null>(null);
  const [displayText, setDisplayText] = useState<string>("Esperando transmisión...");
  
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [isWaiting, setIsWaiting] = useState(true);
  
  // Side Panel State
  const [activeTab, setActiveTab] = useState<'live' | 'channels'>('live');
  const [liveQueue, setLiveQueue] = useState<RadioContent[]>([]);
  const [userChannels, setUserChannels] = useState<UserProfile[]>([]);
  const [selectedChannelUser, setSelectedChannelUser] = useState<string | null>(null);
  const [channelPlaylist, setChannelPlaylist] = useState<RadioContent[]>([]);

  // Broadcaster Mode State
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [pendingLiveUpload, setPendingLiveUpload] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);
  const [activeBroadcasterNames, setActiveBroadcasterNames] = useState<string[]>([]);

  // Audio Logic
  const { speak, stop: stopSpeaking, isSpeaking: isTTSSpeaking } = useTextToSpeech();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isRealAudioPlaying, setIsRealAudioPlaying] = useState(false);

  // Voice Modulator for Broadcaster Mode
  const { start: startRecording, stop: stopRecording, clearAudio, isProcessing: isRecording, latestAudioUrl } = useVoiceModulator({ enabled: isBroadcastModalOpen });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contentTimeoutRef = useRef<number | null>(null);

  // Load Data for Sidebars & Chat Polling
  useEffect(() => {
    // Poll for queue updates and chat updates
    const interval = setInterval(() => {
        setLiveQueue(getQueuePreview());
        setChatMessages(getRadioChatMessages());
        // Reload channels periodically to catch new users
        setUserChannels(getAllProfilesWithBroadcasts());
        setActiveBroadcasterNames(getActiveBroadcasterNames());
    }, 1000); 
    
    // Initial load
    setLiveQueue(getQueuePreview());
    setChatMessages(getRadioChatMessages());
    setUserChannels(getAllProfilesWithBroadcasts());
    setActiveBroadcasterNames(getActiveBroadcasterNames());

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-Upload logic for "Open Mic" mode
  useEffect(() => {
      const uploadLiveSegment = async () => {
        if (latestAudioUrl && pendingLiveUpload && !isRecording) {
            try {
                // Upload immediately as "Live Segment"
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const url = String(latestAudioUrl);
                const desc = `Intervención en Vivo ${timestamp}`;
                const user = 'Locutor en Vivo';
                
                await addPublicAudioConfession(url, desc, user);
                
                setBroadcastSuccess(true);
                setTimeout(() => {
                    setBroadcastSuccess(false);
                    clearAudio();
                }, 2000);
            } catch (e) {
                console.error("Live upload failed", e);
            } finally {
                setPendingLiveUpload(false);
            }
        }
      };

      uploadLiveSegment();
  }, [latestAudioUrl, pendingLiveUpload, isRecording]);

  const playContent = async (content: RadioContent) => {
      // Clear any pending timeout loop
      if (contentTimeoutRef.current) {
          clearTimeout(contentTimeoutRef.current);
          contentTimeoutRef.current = null;
      }

      // Stop any previous audio
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = ""; 
          setIsRealAudioPlaying(false);
      }
      stopSpeaking();

      console.log("Playing content:", content.type, content.id);
      setIsWaiting(false);
      setCurrentContent(content);
      setDisplayText(content.text);
      
      let duration = 5000; // Default fallback

      if (isAudioEnabled) {
          if (content.type === 'audio' && content.audioData) {
              // PLAY REAL AUDIO
              const base64Data = content.audioData;
              const blob = await base64ToBlob(base64Data);
              const blobUrl = URL.createObjectURL(blob);
              
              const audio = new Audio(blobUrl);
              audio.volume = 1.0; 
              audioRef.current = audio;
              
              try {
                  await new Promise<void>((resolve, reject) => {
                      const playAttempt = () => {
                            audio.play()
                            .then(() => {
                                setIsRealAudioPlaying(true);
                                resolve();
                            })
                            .catch(e => {
                                console.error("Audio play failed (autoplay?)", e);
                                resolve(); 
                            });
                      };

                      if (audio.readyState >= 3) { 
                          playAttempt();
                      } else {
                          audio.addEventListener('canplaythrough', playAttempt, { once: true });
                          setTimeout(resolve, 3000);
                      }
                  });

                  if (!isNaN(audio.duration) && isFinite(audio.duration)) {
                     duration = (audio.duration * 1000) + 1000; 
                  } else {
                     duration = 15000; 
                  }
                  
                  audio.onended = () => {
                      setIsRealAudioPlaying(false);
                      URL.revokeObjectURL(blobUrl); // Cleanup
                  };
              } catch (e) {
                  console.error("Audio setup error", e);
              }

          } else {
              // PLAY TTS
              setTimeout(() => {
                speak(content.text, 0.85, 0.9);
              }, 500);
              duration = (content.text.length * 80) + 2000;
          }
      } else {
         duration = Math.min(Math.max(content.text.length * 60, 4000), 10000);
      }
      
      return duration;
  };
  
  // Helper to safely convert base64 back to blob
  const base64ToBlob = async (base64: string): Promise<Blob> => {
      // Basic detection
      let type = 'audio/webm';
      if (base64.startsWith('data:audio/mp4')) type = 'audio/mp4';
      
      const response = await fetch(base64);
      return await response.blob();
  };

  const nextTrackLoop = async () => {
      let content: RadioContent | null = null;
      let nextDuration = 3000;

      if (selectedChannelUser) {
           // 1. Try Playlist (Saved items)
           if (channelPlaylist.length > 0) {
               content = channelPlaylist[0];
               setChannelPlaylist(prev => prev.slice(1));
           } 
           // 2. Try Live Queue for this user
           else {
               // We try to pull a fresh message from the global queue if available for this author
               content = getNextConfessionFromAuthor(selectedChannelUser);
           }
      } else {
           // Global Mix
           content = getNextPublicConfession();
      }

      if (content) {
          nextDuration = await playContent(content);
      } else {
          // Silence / Waiting
          setIsWaiting(true);
          setCurrentContent(null);
          
          if (selectedChannelUser) {
               setDisplayText(`Sintonizando señal de ${selectedChannelUser}...`);
               // Keep looping to check for live updates!
               nextDuration = 2000; 
          } else {
               setDisplayText("El atrio está en silencio. Esperando una voz...");
               nextDuration = 3000;
          }
      }
      
      contentTimeoutRef.current = window.setTimeout(nextTrackLoop, nextDuration);
  };

  // --- Main Effect Trigger ---
  useEffect(() => {
    // Start the loop initially
    contentTimeoutRef.current = window.setTimeout(nextTrackLoop, 1000);

    return () => {
        if (contentTimeoutRef.current) clearTimeout(contentTimeoutRef.current);
        stopSpeaking();
        if (audioRef.current) audioRef.current.pause();
    };
  }, [isAudioEnabled, selectedChannelUser]); 


  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    const randomColor = RADIO_BOT_COLORS[Math.floor(Math.random() * RADIO_BOT_COLORS.length)];
    const msg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'Tú', 
        text: inputValue,
        color: randomColor
    };
    setChatMessages(prev => [...prev, msg]);
    addRadioChatMessage(msg);
    setInputValue('');
  };

  const handleChannelSelect = (user: UserProfile) => {
      setSelectedChannelUser(user.username);
      // Disable auto-play of archives. Only play if live, or if user clicks archive.
      setChannelPlaylist([]); 
      setIsWaiting(true); // Reset visual state briefly
  };

  const handleSpecificTrackClick = async (content: RadioContent) => {
      // Allow manual override of the playlist loop
      const duration = await playContent(content);
      // Resume loop after track finishes (so we go back to monitoring live signals)
      contentTimeoutRef.current = window.setTimeout(nextTrackLoop, duration);
  };

  const switchToLive = () => {
      setSelectedChannelUser(null);
      setChannelPlaylist([]);
      setIsWaiting(true);
      setDisplayText("Sintonizando frecuencia global...");
      // The loop will pick up in the next tick
  };

  // Helper to get full list for display (not just the remaining queue)
  const getFullChannelHistory = () => {
      if (!selectedChannelUser) return [];
      const user = userChannels.find(u => u.username === selectedChannelUser);
      return user?.savedBroadcasts || [];
  };

  // Helper to identify active broadcasters from the Live Queue
  const getActiveBroadcasters = () => {
      // Get unique authors currently in the queue
      const queueAuthors = new Set<string>();
      
      // Add authors from live queue
      liveQueue.forEach(item => queueAuthors.add(item.author));

      // Also include current speaker if global
      if (currentContent && !selectedChannelUser) {
          queueAuthors.add(currentContent.author);
      }
      
      // Add manual live status (Heartbeats from Confessional)
      activeBroadcasterNames.forEach(name => queueAuthors.add(name));

      // Now we have a Set of usernames. We need to return UserProfile objects.
      // 1. Try to find in userChannels (registered users)
      // 2. If not found, create guest profile
      
      const results: UserProfile[] = [];
      const processed = new Set<string>();

      // First pass: existing channels
      userChannels.forEach(u => {
          if (queueAuthors.has(u.username)) {
              results.push(u);
              processed.add(u.username);
          }
      });

      // Second pass: remaining authors (guests or new)
      queueAuthors.forEach(author => {
          if (!processed.has(author)) {
              results.push(getGuestProfile(author));
              processed.add(author);
          }
      });
      
      return results;
  };
  
  // Broadcaster Mode Handlers
  const handleToggleRecord = () => {
      if (isRecording) {
          stopRecording();
          // Flag to trigger the upload effect
          setPendingLiveUpload(true);
      } else {
          startRecording({ modulationEnabled: true });
      }
  };

  return (
    <div className="flex flex-col h-screen bg-black relative overflow-hidden">
        {/* Background Animation */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black opacity-80" />
        
        {/* Header */}
        <header className="relative z-10 flex items-center justify-between p-4 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${isWaiting ? 'bg-zinc-800 text-zinc-500' : 'bg-emerald-500/20 text-emerald-500 animate-pulse'}`}>
                    <Radio className="w-5 h-5"/>
                </div>
                <div>
                    <h2 className="text-zinc-100 font-serif tracking-wide">
                        RADIO EL ATRIO
                    </h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        {selectedChannelUser ? (
                            <span className="text-amber-400">Canal: {selectedChannelUser}</span>
                        ) : (
                            isWaiting ? <span>Señal en espera...</span> : (
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
                                    En directo: <span className="text-zinc-200 font-bold">{currentContent?.author || 'Anónimo'}</span>
                                </span>
                            )
                        )}
                    </p>
                </div>
            </div>
            <div className="flex gap-2">
                {/* Broadcast Button */}
                <button
                    onClick={() => setIsBroadcastModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-900/30 text-amber-500 border border-amber-500/30 hover:bg-amber-900/50 hover:text-amber-400 transition-colors mr-2 animate-pulse"
                    title="Micro Abierto"
                >
                    <Mic className="w-4 h-4" />
                    <span className="text-xs font-bold hidden md:inline">TRANSMITIR</span>
                </button>

                {onMinimize && (
                    <button
                        onClick={onMinimize}
                        className="p-2 rounded-full bg-transparent text-zinc-500 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800 transition-all mr-2"
                        title="Minimizar (Segundo Plano)"
                    >
                        <ChevronDown className="w-5 h-5" />
                    </button>
                )}
                <button 
                    onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                    className={`p-2 rounded-full border transition-colors ${isAudioEnabled ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50' : 'bg-transparent text-zinc-500 border-zinc-800'}`}
                    title={isAudioEnabled ? "Silenciar" : "Activar Audio"}
                >
                    {isAudioEnabled ? <Volume2 className="w-5 h-5"/> : <VolumeX className="w-5 h-5"/>}
                </button>
                <Button variant="ghost" size="sm" onClick={onExit}>
                    <X className="w-5 h-5" />
                </Button>
            </div>
        </header>

        <main className="relative z-10 flex-grow flex flex-col md:flex-row overflow-hidden">
            
            {/* Sidebar: Queue & Channels */}
            <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-zinc-900 bg-zinc-950/50 flex flex-col hidden md:flex">
                <div className="flex border-b border-zinc-900">
                    <button 
                        onClick={() => setActiveTab('live')}
                        className={`flex-1 py-3 text-xs uppercase tracking-wider font-medium ${activeTab === 'live' ? 'text-emerald-400 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        En Vivo ({getActiveBroadcasters().length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('channels')}
                        className={`flex-1 py-3 text-xs uppercase tracking-wider font-medium ${activeTab === 'channels' ? 'text-amber-400 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Canales
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto p-2 space-y-2">
                    {activeTab === 'live' ? (
                        <>
                            {selectedChannelUser && (
                                <button onClick={switchToLive} className="w-full p-2 mb-2 rounded bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-center gap-2 hover:bg-emerald-900/40 transition-colors">
                                    <Radio className="w-3 h-3"/> Escuchar Mezcla Global
                                </button>
                            )}
                            
                            {getActiveBroadcasters().length === 0 ? (
                                <div className="text-center text-zinc-700 text-xs py-4">Nadie transmitiendo ahora</div>
                            ) : (
                                getActiveBroadcasters().map(user => {
                                    const isSelected = selectedChannelUser === user.username;
                                    const msgCount = liveQueue.filter(m => m.author === user.username).length + (currentContent?.author === user.username ? 1 : 0);
                                    const isLiveActive = activeBroadcasterNames.includes(user.username);
                                    
                                    return (
                                        <button 
                                            key={user.username}
                                            onClick={() => handleChannelSelect(user)}
                                            className={`w-full p-3 rounded border flex items-center justify-between group transition-all text-left ${
                                                isSelected
                                                ? 'bg-emerald-900/20 border-emerald-500/40 shadow-lg shadow-emerald-900/10' 
                                                : 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] bg-zinc-800 text-zinc-500 border border-zinc-700`}>
                                                    <User className="w-4 h-4"/>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className={`text-xs truncate font-medium ${isSelected ? 'text-emerald-100' : 'text-zinc-300'}`}>
                                                        {user.username}
                                                    </div>
                                                    <div className="text-[10px] text-emerald-500 truncate flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/>
                                                        {isLiveActive ? 'En el aire' : `Transmitiendo (${msgCount})`}
                                                    </div>
                                                </div>
                                            </div>
                                            {isSelected && <Volume2 className="w-3 h-3 text-emerald-500" />}
                                        </button>
                                    );
                                })
                            )}
                        </>
                    ) : (
                        <>
                           {userChannels.length === 0 ? (
                               <div className="text-center text-zinc-700 text-xs py-4">No hay canales activos</div>
                           ) : (
                               userChannels.map(user => {
                                   const hasContent = user.savedBroadcasts && user.savedBroadcasts.length > 0;
                                   const isOnAir = !selectedChannelUser && currentContent?.author === user.username;

                                   return (
                                   <button 
                                      key={user.username}
                                      onClick={() => handleChannelSelect(user)}
                                      className={`w-full p-3 rounded border text-left flex items-center justify-between transition-colors ${
                                          selectedChannelUser === user.username 
                                            ? 'bg-amber-900/20 border-amber-500/30' 
                                            : (hasContent ? 'bg-zinc-900/30 border-zinc-800 hover:bg-zinc-800' : 'bg-zinc-950/20 border-zinc-900 opacity-60 hover:opacity-100')
                                      }`}
                                   >
                                       <div className="flex items-center gap-2 overflow-hidden">
                                           <User className={`w-4 h-4 flex-shrink-0 ${selectedChannelUser === user.username ? 'text-amber-500' : 'text-zinc-600'}`} />
                                           <span className={`text-sm truncate ${selectedChannelUser === user.username ? 'text-amber-100' : 'text-zinc-400'}`}>{user.username}</span>
                                           
                                           {/* Live Status Indicators in Channel List */}
                                           {isOnAir && (
                                                <span className="flex items-center gap-1 text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-full animate-pulse ml-2 font-bold whitespace-nowrap">
                                                    EN AIRE
                                                </span>
                                           )}
                                       </div>
                                       <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasContent ? 'bg-zinc-950 text-zinc-500' : 'bg-transparent text-zinc-800'}`}>
                                           {user.savedBroadcasts?.length || 0}
                                       </span>
                                   </button>
                                   );
                               })
                           )}
                        </>
                    )}
                </div>
            </div>

            {/* Main Visual & Text Area */}
            <div className="flex-grow flex flex-col items-center p-8 text-center relative border-l border-zinc-900 overflow-y-auto">
                
                {/* Visualizer */}
                <div className="w-full max-w-xl h-32 flex-shrink-0 flex items-center justify-center transition-opacity duration-1000 my-8" style={{ opacity: isWaiting && !selectedChannelUser ? 0.3 : 1 }}>
                    <AudioVisualizer 
                        isActive={(isTTSSpeaking || isRealAudioPlaying) && isAudioEnabled} 
                        color={currentContent?.type === 'audio' ? '#f59e0b' : '#10b981'} 
                    />
                </div>

                {/* Main Content Display */}
                {(!selectedChannelUser || (selectedChannelUser && currentContent)) && (
                    <div className="max-w-2xl w-full min-h-[100px] flex flex-col items-center justify-center gap-4 mb-10">
                        {currentContent?.type === 'audio' && (
                            <div className="flex items-center gap-2 text-amber-500 uppercase tracking-widest text-xs mb-2">
                                <Mic className="w-4 h-4 animate-pulse" /> Reproduciendo Audio Original
                            </div>
                        )}
                        <p className={`text-xl md:text-2xl font-serif leading-relaxed transition-all duration-500 ${isWaiting ? 'text-zinc-600 italic' : 'text-emerald-100'}`}>
                            "{displayText}"
                        </p>
                        {currentContent && (
                            <p className="text-sm text-zinc-500 mt-2">— {currentContent.author}</p>
                        )}
                        {!selectedChannelUser && isWaiting && (
                             <p className="text-xs text-zinc-600 uppercase tracking-widest mt-4">
                                Esperando una voz en la frecuencia global...
                             </p>
                        )}
                    </div>
                )}

                {/* CHANNEL PLAYLIST VIEW */}
                {selectedChannelUser && (
                    <div className="w-full max-w-2xl animate-fade-in-up mt-4">
                        <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
                            <h3 className="text-amber-500 font-serif text-lg flex items-center gap-2">
                                <ListMusic className="w-4 h-4"/> Archivo de {selectedChannelUser}
                            </h3>
                            <span className="text-xs text-zinc-500 uppercase tracking-widest">
                                {getFullChannelHistory().length} Registros
                            </span>
                        </div>
                        
                        <div className="space-y-2 text-left">
                            {getFullChannelHistory().length === 0 ? (
                                <div className="text-center p-8 text-zinc-600 italic border border-zinc-800/50 rounded-xl bg-zinc-900/20">
                                     {activeBroadcasterNames.includes(selectedChannelUser) 
                                        ? "Conectado a la señal en vivo. Esperando voz..." 
                                        : "Este usuario aún no ha compartido grabaciones."}
                                </div>
                            ) : (
                                getFullChannelHistory().map((track) => (
                                    <button 
                                        key={track.id}
                                        onClick={() => handleSpecificTrackClick(track)}
                                        className={`w-full p-4 rounded-xl border flex items-start gap-4 transition-all group ${
                                            currentContent?.id === track.id 
                                            ? 'bg-amber-900/20 border-amber-500/40 shadow-lg shadow-amber-900/10' 
                                            : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className={`p-3 rounded-full flex-shrink-0 ${
                                            currentContent?.id === track.id 
                                            ? 'bg-amber-500 text-black' 
                                            : 'bg-zinc-950 text-zinc-500 group-hover:text-amber-500 group-hover:bg-zinc-900'
                                        }`}>
                                            {currentContent?.id === track.id && (isRealAudioPlaying || isTTSSpeaking) 
                                                ? <Volume2 className="w-5 h-5 animate-pulse" /> 
                                                : (track.type === 'audio' ? <Play className="w-5 h-5 ml-0.5" /> : <MessageCircle className="w-5 h-5" />)
                                            }
                                        </div>
                                        
                                        <div className="flex-grow min-w-0">
                                            <p className={`text-sm font-medium mb-1 truncate ${
                                                currentContent?.id === track.id ? 'text-amber-100' : 'text-zinc-300'
                                            }`}>
                                                {track.text || '(Audio sin título)'}
                                            </p>
                                            <div className="flex items-center gap-3 text-[10px] text-zinc-500 uppercase tracking-wider">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3"/> {new Date(track.timestamp).toLocaleDateString()}
                                                </span>
                                                {track.type === 'audio' && (
                                                    <span className="flex items-center gap-1 text-amber-500/70">
                                                        <Mic className="w-3 h-3"/> Voz
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Live Chat Sidebar */}
            <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-zinc-900 bg-zinc-950/50 flex flex-col h-[40vh] md:h-full">
                <div className="p-3 border-b border-zinc-900 bg-zinc-950/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-emerald-500" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Chat</span>
                    </div>
                    <span className="text-[10px] text-zinc-600">{Math.floor(Math.random() * 10) + 2} Almas</span>
                </div>
                
                <div className="flex-grow overflow-y-auto p-3 space-y-3 font-mono text-xs">
                    {chatMessages.length === 0 && (
                        <div className="text-center text-zinc-700 mt-10 italic text-[10px]">
                            Este chat es para usuarios reales.<br/>Di hola a la nada.
                        </div>
                    )}
                    {chatMessages.map((msg, index) => (
                        <div key={index} className="animate-fade-in-up leading-tight">
                            <span className={`font-bold ${msg.sender === 'Tú' ? 'text-emerald-400' : (msg.color || 'text-zinc-400')} mr-1`}>
                                {msg.sender}:
                            </span>
                            <span className="text-zinc-400 break-words">{msg.text}</span>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-2 bg-zinc-950 border-t border-zinc-900 flex gap-1">
                    <input 
                        className="flex-grow bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50 placeholder-zinc-700"
                        placeholder="Comenta..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button 
                        onClick={handleSendMessage}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1.5 rounded transition-colors"
                    >
                        <MessageCircle className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* OPEN MIC MODAL (Replaces Broadcast Form) */}
            {isBroadcastModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
                    <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-8 relative shadow-2xl flex flex-col items-center">
                        
                        <div className="absolute top-4 right-4">
                            <button onClick={() => { stopRecording(); clearAudio(); setIsBroadcastModalOpen(false); }} className="text-zinc-500 hover:text-white p-2">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {broadcastSuccess ? (
                            <div className="flex flex-col items-center justify-center py-10 space-y-6">
                                <div className="w-20 h-20 rounded-full bg-emerald-900/20 flex items-center justify-center border border-emerald-500/50">
                                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                                </div>
                                <h3 className="text-2xl font-serif text-emerald-100">Enviado al Aire</h3>
                                <p className="text-zinc-500">Tu voz está en la frecuencia.</p>
                            </div>
                        ) : (
                            <>
                                <div className="text-center mb-8">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/20 border border-red-500/30 text-red-500 text-xs font-bold uppercase tracking-widest mb-4">
                                        <Signal className="w-3 h-3 animate-pulse" /> Micro Abierto
                                    </div>
                                    <h3 className="text-3xl font-serif text-zinc-100">
                                        Tu voz en vivo
                                    </h3>
                                    <p className="text-zinc-500 mt-2 text-sm max-w-xs mx-auto">
                                        Mantén presionado o toca para activar el micrófono. Al soltar, se transmitirá inmediatamente.
                                    </p>
                                </div>

                                {/* Main Visualizer */}
                                <div className="w-full h-32 bg-zinc-900/50 rounded-2xl flex items-center justify-center border border-zinc-800 overflow-hidden relative mb-8">
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className={`w-full h-1 bg-zinc-800 ${isRecording ? 'opacity-0' : 'opacity-100'}`}></div>
                                    </div>
                                    <AudioVisualizer isActive={isRecording} color={isRecording ? '#ef4444' : '#52525b'} />
                                    {isRecording && (
                                        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded uppercase tracking-widest animate-pulse shadow-lg shadow-red-500/20">
                                            <span className="w-1.5 h-1.5 bg-white rounded-full"></span> ON AIR
                                        </div>
                                    )}
                                </div>

                                {/* Big Toggle Button */}
                                <button 
                                    onClick={handleToggleRecord}
                                    className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                                        isRecording 
                                        ? 'bg-red-600 text-white shadow-red-600/40 scale-110 border-4 border-red-400' 
                                        : 'bg-zinc-800 text-zinc-400 border-4 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200 hover:border-zinc-500'
                                    }`}
                                >
                                    {isRecording ? <StopCircle className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                                </button>
                                
                                <div className="mt-8 text-xs text-zinc-600 font-mono">
                                    {isRecording ? "GRABANDO..." : "ESPERANDO SEÑAL"}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

        </main>
    </div>
  );
};

export default RadioRoom;

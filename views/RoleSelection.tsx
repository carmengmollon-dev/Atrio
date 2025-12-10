
import React, { useState, useRef, useEffect } from 'react';
import { Role, UserProfile, RadioContent } from '../types';
import { Mic, Radio, LogOut, Trophy, Clock, Heart, Sparkles, Medal, UploadCloud, X, StopCircle, Play, Save, CheckCircle, FileAudio, AlertTriangle, Calendar, Music, Pause, Signal, Wifi } from 'lucide-react';
import Button from '../components/Button';
import { LEVEL_CONFIG } from '../constants';
import { getProgressToNextLevel, saveBroadcastToProfile } from '../services/gamificationService';
import { addPublicAudioConfession } from '../services/radioService';
import { useVoiceModulator } from '../hooks/useVoiceModulator';
import { convertAudioUrlToBase64 } from '../services/radioService';
import AudioVisualizer from '../components/AudioVisualizer';

interface RoleSelectionProps {
  onSelect: (role: Role) => void;
  onBack: () => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect, onBack, currentUser, onLogout }) => {
  
  const levelConfig = currentUser ? LEVEL_CONFIG[currentUser.stats.level] : null;
  const progressToNext = currentUser ? getProgressToNextLevel(currentUser.stats) : 0;

  // Upload Modal State (Legacy)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  // Live Modal State (Directo)
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const [isSendingLive, setIsSendingLive] = useState(false);

  const [uploadTitle, setUploadTitle] = useState('');
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Profile Viewer Modal State
  const [isProfileViewerOpen, setIsProfileViewerOpen] = useState(false);
  const [playingBroadcastId, setPlayingBroadcastId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Hook (Shared for both modals, we enable based on which is open)
  const { start: startVoice, stop: stopVoice, clearAudio, isProcessing: isRecording, latestAudioUrl } = useVoiceModulator({ 
      enabled: isUploadModalOpen || isLiveModalOpen 
  });
  
  // Need local state for manual file uploads if we bypass the voice modulator
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  const activeAudioUrl = uploadedFileUrl || latestAudioUrl;

  // --- Handlers for Legacy Upload ---

  const handleToggleRecord = () => {
      if (!isRecording) {
          setUploadedFileUrl(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          startVoice({ modulationEnabled: true });
      } else {
          stopVoice();
      }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      setUploadError(null);

      if (file) {
          if (file.size > 3 * 1024 * 1024) {
              setUploadError("El archivo es demasiado grande (Máx 3MB para almacenamiento local).");
              return;
          }
          if (isRecording) stopVoice();
          clearAudio();

          const url = URL.createObjectURL(file);
          setUploadedFileUrl(url);
          if (!uploadTitle) {
              setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
          }
      }
  };

  const handleSaveToProfile = async () => {
      if (!activeAudioUrl || !currentUser) return;
      setIsProcessingUpload(true);
      setUploadError(null);

      try {
          const base64Audio = await convertAudioUrlToBase64(activeAudioUrl);
          
          if (base64Audio) {
              const content: RadioContent = {
                  id: Date.now().toString(),
                  author: currentUser.username,
                  text: uploadTitle || '(Legado de voz)',
                  timestamp: Date.now(),
                  type: 'audio',
                  audioData: base64Audio
              };
              
              saveBroadcastToProfile(currentUser.username, content);
              setUploadSuccess(true);
              setTimeout(() => {
                  setUploadSuccess(false);
                  closeUploadModal();
              }, 2000);
          } else {
              setUploadError("Error al procesar el audio.");
          }
      } catch (e) {
          console.error("Error saving to profile", e);
          setUploadError("No se pudo guardar. Es posible que el almacenamiento esté lleno.");
      } finally {
          setIsProcessingUpload(false);
      }
  };

  const closeUploadModal = () => {
      if (isRecording) stopVoice();
      clearAudio();
      setUploadedFileUrl(null);
      setUploadError(null);
      setIsUploadModalOpen(false);
      setUploadTitle('');
  };

  // --- Handlers for Live Mode (Directo) ---

  const handleToggleLiveRecord = () => {
      if (isRecording) {
          stopVoice();
          // We wait for the audio URL to update in the effect below
      } else {
          startVoice({ modulationEnabled: true });
      }
  };

  // Effect to handle auto-send when recording stops in Live Mode
  useEffect(() => {
      const sendLiveAudio = async () => {
          if (isLiveModalOpen && latestAudioUrl && !isRecording && !isSendingLive) {
              setIsSendingLive(true);
              try {
                  if (currentUser) {
                    await addPublicAudioConfession(latestAudioUrl, "Intervención en Directo", currentUser.username);
                    setUploadSuccess(true);
                    setTimeout(() => {
                        setUploadSuccess(false);
                        setIsLiveModalOpen(false);
                        clearAudio();
                    }, 2000);
                  }
              } catch (e) {
                  setUploadError("Error al transmitir.");
              } finally {
                  setIsSendingLive(false);
              }
          }
      };
      
      sendLiveAudio();
  }, [latestAudioUrl, isRecording, isLiveModalOpen, currentUser]);

  const closeLiveModal = () => {
      if (isRecording) stopVoice();
      clearAudio();
      setIsLiveModalOpen(false);
      setUploadSuccess(false);
  };


  // --- Profile Playback ---

  const handlePlayBroadcast = (content: RadioContent) => {
      if (playingBroadcastId === content.id) {
          if (audioRef.current) {
              audioRef.current.pause();
              setPlayingBroadcastId(null);
          }
      } else {
          if (content.audioData) {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            const src = content.audioData.startsWith('data:') 
                ? content.audioData 
                : `data:audio/webm;base64,${content.audioData}`;
            
            const audio = new Audio(src);
            audioRef.current = audio;
            audio.play();
            setPlayingBroadcastId(content.id);
            audio.onended = () => setPlayingBroadcastId(null);
          }
      }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 animate-fade-in relative">
      
      {/* User Dashboard / Profile Card */}
      {currentUser && levelConfig ? (
        <div className="w-full max-w-4xl mb-8 animate-fade-in-up">
           {/* CLICKABLE CONTAINER */}
           <div 
             onClick={() => setIsProfileViewerOpen(true)}
             className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 md:p-8 relative overflow-hidden backdrop-blur-md cursor-pointer group hover:bg-zinc-900/80 hover:border-zinc-700 transition-all shadow-xl"
             title="Ver mi perfil y grabaciones"
           >
              {/* Ambient Glow based on Level */}
              <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px] opacity-20 pointer-events-none ${levelConfig.color.replace('border-', 'bg-')}`} />
              
              <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
                  {/* Avatar & Halo */}
                  <div className={`relative flex-shrink-0`}>
                      <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full border-4 flex items-center justify-center bg-zinc-950 shadow-2xl transition-all duration-700 ${levelConfig.color} ${levelConfig.glow} group-hover:scale-105`}>
                          <Sparkles className={`w-8 h-8 md:w-10 md:h-10 ${levelConfig.color.replace('border-', 'text-')}`} />
                      </div>
                      <div className="absolute -bottom-2 -right-2 bg-zinc-900 border border-zinc-700 rounded-full p-1.5" title="Nivel Actual">
                          <Trophy className="w-4 h-4 text-amber-500" />
                      </div>
                  </div>

                  {/* Info & Stats */}
                  <div className="flex-grow text-center md:text-left w-full">
                      <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                          <div>
                            <h2 className="text-2xl font-serif text-white flex items-center gap-2 justify-center md:justify-start group-hover:text-amber-100 transition-colors">
                                {currentUser.username}
                                {currentUser.stats.level === 'Santo' && <span className="text-yellow-400 text-xs uppercase tracking-widest border border-yellow-500/30 px-2 py-0.5 rounded-full bg-yellow-900/20">Leyenda</span>}
                            </h2>
                            <p className={`text-sm font-medium uppercase tracking-widest ${levelConfig.color.replace('border-', 'text-')}`}>
                                Nivel {currentUser.stats.level} • {levelConfig.title}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-2 md:mt-0 flex-wrap justify-center">
                            
                            {/* LIVE BUTTON (New) */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsLiveModalOpen(true); }}
                                className="px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-red-500 bg-red-900/10 hover:bg-red-900/30 rounded-lg transition-colors border border-red-500/30 hover:border-red-500/60 animate-pulse shadow-lg shadow-red-900/20"
                            >
                                <Signal className="w-3 h-3" /> DIRECTO
                            </button>

                            {/* LEGACY BUTTON */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsUploadModalOpen(true); }}
                                className="px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/40 rounded-lg transition-colors border border-emerald-500/30"
                            >
                                <UploadCloud className="w-3 h-3" /> Grabar Legado
                            </button>

                            {/* LOGOUT BUTTON */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); onLogout(); }}
                                className="px-3 py-1.5 flex items-center gap-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-900/10 rounded-lg transition-colors border border-transparent hover:border-red-900/20"
                            >
                                <LogOut className="w-3 h-3" /> Salir
                            </button>
                          </div>
                      </div>

                      {/* XP Bar */}
                      <div className="relative w-full h-2 bg-zinc-800 rounded-full overflow-hidden mb-6">
                          <div 
                             className={`absolute top-0 left-0 h-full transition-all duration-1000 ${levelConfig.color.replace('border-', 'bg-')}`} 
                             style={{ width: `${progressToNext}%` }}
                          />
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 md:gap-4">
                          <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50 flex flex-col items-center group-hover:bg-zinc-950/80 transition-colors">
                              <span className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Escuchado</span>
                              <span className="text-lg font-mono text-zinc-200">{currentUser.stats.minutesListened}m</span>
                          </div>
                          <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50 flex flex-col items-center group-hover:bg-zinc-950/80 transition-colors">
                              <span className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><Heart className="w-3 h-3"/> Reputación</span>
                              <span className="text-lg font-mono text-emerald-400">+{currentUser.stats.reputation}</span>
                          </div>
                          <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50 flex flex-col items-center group-hover:bg-zinc-950/80 transition-colors">
                              <span className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><Medal className="w-3 h-3"/> Confesiones</span>
                              <span className="text-lg font-mono text-amber-200">{currentUser.stats.confessionsMade}</span>
                          </div>
                      </div>
                  </div>
              </div>
           </div>
        </div>
      ) : (
        /* Guest Header (Minimal) */
        <div className="absolute top-6 right-6 z-20">
           {currentUser && currentUser.isGuest && (
             <button onClick={onLogout} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <span className="text-sm">Invitado: {currentUser.username}</span>
                <LogOut className="w-4 h-4" />
             </button>
           )}
        </div>
      )}

      <div className="w-full max-w-3xl space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-serif text-zinc-100">Elige tu camino</h2>
          <p className="text-zinc-400">Dos formas de encontrar paz en El Atrio.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Penitent Card (Confess) */}
          <button 
            onClick={() => onSelect(Role.PENITENT)}
            className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-zinc-800 p-8 text-left transition-all hover:border-amber-500/30 hover:bg-zinc-800/80 hover:-translate-y-2 hover:shadow-2xl hover:shadow-amber-900/10 h-64 flex flex-col justify-between"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10 flex items-start justify-between">
               <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 group-hover:border-amber-500/20 group-hover:bg-amber-900/20 transition-colors">
                  <Mic className="w-8 h-8 text-amber-500" />
               </div>
               <div className="px-3 py-1 rounded-full bg-zinc-950 border border-zinc-800 text-[10px] uppercase tracking-widest text-zinc-500 group-hover:text-amber-500 transition-colors">
                  Privado o Público
               </div>
            </div>

            <div className="relative z-10">
              <h3 className="text-2xl font-serif text-zinc-100 mb-3 group-hover:text-amber-400 transition-colors">Confesarme</h3>
              <p className="text-sm text-zinc-500 leading-relaxed group-hover:text-zinc-400 pr-4">
                Libera tu carga. Habla con la IA y elige si deseas transmitir tu confesión anónima a la Radio.
              </p>
            </div>
          </button>

          {/* Listener Card (Radio) */}
          <button 
            onClick={() => onSelect(Role.LISTENER)}
            className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-zinc-800 p-8 text-left transition-all hover:border-emerald-500/30 hover:bg-zinc-800/80 hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-900/10 h-64 flex flex-col justify-between"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10 flex items-start justify-between">
              <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 group-hover:border-emerald-500/20 group-hover:bg-emerald-900/20 transition-colors">
                <Radio className="w-8 h-8 text-emerald-400" />
              </div>
               <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-950 border border-zinc-800 text-[10px] uppercase tracking-widest text-zinc-500">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  En Vivo
               </div>
            </div>

            <div className="relative z-10">
              <h3 className="text-2xl font-serif text-zinc-100 mb-3 group-hover:text-emerald-300 transition-colors">Escuchar</h3>
              <p className="text-sm text-zinc-500 leading-relaxed group-hover:text-zinc-400 pr-4">
                Sintoniza la frecuencia colectiva. Escucha confesiones reales de otros usuarios en tiempo real.
              </p>
            </div>
          </button>
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" onClick={onBack}>Volver al inicio</Button>
        </div>
      </div>

      {/* VIEW MY LEGACY MODAL */}
      {isProfileViewerOpen && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in" onClick={() => setIsProfileViewerOpen(false)}>
           <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 relative shadow-2xl flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
               <div className="flex justify-between items-center mb-6 border-b border-zinc-900 pb-4">
                    <div>
                        <h3 className="text-2xl font-serif text-amber-500 flex items-center gap-2">
                           <Music className="w-6 h-6" /> Mis Legados
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            Archivo personal de transmisiones guardadas.
                        </p>
                    </div>
                    <button onClick={() => setIsProfileViewerOpen(false)} className="p-2 bg-zinc-900 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
               </div>

               <div className="flex-grow overflow-y-auto space-y-3 pr-2">
                   {(!currentUser.savedBroadcasts || currentUser.savedBroadcasts.length === 0) ? (
                       <div className="flex flex-col items-center justify-center py-20 text-zinc-600 opacity-70">
                           <Radio className="w-12 h-12 mb-4 opacity-50"/>
                           <p>No tienes grabaciones guardadas aún.</p>
                           <button 
                              onClick={() => { setIsProfileViewerOpen(false); setIsUploadModalOpen(true); }}
                              className="mt-4 text-emerald-500 hover:text-emerald-400 text-sm font-medium"
                           >
                               + Crear primer legado
                           </button>
                       </div>
                   ) : (
                       currentUser.savedBroadcasts.slice().reverse().map((item) => (
                           <div key={item.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                               playingBroadcastId === item.id 
                               ? 'bg-amber-900/20 border-amber-500/40' 
                               : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900'
                           }`}>
                               <button 
                                 onClick={() => handlePlayBroadcast(item)}
                                 className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                     playingBroadcastId === item.id 
                                     ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]' 
                                     : 'bg-zinc-800 text-zinc-400 hover:bg-amber-500 hover:text-black'
                                 }`}
                               >
                                   {playingBroadcastId === item.id ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                               </button>

                               <div className="flex-grow">
                                   <h4 className={`font-medium ${playingBroadcastId === item.id ? 'text-amber-100' : 'text-zinc-300'}`}>
                                       {item.text || 'Grabación sin título'}
                                   </h4>
                                   <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                                       <span className="flex items-center gap-1">
                                           <Calendar className="w-3 h-3" />
                                           {new Date(item.timestamp).toLocaleDateString()}
                                       </span>
                                       <span className="flex items-center gap-1">
                                           <Clock className="w-3 h-3" />
                                           {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                       </span>
                                   </div>
                               </div>
                           </div>
                       ))
                   )}
               </div>
           </div>
        </div>
      )}

      {/* LIVE MODE MODAL (New) */}
      {isLiveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-8 relative shadow-2xl flex flex-col items-center">
                  
                  <div className="absolute top-4 right-4">
                      <button onClick={closeLiveModal} className="text-zinc-500 hover:text-white p-2">
                          <X className="w-6 h-6" />
                      </button>
                  </div>

                  {uploadSuccess ? (
                      <div className="flex flex-col items-center justify-center py-10 space-y-6">
                          <div className="w-20 h-20 rounded-full bg-emerald-900/20 flex items-center justify-center border border-emerald-500/50">
                              <Wifi className="w-10 h-10 text-emerald-400" />
                          </div>
                          <h3 className="text-2xl font-serif text-emerald-100">Transmitido</h3>
                          <p className="text-zinc-500 text-center">Tu voz ha sido enviada a la frecuencia global.</p>
                      </div>
                  ) : (
                      <>
                          <div className="text-center mb-8">
                              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/20 border border-red-500/30 text-red-500 text-xs font-bold uppercase tracking-widest mb-4">
                                  <Signal className="w-3 h-3 animate-pulse" /> Micro Abierto
                              </div>
                              <h3 className="text-3xl font-serif text-zinc-100">
                                  Directo al Aire
                              </h3>
                              <p className="text-zinc-500 mt-2 text-sm max-w-xs mx-auto">
                                  Presiona para hablar. Tu voz se enviará inmediatamente a la Radio Pública.
                              </p>
                          </div>

                          <div className="w-full h-32 bg-zinc-900/50 rounded-2xl flex items-center justify-center border border-zinc-800 overflow-hidden relative mb-8">
                              <AudioVisualizer isActive={isRecording} color={isRecording ? '#ef4444' : '#52525b'} />
                              {isRecording && (
                                  <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded uppercase tracking-widest animate-pulse shadow-lg shadow-red-500/20">
                                      <span className="w-1.5 h-1.5 bg-white rounded-full"></span> ON AIR
                                  </div>
                              )}
                          </div>

                          <button 
                              onClick={handleToggleLiveRecord}
                              disabled={isSendingLive}
                              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                                  isRecording 
                                  ? 'bg-red-600 text-white shadow-red-600/40 scale-110 border-4 border-red-400' 
                                  : 'bg-zinc-800 text-zinc-400 border-4 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200 hover:border-zinc-500'
                              }`}
                          >
                              {isRecording ? <StopCircle className="w-10 h-10" /> : (isSendingLive ? <div className="w-8 h-8 border-2 border-white/50 border-t-white rounded-full animate-spin"/> : <Mic className="w-10 h-10" />)}
                          </button>
                          
                          <div className="mt-8 text-xs text-zinc-600 font-mono">
                              {isRecording ? "TRANSMITIENDO..." : (isSendingLive ? "ENVIANDO..." : "LISTO PARA TRANSMITIR")}
                          </div>
                          
                          {uploadError && (
                              <div className="mt-4 text-red-400 text-xs text-center">
                                  {uploadError}
                              </div>
                          )}
                      </>
                  )}
              </div>
          </div>
      )}

      {/* UPLOAD LEGACY MODAL */}
      {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative shadow-2xl">
                  
                  {uploadSuccess ? (
                      <div className="flex flex-col items-center justify-center py-8 space-y-4">
                          <CheckCircle className="w-16 h-16 text-emerald-400 animate-bounce" />
                          <h3 className="text-xl font-serif text-emerald-100">Guardado en tu perfil</h3>
                      </div>
                  ) : (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-serif text-zinc-100 flex items-center gap-2">
                                <Mic className="w-5 h-5 text-emerald-400" /> Grabar Legado
                            </h3>
                            <button onClick={closeUploadModal} className="text-zinc-500 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <input 
                                type="text"
                                value={uploadTitle}
                                onChange={(e) => setUploadTitle(e.target.value)}
                                placeholder="Título de tu podcast o pensamiento..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                            />
                            
                            {/* Record or Upload View */}
                            <div className="space-y-4">
                                
                                {/* 1. Visualizer Area */}
                                <div className="h-16 bg-zinc-950 rounded-xl flex items-center justify-center border border-zinc-800 overflow-hidden relative">
                                    {uploadedFileUrl ? (
                                        <div className="text-xs text-emerald-400 flex items-center gap-2">
                                            <FileAudio className="w-4 h-4"/> Archivo listo para subir
                                        </div>
                                    ) : (
                                        <AudioVisualizer isActive={isRecording} color={isRecording ? '#10b981' : '#52525b'} />
                                    )}
                                </div>
                                
                                {/* 2. Controls Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Record Button */}
                                    <div className="flex flex-col items-center gap-2 border border-zinc-800/50 bg-zinc-900/50 rounded-xl p-3">
                                        <button 
                                            onClick={handleToggleRecord}
                                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                                isRecording 
                                                ? 'bg-red-900/20 text-red-500 border border-red-500/50 animate-pulse' 
                                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 hover:text-white'
                                            }`}
                                        >
                                            {isRecording ? <StopCircle className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
                                        </button>
                                        <span className="text-[10px] uppercase text-zinc-500">Grabar Voz</span>
                                    </div>

                                    {/* Upload Button */}
                                    <div className="flex flex-col items-center gap-2 border border-zinc-800/50 bg-zinc-900/50 rounded-xl p-3">
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            onChange={handleFileSelect} 
                                            accept="audio/*" 
                                            className="hidden" 
                                        />
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                                uploadedFileUrl
                                                ? 'bg-emerald-900/20 text-emerald-500 border border-emerald-500/50' 
                                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 hover:text-white'
                                            }`}
                                        >
                                            <UploadCloud className="w-6 h-6"/>
                                        </button>
                                        <span className="text-[10px] uppercase text-zinc-500">Subir Audio</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Playback Preview */}
                            {activeAudioUrl && !isRecording && (
                                <div className="flex items-center gap-3 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800">
                                    <audio src={activeAudioUrl} controls className="h-8 w-full opacity-80" />
                                </div>
                            )}
                            
                            {/* Error Message */}
                            {uploadError && (
                                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/10 p-2 rounded border border-red-900/20">
                                    <AlertTriangle className="w-4 h-4" /> {uploadError}
                                </div>
                            )}

                            <div className="pt-2">
                                <Button 
                                    onClick={handleSaveToProfile}
                                    disabled={!activeAudioUrl || isRecording || isProcessingUpload}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                    {isProcessingUpload ? 'Guardando...' : <><Save className="w-4 h-4 mr-2" /> Guardar en mi Perfil</>}
                                </Button>
                            </div>
                            
                            <p className="text-xs text-center text-zinc-500">
                                Se aceptan grabaciones propias o archivos (Audacity/MP3). <br/> Máx 3MB.
                            </p>
                        </div>
                    </>
                  )}
              </div>
          </div>
      )}

    </div>
  );
};

export default RoleSelection;

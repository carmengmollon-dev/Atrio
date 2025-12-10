import { useState, useRef, useEffect } from 'react';

interface UseVoiceModulatorProps {
  enabled: boolean;
  pitchShiftFactor?: number; // 0.5 to 2.0, where < 1 is deeper
}

export interface UseVoiceModulatorReturn {
  start: (config?: { modulationEnabled?: boolean }) => Promise<void>;
  stop: () => void;
  clearAudio: () => void;
  isProcessing: boolean;
  error: string | null;
  analyser: AnalyserNode | null;
  latestAudioUrl: string | null;
}

export const useVoiceModulator = ({ enabled, pitchShiftFactor = 0.85 }: UseVoiceModulatorProps): UseVoiceModulatorReturn => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAudioUrl, setLatestAudioUrl] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async (config?: { modulationEnabled?: boolean }) => {
    const withModulation = config?.modulationEnabled ?? true;
    setError(null);
    setLatestAudioUrl(null); // Clear previous recording
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      // CRITICAL FIX: Force resume the context. 
      // Browsers often start contexts in 'suspended' state, resulting in silent recordings.
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Create a destination node to record the processed output
      const destination = ctx.createMediaStreamDestination();
      destinationRef.current = destination;

      if (withModulation) {
        // Privacy Filter Chain
        // 1. Lowpass Filter (Remove identifiers in high freq)
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 1000; // Muffled "confessional booth" sound
        
        // 2. Gain (Volume control)
        const gain = ctx.createGain();
        gain.gain.value = 2.0; // Increased boost to ensure recording isn't too quiet
        gainNodeRef.current = gain;

        // Connections:
        // Source -> Lowpass -> Gain
        source.connect(lowpass);
        lowpass.connect(gain);
        
        // Gain -> Analyser (Visuals)
        gain.connect(analyser);
        
        // Gain -> Recorder Destination (Capture file)
        gain.connect(destination);
        
        // Note: NOT connecting to ctx.destination to disable self-monitoring (hearing own voice)

      } else {
        // Natural Voice
        // Source -> Analyser
        source.connect(analyser);
        // Source -> Recorder Destination
        source.connect(destination);
      }

      // Initialize MediaRecorder with the processed output
      let mimeType = 'audio/webm';
      // Improve MIME type detection for better cross-browser support (Safari/iOS)
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
      }

      // Use a smaller timeslice to keep data flowing, or undefined to let browser handle buffer
      // Optimized bitrate for storage (32kbps)
      const recorder = new MediaRecorder(destination.stream, { 
          mimeType,
          audioBitsPerSecond: 32000 
      });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        
        // Sanity check: If blob is too small, it might be an empty/failed recording
        if (blob.size < 1000) {
             console.warn("Recorded blob is suspiciously small:", blob.size);
        }

        const url = URL.createObjectURL(blob);
        setLatestAudioUrl(url);
      };

      recorder.start(); 
      mediaRecorderRef.current = recorder;

      setIsProcessing(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("No se pudo acceder al micrófono. Verifica los permisos.");
      setIsProcessing(false);
    }
  };

  const stop = () => {
    // Graceful Shutdown Sequence
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      
      // Give a small delay before killing the stream tracks to ensure the MediaRecorder
      // has time to fire 'stop' and 'dataavailable' events properly with valid data.
      setTimeout(() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
      }, 200);
    } else {
        // Fallback cleanup if recorder wasn't active
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsProcessing(false);
    }
    
    setIsProcessing(false);
  };

  const clearAudio = () => {
      setLatestAudioUrl(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
       if (isProcessing) stop();
    };
  }, []);

  return {
    start,
    stop,
    clearAudio,
    isProcessing,
    error,
    analyser: analyserRef.current,
    latestAudioUrl
  };
};
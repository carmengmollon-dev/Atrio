
import { useState, useRef, useEffect } from 'react';

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = window.speechSynthesis;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = (text: string, rate: number = 1.0, pitch: number = 1.0) => {
    if (!synth) return;

    // Cancel any ongoing speech to avoid queue buildup
    if (synth.speaking) {
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    
    utterance.onerror = (e) => {
        // Ignore interruption errors which happen when we cancel explicitly
        if (e.error === 'interrupted' || e.error === 'canceled') {
            setIsSpeaking(false);
            return;
        }
        console.error("TTS Error code:", e.error);
        setIsSpeaking(false);
    };

    utteranceRef.current = utterance;
    synth.speak(utterance);
  };

  const stop = () => {
    if (synth) {
      synth.cancel();
      setIsSpeaking(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synth) synth.cancel();
    };
  }, []);

  return { isSpeaking, speak, stop };
};

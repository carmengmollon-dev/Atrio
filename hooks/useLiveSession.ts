
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

interface LiveSessionConfig {
    systemInstruction: string;
    voiceName?: string;
}

export const useLiveSession = ({ systemInstruction, voiceName = 'Zephyr' }: LiveSessionConfig) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    
    // Callbacks
    const onMessageRef = useRef<((msg: LiveServerMessage) => void) | null>(null);
    const onUserAudioRef = useRef<((blob: Blob) => void) | null>(null);
    const onModelAudioRef = useRef<((blob: Blob) => void) | null>(null);

    // Audio Capture Buffers
    const inputBufferRef = useRef<Float32Array[]>([]);
    const outputBufferRef = useRef<string[]>([]); // Base64 chunks

    const connect = useCallback(async () => {
        if (isConnected || isConnecting) return;
        setIsConnecting(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const inputCtx = new AudioContextClass({ sampleRate: 16000 });
            const outputCtx = new AudioContextClass({ sampleRate: 24000 });
            
            inputAudioContextRef.current = inputCtx;
            outputAudioContextRef.current = outputCtx;
            nextStartTimeRef.current = 0;
            
            // Clear buffers
            inputBufferRef.current = [];
            outputBufferRef.current = [];

            // UPDATED: Add Audio Constraints for Quality and Echo Cancellation
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                    channelCount: 1
                } 
            });
            streamRef.current = stream;

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                    },
                    systemInstruction: systemInstruction, 
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                },
                callbacks: {
                    onopen: () => {
                        setIsConnected(true);
                        setIsConnecting(false);
                        
                        const source = inputCtx.createMediaStreamSource(stream);
                        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            
                            // Capture input data for broadcasting (Copy it)
                            const inputCopy = new Float32Array(inputData);
                            inputBufferRef.current.push(inputCopy);

                            const pcmBlob = createBlob(inputData);
                            sessionPromise.then(session => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        // UPDATED: Silence local playback to prevent echo
                        // We connect via a Gain node set to 0. This keeps the processing graph alive
                        // but prevents the user's voice from coming out of their own speakers.
                        const silenceNode = inputCtx.createGain();
                        silenceNode.gain.value = 0;
                        
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(silenceNode);
                        silenceNode.connect(inputCtx.destination);
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                         if (onMessageRef.current) {
                             onMessageRef.current(msg);
                         }
                         
                         const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                         if (base64Audio) {
                             // --- Detect User Turn End / Model Start ---
                             // If output buffer was empty, this is the first chunk of a response.
                             // This implies the user has finished speaking.
                             if (outputBufferRef.current.length === 0) {
                                 flushUserAudio();
                             }
                             
                             // Accumulate output audio
                             outputBufferRef.current.push(base64Audio);

                             const ctx = outputAudioContextRef.current;
                             if (ctx) {
                                 const audioBuffer = await decodeAudioData(
                                     decode(base64Audio),
                                     ctx,
                                     24000,
                                     1
                                 );
                                 
                                 const source = ctx.createBufferSource();
                                 source.buffer = audioBuffer;
                                 source.connect(ctx.destination);
                                 
                                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                                 source.start(nextStartTimeRef.current);
                                 nextStartTimeRef.current += audioBuffer.duration;
                                 
                                 sourcesRef.current.add(source);
                                 source.onended = () => sourcesRef.current.delete(source);
                             }
                         }
                         
                         // --- Detect Model Turn End ---
                         if (msg.serverContent?.turnComplete) {
                             flushModelAudio();
                         }
                         
                         if (msg.serverContent?.interrupted) {
                             sourcesRef.current.forEach(s => s.stop());
                             sourcesRef.current.clear();
                             nextStartTimeRef.current = 0;
                             // On interrupt, we clear the output buffer (cancelled response)
                             outputBufferRef.current = [];
                             // We DO NOT clear input buffer here, as user is likely still speaking (interrupting)
                         }
                    },
                    onclose: () => {
                        setIsConnected(false);
                        cleanup();
                    },
                    onerror: (e) => {
                        console.error("Live API Error", e);
                        setIsConnected(false);
                        cleanup();
                    }
                }
            });
            
            sessionPromiseRef.current = sessionPromise;

        } catch (e) {
            console.error("Connection Failed", e);
            setIsConnecting(false);
            cleanup();
        }
    }, [systemInstruction, voiceName, isConnected, isConnecting]);

    const flushUserAudio = () => {
        if (inputBufferRef.current.length === 0) return;
        
        // Merge chunks
        const totalLen = inputBufferRef.current.reduce((acc, curr) => acc + curr.length, 0);
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of inputBufferRef.current) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        
        // Encode to WAV (16kHz)
        const wavBlob = encodeWAV(merged, 16000);
        
        if (onUserAudioRef.current) {
            onUserAudioRef.current(wavBlob);
        }
        
        inputBufferRef.current = [];
    };

    const flushModelAudio = () => {
        if (outputBufferRef.current.length === 0) return;
        
        // Convert Base64 chunks to single byte array
        const chunks = outputBufferRef.current.map(b64 => decode(b64));
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
        }
        
        // Wrap in WAV container (24kHz)
        const wavBlob = encodePCMToWAV(merged, 24000);

        if (onModelAudioRef.current) {
            onModelAudioRef.current(wavBlob);
        }
        
        outputBufferRef.current = [];
    };

    const disconnect = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
        }
        cleanup();
        setIsConnected(false);
        setIsConnecting(false);
    }, []);

    const cleanup = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (inputAudioContextRef.current) {
            inputAudioContextRef.current.close();
            inputAudioContextRef.current = null;
        }
        if (outputAudioContextRef.current) {
            outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }
        sourcesRef.current.forEach(s => s.stop());
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
        inputBufferRef.current = [];
        outputBufferRef.current = [];
    };

    const setOnMessage = (cb: (msg: LiveServerMessage) => void) => {
        onMessageRef.current = cb;
    };
    
    const setOnUserAudio = (cb: (blob: Blob) => void) => {
        onUserAudioRef.current = cb;
    };

    const setOnModelAudio = (cb: (blob: Blob) => void) => {
        onModelAudioRef.current = cb;
    };

    useEffect(() => {
        return () => {
            disconnect();
        };
    }, []);

    return { connect, disconnect, isConnected, isConnecting, setOnMessage, setOnUserAudio, setOnModelAudio };
};

// Utils
function createBlob(data: Float32Array): any {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return {
        data: base64,
        mimeType: 'audio/pcm;rate=16000'
    };
}

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let c = 0; c < numChannels; c++) {
        const chData = buffer.getChannelData(c);
        for (let i = 0; i < frameCount; i++) {
            chData[i] = dataInt16[i * numChannels + c] / 32768.0;
        }
    }
    return buffer;
}

// --- WAV Encoding Helpers ---

function writeWavHeader(view: DataView, sampleRate: number, numChannels: number, numFrames: number) {
    const blockAlign = numChannels * 2; // 16-bit
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
  
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
  
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
}

function encodeWAV(samples: Float32Array, sampleRate: number) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    writeWavHeader(view, sampleRate, 1, samples.length);
    
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
}

function encodePCMToWAV(bytes: Uint8Array, sampleRate: number) {
    // bytes are raw PCM 16-bit little endian
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const numFrames = bytes.length / 2;
    
    writeWavHeader(view, sampleRate, 1, numFrames);
    
    return new Blob([header, bytes], { type: 'audio/wav' });
}

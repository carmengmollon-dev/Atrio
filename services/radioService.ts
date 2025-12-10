
import { RadioContent, ChatMessage } from '../types';
import { saveBroadcastToProfile } from './gamificationService';
import { UserProfile } from '../types';

// A simple service to simulate a shared radio queue using LocalStorage.
const RADIO_QUEUE_KEY = 'el_atrio_radio_queue';
const RADIO_CHAT_KEY = 'el_atrio_radio_chat';
const RADIO_BROADCASTERS_KEY = 'el_atrio_active_broadcasters';

export interface BroadcasterStatus {
    username: string;
    lastHeartbeat: number;
}

export const setBroadcasterStatus = (username: string, isLive: boolean) => {
    let broadcasters: BroadcasterStatus[] = [];
    try {
        broadcasters = JSON.parse(localStorage.getItem(RADIO_BROADCASTERS_KEY) || '[]');
    } catch {}

    const now = Date.now();

    if (isLive) {
        // Add or Update
        const existingIndex = broadcasters.findIndex(b => b.username === username);
        if (existingIndex >= 0) {
            broadcasters[existingIndex].lastHeartbeat = now;
        } else {
            broadcasters.push({ username, lastHeartbeat: now });
        }
    } else {
        // Remove
        broadcasters = broadcasters.filter(b => b.username !== username);
    }
    
    // Also clean up stale broadcasters (> 1 minute) while we are here
    broadcasters = broadcasters.filter(b => now - b.lastHeartbeat < 60000);

    localStorage.setItem(RADIO_BROADCASTERS_KEY, JSON.stringify(broadcasters));
};

export const getActiveBroadcasterNames = (): string[] => {
    let broadcasters: BroadcasterStatus[] = [];
    try {
        broadcasters = JSON.parse(localStorage.getItem(RADIO_BROADCASTERS_KEY) || '[]');
    } catch { return []; }

    const now = Date.now();
    // Filter out stale broadcasters (older than 30s for faster UI updates)
    return broadcasters.filter(b => now - b.lastHeartbeat < 30000).map(b => b.username);
};

export const addPublicConfession = (text: string, username: string = 'Anónimo') => {
  const queue = getQueue();
  
  const content: RadioContent = {
      id: Date.now().toString(),
      author: username,
      text: text,
      timestamp: Date.now(),
      type: 'text'
  };

  queue.push(content);
  if (queue.length > 20) queue.shift();
  
  try {
      localStorage.setItem(RADIO_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
      // If full, try saving just the new one
      localStorage.setItem(RADIO_QUEUE_KEY, JSON.stringify([content]));
  }
};

// Helper to convert blob URL to base64 string
export const convertAudioUrlToBase64 = async (audioUrl: string): Promise<string | null> => {
    try {
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const base64data = reader.result as string;
                resolve(base64data);
            };
            reader.onerror = () => {
                resolve(null);
            };
        });
    } catch (e) {
        console.error("Audio conversion failed", e);
        return null;
    }
};

export const addPublicAudioConfession = async (audioUrl: string, textDescription: string, username: string = 'Anónimo'): Promise<RadioContent | null> => {
    try {
        console.log("Processing audio for upload...");
        
        const base64Audio = await convertAudioUrlToBase64(audioUrl);
        
        if (!base64Audio) {
            console.error("Failed to convert audio");
            return null;
        }
                
        console.log("Audio converted to base64, length:", base64Audio.length);
        
        let queue = getQueue();
        
        const content: RadioContent = {
            id: Date.now().toString(),
            author: username,
            text: textDescription || '(Audio sin descripción)',
            timestamp: Date.now(),
            type: 'audio',
            audioData: base64Audio
        };
        
        // Add to end of queue
        queue.push(content);
        
        // AGGRESSIVE MEMORY MANAGEMENT
        // LocalStorage has a strict 5MB limit. Audio base64 is heavy.
        // We prioritize the NEWEST message. 
        
        const saveToStorage = (q: RadioContent[]) => {
            try {
                localStorage.setItem(RADIO_QUEUE_KEY, JSON.stringify(q));
                console.log("Audio saved to public queue successfully.");
                return true;
            } catch (e) {
                return false;
            }
        };

        // Attempt 1: Save full queue (trimmed to last 5)
        while (queue.length > 5) queue.shift();
        
        if (!saveToStorage(queue)) {
            console.warn("Storage full. Clearing old messages to fit new audio...");
            // Attempt 2: Aggressively remove items one by one from the start until it fits
            while (queue.length > 1) {
                queue.shift(); // Remove oldest
                if (saveToStorage(queue)) {
                        return content; // Return the content object on success
                } 
            }
            
            // Attempt 3: If it still doesn't fit with just 1 item (the new one),
            // then the file is just too big for LS.
                console.error("Audio file is too large for LocalStorage even alone.");
                return null;
        } else {
            return content; // Return the content object on success
        }

    } catch (e) {
        console.error("Failed to process audio for radio", e);
        return null;
    }
};

export const getNextPublicConfession = (): RadioContent | null => {
  const queue = getQueue();
  if (queue.length === 0) return null;
  
  const activeBroadcasters = getActiveBroadcasterNames();
  
  // CRITICAL CHANGE: 
  // We explicitly FILTER OUT any content from active broadcasters.
  // This ensures the global "Radio El Atrio" mix does NOT play content from users 
  // who are currently live, forcing the listener to select their specific channel.
  const index = queue.findIndex(item => !activeBroadcasters.includes(item.author));
  
  if (index === -1) {
      // All messages in queue are from active broadcasters, so Global Mix is silent
      // (or waiting for anonymous/offline content)
      return null;
  }
  
  const [content] = queue.splice(index, 1);
  localStorage.setItem(RADIO_QUEUE_KEY, JSON.stringify(queue));
  
  return content;
};

// Retrieve and remove the next confession from a specific author
export const getNextConfessionFromAuthor = (author: string): RadioContent | null => {
    const queue = getQueue();
    // We get the OLDEST message from this author to maintain timeline
    const index = queue.findIndex(c => c.author === author);
    if (index === -1) return null;
    
    const [content] = queue.splice(index, 1);
    localStorage.setItem(RADIO_QUEUE_KEY, JSON.stringify(queue));
    return content;
}

export const getQueuePreview = (): RadioContent[] => {
    return getQueue();
};

const getQueue = (): RadioContent[] => {
  const stored = localStorage.getItem(RADIO_QUEUE_KEY);
  try {
      return stored ? JSON.parse(stored) : [];
  } catch {
      return [];
  }
};

// --- Shared Chat Logic ---

export const addRadioChatMessage = (message: ChatMessage) => {
    const messages = getRadioChatMessages();
    messages.push(message);
    if (messages.length > 50) messages.shift();
    localStorage.setItem(RADIO_CHAT_KEY, JSON.stringify(messages));
};

export const getRadioChatMessages = (): ChatMessage[] => {
    const stored = localStorage.getItem(RADIO_CHAT_KEY);
    try {
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

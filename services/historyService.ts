
import { HistoryEntry } from '../types';

const HISTORY_PREFIX = 'el_atrio_history_';

export const saveToHistory = (username: string, text: string, topicId: string, wasBroadcast: boolean) => {
    const key = `${HISTORY_PREFIX}${username}`;
    const entry: HistoryEntry = {
        id: Date.now().toString(),
        text,
        topicId,
        timestamp: Date.now(),
        wasBroadcast
    };

    const currentHistory = getHistory(username);
    // Add to beginning of list
    const updatedHistory = [entry, ...currentHistory];
    
    localStorage.setItem(key, JSON.stringify(updatedHistory));
};

export const getHistory = (username: string): HistoryEntry[] => {
    const key = `${HISTORY_PREFIX}${username}`;
    const stored = localStorage.getItem(key);
    try {
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const clearHistory = (username: string) => {
    const key = `${HISTORY_PREFIX}${username}`;
    localStorage.removeItem(key);
};

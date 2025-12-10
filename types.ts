
import React from 'react';

export enum AppView {
  LANDING = 'LANDING',
  ROLE_SELECTION = 'ROLE_SELECTION',
  NICKNAME_SELECTION = 'NICKNAME_SELECTION',
  TOPIC_SELECTION = 'TOPIC_SELECTION',
  CONFESSIONAL = 'CONFESSIONAL', // User is the Penitent
  LISTENER = 'LISTENER', // User is the Listener (listening to AI)
  RADIO = 'RADIO', // New Radio Mode
}

export enum Role {
  PENITENT = 'PENITENT',
  LISTENER = 'LISTENER',
  BROADCASTER = 'BROADCASTER', // Implied role in Radio
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isStreaming?: boolean;
  isAudio?: boolean; // Marker for audio messages
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isSystem?: boolean;
  color?: string;
}

export interface RadioMessage {
    id: string;
    text: string;
    timestamp: number;
}

export interface RadioContent {
    id: string;
    author: string;
    text: string; // Keep text as a fallback or description
    timestamp: number;
    type: 'text' | 'audio';
    audioData?: string; // Base64 encoded audio for real playback
}

export interface HistoryEntry {
    id: string;
    text: string;
    topicId: string;
    timestamp: number;
    wasBroadcast: boolean;
}

export interface Category {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

// Gamification Types
export enum UserLevel {
  NOVICE = 'Novicio',
  LISTENER = 'Oyente',
  GUIDE = 'Guía',
  SAINT = 'Santo',
}

export interface UserStats {
  minutesListened: number;
  confessionsHeard: number;
  confessionsMade: number; // Track confessions made by user
  reputation: number; // Score from ratings
  level: UserLevel;
}

export interface UserProfile {
  username: string;
  passwordHash?: string; // Optional for security/legacy
  isGuest: boolean;
  stats: UserStats;
  joinedAt: number;
  savedBroadcasts?: RadioContent[]; // Persisted broadcasts
}

// AI Personalities
export interface Archetype {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
}

export interface SimulatedUser {
  id: string;
  username: string;
  level: UserLevel;
  archetype: Archetype;
}

export interface UserContext {
  role: Role | null;
  topic: string | null;
  user: UserProfile | null;
  targetUser?: SimulatedUser | null; // The user we are talking to (Optional now)
}

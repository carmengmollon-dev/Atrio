
import { UserLevel, UserStats, UserProfile, SimulatedUser, RadioContent } from '../types';
import { LEVEL_THRESHOLDS, REAL_HUMAN_ARCHETYPE } from '../constants';

const PROFILES_KEY = 'el_atrio_profiles';
const GUEST_STATS_KEY = 'el_atrio_guest_stats';

const DEFAULT_STATS: UserStats = {
  minutesListened: 0,
  confessionsHeard: 0,
  confessionsMade: 0,
  reputation: 0,
  level: UserLevel.NOVICE,
};

// --- Helper Calculations ---

export const calculateLevel = (minutes: number, reputation: number): UserLevel => {
  // Level up logic based on time AND reputation
  // Reputation acts as a multiplier or gatekeeper
  
  if (minutes >= LEVEL_THRESHOLDS[UserLevel.SAINT] && reputation >= 50) return UserLevel.SAINT;
  if (minutes >= LEVEL_THRESHOLDS[UserLevel.GUIDE] && reputation >= 20) return UserLevel.GUIDE;
  if (minutes >= LEVEL_THRESHOLDS[UserLevel.LISTENER]) return UserLevel.LISTENER;
  return UserLevel.NOVICE;
};

export const getProgressToNextLevel = (stats: UserStats): number => {
  const currentLevel = stats.level;
  let nextThreshold = 0;
  let prevThreshold = 0;

  switch (currentLevel) {
    case UserLevel.NOVICE:
      nextThreshold = LEVEL_THRESHOLDS[UserLevel.LISTENER];
      prevThreshold = LEVEL_THRESHOLDS[UserLevel.NOVICE];
      break;
    case UserLevel.LISTENER:
      nextThreshold = LEVEL_THRESHOLDS[UserLevel.GUIDE];
      prevThreshold = LEVEL_THRESHOLDS[UserLevel.LISTENER];
      break;
    case UserLevel.GUIDE:
      nextThreshold = LEVEL_THRESHOLDS[UserLevel.SAINT];
      prevThreshold = LEVEL_THRESHOLDS[UserLevel.GUIDE];
      break;
    case UserLevel.SAINT:
      return 100; // Max level
  }

  // Calculate progress based on Time
  const timeProgress = ((stats.minutesListened - prevThreshold) / (nextThreshold - prevThreshold)) * 100;
  return Math.min(Math.max(timeProgress, 0), 100);
};

// --- Security Helper (Simulation) ---
// Simple hash for demonstration (Do not use for real high-security apps)
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
};

// --- Profile Management ---

export const getGuestProfile = (nickname: string): UserProfile => {
    // Try to recover guest stats or return default
    let stats = DEFAULT_STATS;
    const storedGuest = localStorage.getItem(GUEST_STATS_KEY);
    if (storedGuest) {
        try { 
            const parsed = JSON.parse(storedGuest);
            stats = { ...DEFAULT_STATS, ...parsed }; // Merge to ensure new fields exist
        } catch {}
    }

    return {
        username: nickname,
        isGuest: true,
        stats: stats,
        joinedAt: Date.now()
    };
};

export const registerUser = (username: string, password: string): { success: boolean, profile?: UserProfile, error?: string } => {
    const profilesJson = localStorage.getItem(PROFILES_KEY);
    const profiles: Record<string, UserProfile> = profilesJson ? JSON.parse(profilesJson) : {};

    if (profiles[username]) {
        return { success: false, error: 'Este nombre de usuario ya existe.' };
    }

    const newProfile: UserProfile = {
        username,
        passwordHash: simpleHash(password),
        isGuest: false,
        stats: { ...DEFAULT_STATS },
        joinedAt: Date.now()
    };
    
    profiles[username] = newProfile;
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    
    return { success: true, profile: newProfile };
};

export const loginUser = (username: string, password: string): { success: boolean, profile?: UserProfile, error?: string } => {
    const profilesJson = localStorage.getItem(PROFILES_KEY);
    const profiles: Record<string, UserProfile> = profilesJson ? JSON.parse(profilesJson) : {};
    const profile = profiles[username];

    if (!profile) {
        return { success: false, error: 'Usuario no encontrado.' };
    }

    if (profile.passwordHash && profile.passwordHash !== simpleHash(password)) {
        return { success: false, error: 'Contraseña incorrecta.' };
    }

    // Ensure stats structure is up to date (legacy support)
    if (!profile.stats.confessionsMade) profile.stats.confessionsMade = 0;

    return { success: true, profile };
};

export const getLatestProfile = (username: string): UserProfile | null => {
    const profilesJson = localStorage.getItem(PROFILES_KEY);
    const profiles: Record<string, UserProfile> = profilesJson ? JSON.parse(profilesJson) : {};
    return profiles[username] || null;
};

export const saveUserProfile = (profile: UserProfile) => {
    if (profile.isGuest) {
        try {
            localStorage.setItem(GUEST_STATS_KEY, JSON.stringify(profile.stats));
        } catch (e) {
            console.error("Failed to save guest stats", e);
        }
        return;
    }

    try {
        const profilesJson = localStorage.getItem(PROFILES_KEY);
        const profiles: Record<string, UserProfile> = profilesJson ? JSON.parse(profilesJson) : {};
        
        profiles[profile.username] = profile;
        localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    } catch (e) {
        console.error("Failed to save user profile (likely storage full)", e);
        throw e; // Rethrow so caller can handle
    }
};

export const updateStatsForProfile = (
    profile: UserProfile,
    minutesToAdd: number, 
    confessionsHeardToAdd: number, 
    reputationDelta: number,
    confessionsMadeToAdd: number = 0
): UserProfile => {
  
  const currentStats = profile.stats;
  
  const newStats: UserStats = {
    minutesListened: currentStats.minutesListened + minutesToAdd,
    confessionsHeard: currentStats.confessionsHeard + confessionsHeardToAdd,
    confessionsMade: (currentStats.confessionsMade || 0) + confessionsMadeToAdd,
    reputation: currentStats.reputation + reputationDelta,
    level: UserLevel.NOVICE, // Recalculated below
  };

  newStats.level = calculateLevel(newStats.minutesListened, newStats.reputation);
  
  const updatedProfile = { ...profile, stats: newStats };
  try {
    saveUserProfile(updatedProfile);
  } catch (e) {
    // If stats update fails, we just continue in memory
  }
  
  return updatedProfile;
};

// Mock data generator for the "Real People" feel
export const getMockPublicUsers = (): SimulatedUser[] => {
    const names = [
        'Ana_M', 'Carlos92', 'Elena_Luz', 'JaviG', 'Sofia_88', 
        'Miguel_Andres', 'Luna_Clara', 'David_R', 'Clara_Sol', 
        'Roberto_12', 'Lucia_V', 'Pablo_S'
    ];
    const levels = Object.values(UserLevel);
    
    return names.map((name, i) => ({
        id: `mock-${i}`,
        username: name,
        level: levels[i % levels.length], // distribute levels
        archetype: REAL_HUMAN_ARCHETYPE
    }));
};

export const saveBroadcastToProfile = (username: string, content: RadioContent) => {
    const profile = getLatestProfile(username);
    if (profile && !profile.isGuest) {
        if (!profile.savedBroadcasts) {
            profile.savedBroadcasts = [];
        }
        
        // Push the new content (with audio data if present)
        profile.savedBroadcasts.push(content);
        
        // Limit total saved broadcasts (start conservative)
        if (profile.savedBroadcasts.length > 50) {
            profile.savedBroadcasts.shift();
        }

        try {
            saveUserProfile(profile);
            console.log("Broadcast saved to profile.");
        } catch (e) {
            console.warn("Profile storage full when saving broadcast. Attempting to clear space...");
            // Retry logic for storage limits
            // If it fails, remove items aggressively until it fits or we give up
            while (profile.savedBroadcasts.length > 0) {
                profile.savedBroadcasts.shift(); // Remove oldest
                try {
                    saveUserProfile(profile);
                    console.log("Saved after clearing space.");
                    return;
                } catch (innerE) {
                    continue;
                }
            }
            console.error("Could not save broadcast to profile even after clearing.");
        }
    }
};

export const getAllProfilesWithBroadcasts = (): UserProfile[] => {
    const profilesJson = localStorage.getItem(PROFILES_KEY);
    const profiles: Record<string, UserProfile> = profilesJson ? JSON.parse(profilesJson) : {};
    
    // Return all registered members (non-guests), regardless of whether they have broadcasts.
    // This allows all users to appear as "Channels" immediately upon registration.
    return Object.values(profiles).filter(p => !p.isGuest);
};

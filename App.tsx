
import React, { useState } from 'react';
import { AppView, Role, UserContext, UserProfile, SimulatedUser } from './types';
import Landing from './views/Landing';
import RoleSelection from './views/RoleSelection';
import NicknameSelection from './views/NicknameSelection';
import TopicSelection from './views/TopicSelection';
import Confessional from './views/Confessional';
import Listener from './views/Listener';
import RadioRoom from './views/RadioRoom';
import { getLatestProfile } from './services/gamificationService';
import FloatingChatBubble from './components/FloatingChatBubble';

function App() {
  const [view, setView] = useState<AppView>(AppView.LANDING);
  const [context, setContext] = useState<UserContext>({ role: null, topic: null, user: null, targetUser: null });
  
  // New State for Background Sessions
  const [isConfessionOpen, setIsConfessionOpen] = useState(false);
  const [isRadioOpen, setIsRadioOpen] = useState(false);

  const navigateTo = (nextView: AppView) => {
    setView(nextView);
  };

  const handleRoleSelect = (role: Role) => {
    setContext(prev => ({ ...prev, role: role }));
    // If user is already logged in (Member), skip nickname selection
    if (context.user && !context.user.isGuest) {
        if (role === Role.LISTENER) {
            // Start Persistent Radio Session
            setIsRadioOpen(true);
            navigateTo(AppView.RADIO);
        } else {
            navigateTo(AppView.TOPIC_SELECTION);
        }
    } else {
        navigateTo(AppView.NICKNAME_SELECTION);
    }
  };

  const handleProfileSelect = (profile: UserProfile) => {
    // Redirect to Dashboard (RoleSelection) after login/register so user sees their Level/Stats
    setContext(prev => ({ ...prev, user: profile, role: null }));
    navigateTo(AppView.ROLE_SELECTION);
  };

  const handleTopicSelect = (topicId: string, targetUser?: SimulatedUser) => {
    setContext(prev => ({ ...prev, topic: topicId, targetUser: targetUser || null }));
    
    if (context.role === Role.PENITENT) {
      // Start Persisted Confessional Session
      setIsConfessionOpen(true);
      navigateTo(AppView.CONFESSIONAL);
    } else {
      navigateTo(AppView.LISTENER);
    }
  };
  
  const handleTopicBack = () => {
    if (context.user && !context.user.isGuest) {
        setContext(prev => ({ ...prev, topic: null, targetUser: null })); 
        navigateTo(AppView.ROLE_SELECTION);
    } else {
        navigateTo(AppView.NICKNAME_SELECTION);
    }
  };

  const handleSessionEnd = () => {
    // If we are exiting a persistent session, we close the specific flag
    if (view === AppView.CONFESSIONAL) {
        setIsConfessionOpen(false);
    } else if (view === AppView.RADIO) {
        setIsRadioOpen(false);
    }

    if (context.user && !context.user.isGuest) {
        const updatedProfile = getLatestProfile(context.user.username);
        setContext(prev => ({ 
            ...prev, 
            topic: null,
            targetUser: null,
            user: updatedProfile || prev.user 
        }));
        
        navigateTo(AppView.ROLE_SELECTION);
    } else {
        setContext({ role: null, topic: null, user: null, targetUser: null });
        setIsConfessionOpen(false);
        setIsRadioOpen(false);
        setView(AppView.LANDING);
    }
  };

  const handleLogout = () => {
      setContext({ role: null, topic: null, user: null, targetUser: null });
      setIsConfessionOpen(false);
      setIsRadioOpen(false);
      setView(AppView.LANDING);
  };

  // Background Tasks Logic
  const handleMinimizeConfession = () => {
      // Keep isConfessionOpen true, but navigate away
      navigateTo(AppView.ROLE_SELECTION);
  };
  
  const handleMinimizeRadio = () => {
      // Keep isRadioOpen true, but navigate away
      navigateTo(AppView.ROLE_SELECTION);
  };

  const handleRestoreConfession = () => {
      navigateTo(AppView.CONFESSIONAL);
  };

  const handleRestoreRadio = () => {
      navigateTo(AppView.RADIO);
  };

  // Logic to determine which bubble to show if multiple tasks are backgrounded
  // Priority: If I am in Radio view, I can't minimize Radio to see Radio bubble. 
  // If I am in Confession view, I can't see Confession bubble.
  const showConfessionBubble = isConfessionOpen && view !== AppView.CONFESSIONAL;
  const showRadioBubble = isRadioOpen && view !== AppView.RADIO;

  // If both are open and backgrounded (unlikely flow but possible), show the last active or toggle? 
  // For simplicity, we just show one, prioritizing Confession if user is browsing menu.
  // Or render two bubbles if needed, but let's stick to one main floating action button logic for now.
  const activeBubbleVariant = showConfessionBubble ? 'confession' : (showRadioBubble ? 'radio' : null);
  const bubbleAction = showConfessionBubble ? handleRestoreConfession : handleRestoreRadio;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col overflow-hidden font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Main Content Area */}
      <main className="flex-grow relative flex flex-col">
        
        {/* Ambient Background Noise/Gradient */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-amber-900/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-indigo-900/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 w-full h-full flex flex-col">
          {view === AppView.LANDING && (
            <Landing onStart={() => navigateTo(AppView.ROLE_SELECTION)} />
          )}
          
          {view === AppView.ROLE_SELECTION && (
            <RoleSelection 
              onSelect={handleRoleSelect} 
              onBack={() => navigateTo(AppView.LANDING)}
              currentUser={context.user}
              onLogout={handleLogout}
            />
          )}

          {view === AppView.NICKNAME_SELECTION && context.role && (
            <NicknameSelection
              role={context.role}
              onSelect={handleProfileSelect}
              onBack={() => navigateTo(AppView.ROLE_SELECTION)}
            />
          )}

          {view === AppView.TOPIC_SELECTION && context.role && (
            <TopicSelection 
              role={context.role}
              onSelect={handleTopicSelect}
              onBack={handleTopicBack}
            />
          )}

          {/* PERSISTENT CONFESSIONAL LAYER */}
          {/* We use opacity/pointer-events instead of display:none (hidden) to ensure background processes/timers keep running reliably */}
          {isConfessionOpen && context.topic && context.user && (
            <div className={`fixed inset-0 bg-zinc-950 transition-all duration-300 ${view === AppView.CONFESSIONAL ? 'opacity-100 pointer-events-auto z-50' : 'opacity-0 pointer-events-none -z-10'}`}>
                 <Confessional 
                    topic={context.topic} 
                    userProfile={context.user}
                    targetUser={context.targetUser} 
                    onExit={handleSessionEnd} 
                    onMinimize={handleMinimizeConfession}
                />
            </div>
          )}

          {/* PERSISTENT RADIO LAYER */}
          {/* We use opacity/pointer-events instead of display:none (hidden) to ensure audio keeps playing in background */}
          {isRadioOpen && (
              <div className={`fixed inset-0 bg-zinc-950 transition-all duration-300 ${view === AppView.RADIO ? 'opacity-100 pointer-events-auto z-50' : 'opacity-0 pointer-events-none -z-10'}`}>
                  <RadioRoom 
                    onExit={handleSessionEnd} 
                    onMinimize={handleMinimizeRadio}
                  />
              </div>
          )}

          {/* Floating Bubble for Minimized Session */}
          {activeBubbleVariant && (
              <FloatingChatBubble 
                onClick={bubbleAction} 
                isActive={true} 
                hasNotification={false} 
                variant={activeBubbleVariant}
              />
          )}

          {/* Legacy Listener View (If not used via Radio) */}
          {view === AppView.LISTENER && context.topic && context.user && context.targetUser && (
             <Listener 
               topic={context.topic}
               userProfile={context.user}
               targetUser={context.targetUser}
               onExit={handleSessionEnd}
             />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

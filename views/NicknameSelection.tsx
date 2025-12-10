import React, { useState, useEffect } from 'react';
import { Role, UserProfile } from '../types';
import Button from '../components/Button';
import { generateRandomNickname } from '../services/usernameService';
import { getGuestProfile, loginUser, registerUser } from '../services/gamificationService';
import { Dices, Shield, LogIn, UserPlus } from 'lucide-react';

interface NicknameSelectionProps {
  role: Role;
  onSelect: (profile: UserProfile) => void;
  onBack: () => void;
}

const NicknameSelection: React.FC<NicknameSelectionProps> = ({ role, onSelect, onBack }) => {
  const [mode, setMode] = useState<'guest' | 'member'>('guest');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'guest') {
        setUsername(generateRandomNickname());
        setPassword('');
        setError(null);
    } else {
        setUsername('');
        setPassword('');
        setError(null);
    }
  }, [mode]);

  const handleRandomize = () => {
    setUsername(generateRandomNickname());
  };

  const handleSubmit = () => {
    setError(null);

    if (mode === 'guest') {
        if (!username.trim()) {
            setError('Por favor, genera un alias.');
            return;
        }
        onSelect(getGuestProfile(username));
        return;
    }

    // Member Mode Logic
    if (!username.trim() || !password.trim()) {
        setError('Por favor, ingresa usuario y contraseña.');
        return;
    }

    if (authMode === 'login') {
        const result = loginUser(username, password);
        if (result.success && result.profile) {
            onSelect(result.profile);
        } else {
            setError(result.error || 'Error al iniciar sesión');
        }
    } else {
        const result = registerUser(username, password);
        if (result.success && result.profile) {
            onSelect(result.profile);
        } else {
            setError(result.error || 'Error al registrar usuario');
        }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 animate-fade-in">
      <div className="w-full max-w-md space-y-8">
        
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-6">
             <div className="p-1 bg-zinc-900 rounded-full border border-zinc-800 flex gap-1">
                 <button 
                   onClick={() => setMode('guest')}
                   className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${mode === 'guest' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                 >
                   Invitado
                 </button>
                 <button 
                   onClick={() => setMode('member')}
                   className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${mode === 'member' ? 'bg-amber-900/30 text-amber-200 border border-amber-500/20 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                 >
                   Miembro
                 </button>
             </div>
          </div>
          <h2 className="text-3xl font-serif text-zinc-100">
            {mode === 'guest' ? 'Identidad Efímera' : 'Tu Legado'}
          </h2>
          <p className="text-zinc-500 text-sm">
            {mode === 'guest' 
              ? 'Tu progreso no se guardará al cerrar la sesión.' 
              : 'Acumula Aureolas, sube de nivel y guarda tu reputación.'}
          </p>
        </div>

        <div className="space-y-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 relative overflow-hidden">
          {/* Decorative glow for member mode */}
          {mode === 'member' && <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />}

          {/* Member Auth Toggle */}
          {mode === 'member' && (
             <div className="flex justify-center mb-2">
                <div className="flex text-xs font-medium bg-zinc-950 rounded-lg p-1 border border-zinc-800">
                    <button 
                        onClick={() => { setAuthMode('login'); setError(null); }}
                        className={`px-3 py-1.5 rounded transition-all ${authMode === 'login' ? 'bg-zinc-800 text-amber-200' : 'text-zinc-500'}`}
                    >
                        Iniciar Sesión
                    </button>
                    <button 
                        onClick={() => { setAuthMode('register'); setError(null); }}
                        className={`px-3 py-1.5 rounded transition-all ${authMode === 'register' ? 'bg-zinc-800 text-amber-200' : 'text-zinc-500'}`}
                    >
                        Registrarse
                    </button>
                </div>
             </div>
          )}

          {/* Username Input */}
          <div className="flex gap-2">
            <div className="flex-grow relative">
              <input 
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`w-full bg-zinc-950 border text-zinc-100 rounded-lg px-4 py-3 focus:outline-none text-center font-serif text-lg transition-colors placeholder-zinc-600 ${
                    mode === 'member' 
                    ? 'border-amber-900/50 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20' 
                    : 'border-zinc-700 focus:border-zinc-500'
                }`}
                placeholder={mode === 'guest' ? "Tu Alias..." : "Usuario"}
                maxLength={20}
              />
            </div>
            {mode === 'guest' && (
                <button 
                onClick={handleRandomize}
                className="p-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Generar aleatorio"
                >
                <Dices className="w-6 h-6" />
                </button>
            )}
          </div>

          {/* Password Input (Member Only) */}
          {mode === 'member' && (
              <div className="animate-fade-in">
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-zinc-950 border border-amber-900/50 text-zinc-100 rounded-lg px-4 py-3 focus:outline-none text-center font-serif text-lg transition-colors focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 placeholder-zinc-600"
                    placeholder="Contraseña"
                  />
              </div>
          )}
          
          {error && (
              <div className="text-red-400 text-xs text-center bg-red-900/20 p-2 rounded border border-red-900/50 animate-pulse">
                  {error}
              </div>
          )}

          <p className="text-xs text-center text-zinc-600">
            {mode === 'guest' 
                ? 'Este alias desaparecerá al salir.' 
                : authMode === 'login' 
                    ? 'Introduce tus credenciales para recuperar tu halo.' 
                    : 'Crea una llave secreta para tu santuario.'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            onClick={handleSubmit} 
            disabled={!username.trim() || (mode === 'member' && !password.trim())}
            className={`w-full ${mode === 'member' ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-none' : ''}`}
          >
            {mode === 'member' 
                ? (authMode === 'login' ? <><LogIn className="w-4 h-4 mr-2"/> Entrar</> : <><UserPlus className="w-4 h-4 mr-2"/> Crear Cuenta</>)
                : 'Entrar como Invitado'
            }
          </Button>
          <Button variant="ghost" onClick={onBack} className="w-full">
            Volver
          </Button>
        </div>

      </div>
    </div>
  );
};

export default NicknameSelection;
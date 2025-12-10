import React from 'react';
import Button from '../components/Button';
import { Fingerprint } from 'lucide-react';

interface LandingProps {
  onStart: () => void;
}

const Landing: React.FC<LandingProps> = ({ onStart }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center space-y-12 animate-fade-in">
      
      <div className="space-y-6 max-w-lg">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 border border-amber-500/30 rounded-full flex items-center justify-center candle-glow bg-zinc-900/50">
            <Fingerprint className="text-amber-500 w-8 h-8 opacity-80" />
          </div>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-serif text-white tracking-tight text-glow">
          El Atrio
        </h1>
        
        <p className="text-lg md:text-xl text-zinc-400 leading-relaxed font-light max-w-md mx-auto">
          Bienvenido al santuario digital. Un espacio anónimo para compartir tu carga o acompañar a otros en silencio.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 w-full max-w-xs md:max-w-md">
        <Button size="lg" onClick={onStart} className="w-full candle-glow">
          Entrar en Paz
        </Button>
      </div>

      <footer className="absolute bottom-8 text-xs text-zinc-600 uppercase tracking-widest opacity-50">
        Cifrado de extremo a extremo • 100% Anónimo
      </footer>
    </div>
  );
};

export default Landing;
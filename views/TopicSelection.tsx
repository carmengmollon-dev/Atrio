
import React from 'react';
import { Role, SimulatedUser } from '../types';
import { CATEGORIES } from '../constants';
import Button from '../components/Button';
import { ChevronLeft } from 'lucide-react';

interface TopicSelectionProps {
  role: Role;
  onSelect: (topicId: string, targetUser?: SimulatedUser) => void;
  onBack: () => void;
}

const TopicSelection: React.FC<TopicSelectionProps> = ({ role, onSelect, onBack }) => {

  const handleTopicClick = (topicId: string) => {
    // Direct navigation, no target user needed for Confessional anymore
    onSelect(topicId, undefined);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 animate-fade-in">
      <div className="w-full max-w-2xl space-y-8">
        
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-serif text-zinc-100">
             ¿Qué pesa en tu alma?
          </h2>
          <p className="text-zinc-500">
            Entra al santuario y libera tu carga. Nadie te juzgará aquí.
          </p>
        </div>

        <div className="grid gap-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleTopicClick(cat.id)}
              className="group flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all w-full text-left"
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full bg-zinc-950 border border-zinc-800 group-hover:scale-110 transition-transform ${cat.color}`}>
                  {cat.icon}
                </div>
                <div>
                  <h4 className="font-medium text-zinc-200 group-hover:text-white">{cat.label}</h4>
                  <p className="text-sm text-zinc-500">{cat.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-center pt-4">
          <Button variant="ghost" onClick={onBack}>
              <ChevronLeft className="w-4 h-4 mr-2" /> Volver
          </Button>
        </div>

      </div>
    </div>
  );
};

export default TopicSelection;

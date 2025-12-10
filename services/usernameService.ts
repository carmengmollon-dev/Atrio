
const ADJECTIVES = [
  'Errante', 'Silencioso', 'Oculto', 'Lejano', 'Profundo', 
  'Nocturno', 'Solitario', 'Antiguo', 'Velado', 'Eterno',
  'Inquieto', 'Sereno', 'Invisible', 'Gris', 'Místico'
];

const NOUNS = [
  'Alma', 'Sombra', 'Eco', 'Caminante', 'Espíritu', 
  'Susurro', 'Reflejo', 'Viajero', 'Testigo', 'Voz',
  'Pensamiento', 'Niebla', 'Luz', 'Guardián', 'Peregrino'
];

export const generateRandomNickname = (): string => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  
  return `${noun}${adj}_${num}`;
};

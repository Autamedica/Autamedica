import React, { useState, useRef, useEffect } from 'react';
import { getBrowserSupabaseClient } from '../../lib/supabase-browser';

interface WordInfo {
  number: number;
  word: string;
  direction: 'horizontal' | 'vertical';
  startX: number;
  startY: number;
  clue: string;
}

const WORDS: WordInfo[] = [
  {
    number: 1,
    word: 'DOPAMINA',
    direction: 'horizontal',
    startX: 3,
    startY: 2,
    clue: 'Neurotransmisor implicado en las vías de motivación y recompensa, regulado de forma deficiente en personas con TDAH.',
  },
  {
    number: 2,
    word: 'INATENCION',
    direction: 'vertical',
    startX: 6,
    startY: 0,
    clue: 'Síntoma nuclear que se manifiesta como dificultad para mantener el foco, cometer errores por descuido y facilidad para distraerse.',
  },
  {
    number: 3,
    word: 'ESTIMULANTE',
    direction: 'horizontal',
    startX: 6,
    startY: 4,
    clue: 'Tipo de fármaco (como el metilfenidato) que aumenta los niveles de dopamina y noradrenalina, siendo el tratamiento de primera línea.',
  },
  {
    number: 4,
    word: 'IMPULSIVIDAD',
    direction: 'vertical',
    startX: 12,
    startY: 0,
    clue: 'Dificultad para frenar respuestas inmediatas, que lleva a actuar sin pensar, interrumpir conversaciones o mostrar impaciencia severa.',
  },
  {
    number: 5,
    word: 'DIFICULTAD',
    direction: 'horizontal',
    startX: 12,
    startY: 9,
    clue: 'Término clínico para describir la alteración o impedimento en el funcionamiento ejecutivo diario que experimenta una persona con TDAH.',
  },
];

const GRID_COLS = 22;
const GRID_ROWS = 15;

const getCellSolution = (x: number, y: number): string | null => {
  for (const w of WORDS) {
    const len = w.word.length;
    for (let i = 0; i < len; i++) {
      const curX = w.direction === 'horizontal' ? w.startX + i : w.startX;
      const curY = w.direction === 'vertical' ? w.startY + i : w.startY;
      if (curX === x && curY === y) {
        return w.word[i];
      }
    }
  }
  return null;
};

const getCellNumberLabel = (x: number, y: number): number | null => {
  for (const w of WORDS) {
    if (w.startX === x && w.startY === y) {
      return w.number;
    }
  }
  return null;
};

interface LeaderboardEntry {
  id?: string;
  nombre: string;
  tiempo_segundos: number;
  juego_id?: string;
  created_at?: string;
}

export default function TdahCrossword() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedWord, setSelectedWord] = useState<WordInfo | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ x: number; y: number } | null>(null);
  const [verified, setVerified] = useState(false);
  const [verificationResults, setVerificationResults] = useState<Record<string, boolean>>({});
  const [showSuccess, setShowSuccess] = useState(false);

  // Timer & Leaderboard
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const supabase = getBrowserSupabaseClient();

  // Cargar leaderboard al montar el componente
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Manejar el timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStarted && !showSuccess) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, showSuccess]);

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from('juegos_leaderboard' as never)
        .select('*')
        .eq('juego_id', 'tdah')
        .order('tiempo_segundos', { ascending: true })
        .limit(10);
      if (!error && data) {
        setLeaderboard(data as unknown as LeaderboardEntry[]);
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    }
  };

  const handleSaveScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('juegos_leaderboard' as never)
        .insert([
          {
            nombre: playerName.trim(),
            tiempo_segundos: timer,
            juego_id: 'tdah',
          },
        ] as never);

      if (!error) {
        setHasSaved(true);
        fetchLeaderboard();
      } else {
        console.error('Error saving score:', error);
      }
    } catch (err) {
      console.error('Error saving score:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const resetPuzzle = () => {
    setAnswers({});
    setVerified(false);
    setVerificationResults({});
    setShowSuccess(false);
    setSelectedWord(null);
    setFocusedCell(null);
    setTimer(0);
    setGameStarted(false);
    setHasSaved(false);
    setPlayerName('');
  };

  const verifyAnswers = () => {
    const results: Record<string, boolean> = {};
    let allCorrect = true;
    let missingAnswers = false;

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const sol = getCellSolution(x, y);
        if (sol) {
          const key = `${x}-${y}`;
          const val = (answers[key] || '').toUpperCase();
          if (!val) {
            missingAnswers = true;
            allCorrect = false;
          } else if (val === sol) {
            results[key] = true;
          } else {
            results[key] = false;
            allCorrect = false;
          }
        }
      }
    }

    setVerificationResults(results);
    setVerified(true);

    if (allCorrect && !missingAnswers) {
      setShowSuccess(true);
    }
  };

  const handleCellChange = (x: number, y: number, value: string) => {
    if (!gameStarted) {
      setGameStarted(true);
    }
    const key = `${x}-${y}`;
    const cleanVal = value.slice(-1).toUpperCase();
    
    setAnswers(prev => ({
      ...prev,
      [key]: cleanVal
    }));

    if (verified) {
      setVerified(false);
      setVerificationResults({});
    }

    if (cleanVal && selectedWord) {
      moveToNextCell(x, y);
    }
  };

  const moveToNextCell = (x: number, y: number) => {
    if (!selectedWord) return;
    
    const index = selectedWord.direction === 'horizontal' 
      ? x - selectedWord.startX 
      : y - selectedWord.startY;
      
    if (index < selectedWord.word.length - 1) {
      const nextX = selectedWord.direction === 'horizontal' ? x + 1 : x;
      const nextY = selectedWord.direction === 'vertical' ? y + 1 : y;
      focusCell(nextX, nextY);
    }
  };

  const focusCell = (x: number, y: number) => {
    const key = `${x}-${y}`;
    const input = inputRefs.current[key];
    if (input) {
      input.focus();
      setFocusedCell({ x, y });
    }
  };

  const handleKeyDown = (x: number, y: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !answers[`${x}-${y}`] && selectedWord) {
      const index = selectedWord.direction === 'horizontal' 
        ? x - selectedWord.startX 
        : y - selectedWord.startY;
        
      if (index > 0) {
        const prevX = selectedWord.direction === 'horizontal' ? x - 1 : x;
        const prevY = selectedWord.direction === 'vertical' ? y - 1 : y;
        focusCell(prevX, prevY);
      }
    }
  };

  const selectWordByCell = (x: number, y: number) => {
    const intersectingWords = WORDS.filter(w => {
      const len = w.word.length;
      for (let i = 0; i < len; i++) {
        const curX = w.direction === 'horizontal' ? w.startX + i : w.startX;
        const curY = w.direction === 'vertical' ? w.startY + i : w.startY;
        if (curX === x && curY === y) return true;
      }
      return false;
    });

    if (intersectingWords.length > 0) {
      if (intersectingWords.length === 1) {
        setSelectedWord(intersectingWords[0]);
      } else {
        if (selectedWord?.number !== intersectingWords[0].number) {
          const isCurrentHorizontal = selectedWord?.direction === 'horizontal';
          const nextWord = intersectingWords.find(w => w.direction !== (isCurrentHorizontal ? 'horizontal' : 'vertical')) 
            || intersectingWords[0];
          setSelectedWord(nextWord);
        }
      }
    }
    setFocusedCell({ x, y });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Columna Izquierda/Centro: Grilla del Crucigrama */}
      <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800/60 p-6 rounded-2xl backdrop-blur-sm shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            🧠 Crucigrama de TDAH
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-zinc-400 bg-zinc-800/80 px-3.5 py-1.5 rounded-lg border border-zinc-700/50 flex items-center gap-1.5">
              ⏱️ {formatTime(timer)}
            </span>
            <button
              onClick={resetPuzzle}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-3 py-1.5 rounded-lg transition-colors border border-zinc-700/30"
            >
              Reiniciar
            </button>
          </div>
        </div>

        {/* Contenedor con Scroll para móviles */}
        <div className="overflow-auto max-w-full pb-4">
          <div 
            className="grid gap-1 bg-zinc-950 p-4 rounded-xl border border-zinc-900"
            style={{ 
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
              width: `${GRID_COLS * 34}px`
            }}
          >
            {Array.from({ length: GRID_ROWS }).map((_, y) => (
              Array.from({ length: GRID_COLS }).map((_, x) => {
                const isCellActive = getCellSolution(x, y) !== null;
                const cellNum = getCellNumberLabel(x, y);
                const cellKey = `${x}-${y}`;
                const value = answers[cellKey] || '';
                const isCorrect = verificationResults[cellKey] === true;
                const isWrong = verificationResults[cellKey] === false;

                if (!isCellActive) {
                  return <div key={cellKey} className="aspect-square bg-zinc-950 rounded-md"></div>;
                }

                return (
                  <div key={cellKey} className="relative aspect-square">
                    <input
                      ref={el => { inputRefs.current[cellKey] = el; }}
                      type="text"
                      maxLength={1}
                      value={value}
                      onClick={() => selectWordByCell(x, y)}
                      onChange={e => handleCellChange(x, y, e.target.value)}
                      onKeyDown={e => handleKeyDown(x, y, e)}
                      className={`w-full h-full text-center font-bold text-sm uppercase rounded-md border focus:outline-none transition-all duration-150 select-none
                        ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : ''}
                        ${isWrong ? 'bg-rose-500/10 border-rose-500/40 text-rose-400' : ''}
                        ${!verified && focusedCell?.x === x && focusedCell?.y === y ? 'bg-sky-500/10 border-sky-500/50 text-white shadow-md shadow-sky-500/5' : ''}
                        ${!verified && (focusedCell?.x !== x || focusedCell?.y !== y) ? 'bg-zinc-900 border-zinc-800 text-zinc-100 hover:border-zinc-700 focus:bg-zinc-850' : ''}
                      `}
                    />
                    {cellNum !== null && (
                      <span className="absolute top-0.5 left-1 text-[8px] font-bold text-zinc-500 pointer-events-none">
                        {cellNum}
                      </span>
                    )}
                  </div>
                );
              })
            ))}
          </div>
        </div>

        {/* Sección de Mensajes de Éxito y Formulario del Leaderboard */}
        {showSuccess && (
          <div className="mt-6 bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl animate-fade-in">
            <h3 className="text-emerald-400 font-bold text-base flex items-center gap-1.5">
              🎉 ¡Crucigrama Resuelto con éxito!
            </h3>
            <p className="text-zinc-400 text-xs mt-1">
              Completaste el palabras cruzadas de TDAH en <strong className="text-white">{formatTime(timer)}</strong>.
            </p>

            {!hasSaved ? (
              <form onSubmit={handleSaveScore} className="mt-4 flex gap-3">
                <input
                  type="text"
                  placeholder="Tu Nombre"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  required
                  maxLength={25}
                  className="bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm px-4 py-2.5 rounded-xl flex-1 focus:outline-none focus:border-zinc-700 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors"
                >
                  {isSaving ? 'Guardando...' : 'Registrar en Ranking'}
                </button>
              </form>
            ) : (
              <p className="text-emerald-400 font-semibold text-xs mt-4">
                ✓ ¡Tu puntuación fue registrada con éxito en el Leaderboard!
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={verifyAnswers}
            className="w-full sm:w-auto bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-md shadow-sky-600/10"
          >
            Verificar Respuestas
          </button>
        </div>
      </div>

      {/* Columna Derecha: Pistas del Crucigrama y Leaderboard */}
      <div className="space-y-6">
        {/* Pistas */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 p-6 rounded-2xl shadow-xl">
          <h3 className="text-zinc-100 font-bold text-base mb-4 flex items-center gap-2">
            📝 Pistas del Juego
          </h3>
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
            {WORDS.map(w => (
              <div 
                key={w.number + '-' + w.direction}
                onClick={() => focusCell(w.startX, w.startY)}
                className={`p-3 rounded-xl border transition-all cursor-pointer text-left
                  ${selectedWord?.number === w.number && selectedWord?.direction === w.direction 
                    ? 'bg-sky-500/5 border-sky-500/30' 
                    : 'bg-zinc-950/40 border-zinc-900/80 hover:border-zinc-800'
                  }
                `}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-sky-400">
                    {w.number}. {w.direction === 'horizontal' ? 'Horizontal' : 'Vertical'}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-medium bg-zinc-900 px-2 py-0.5 rounded-md">
                    {w.word.length} letras
                  </span>
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed">{w.clue}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 p-6 rounded-2xl shadow-xl">
          <h3 className="text-zinc-100 font-bold text-base mb-4 flex items-center gap-2">
            🏆 Top 10 - Ranking en Vivo
          </h3>
          <div className="space-y-2.5">
            {leaderboard.length === 0 ? (
              <p className="text-zinc-500 text-xs text-center py-6">
                Sin registros todavía. ¡Sé el primero en completar el crucigrama!
              </p>
            ) : (
              leaderboard.map((item, idx) => (
                <div 
                  key={item.id} 
                  className="flex justify-between items-center bg-zinc-950/60 border border-zinc-900/80 p-3 rounded-xl"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`text-xs font-bold w-5 h-5 rounded-md flex items-center justify-center
                      ${idx === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : ''}
                      ${idx === 1 ? 'bg-zinc-300/20 text-zinc-300 border border-zinc-400/20' : ''}
                      ${idx === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/20' : ''}
                      ${idx > 2 ? 'bg-zinc-900 text-zinc-500' : ''}
                    `}>
                      {idx + 1}
                    </span>
                    <span className="text-zinc-200 font-bold text-xs">{item.nombre}</span>
                  </div>
                  <span className="text-zinc-400 font-semibold text-xs bg-zinc-900/80 px-2 py-1 rounded-lg">
                    ⏱️ {formatTime(item.tiempo_segundos)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

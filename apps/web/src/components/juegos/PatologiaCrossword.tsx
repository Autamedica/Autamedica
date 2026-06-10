import React, { useState, useRef } from 'react';

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
    word: 'CELIACA',
    direction: 'vertical',
    startX: 1,
    startY: 2,
    clue: 'Enteropatía autoinmune desencadenada por la ingesta de gluten que produce atrofia de las vellosidades intestinales.',
  },
  {
    number: 2,
    word: 'CROHN',
    direction: 'horizontal',
    startX: 4,
    startY: 4,
    clue: 'Enfermedad inflamatoria intestinal crónica de afectación transmural y segmentaria, que puede comprometer desde la boca al ano.',
  },
  {
    number: 2,
    word: 'CIRROSIS',
    direction: 'vertical',
    startX: 4,
    startY: 4,
    clue: 'Estadio final de la fibrosis hepática caracterizado por distorsión de la arquitectura y formación de nódulos de regeneración.',
  },
  {
    number: 3,
    word: 'ATEROMA',
    direction: 'horizontal',
    startX: 1,
    startY: 6,
    clue: 'Placa intimal compuesta de lípidos, células inflamatorias y matriz extracelular en arterias de mediano y gran calibre.',
  },
  {
    number: 4,
    word: 'ADENOMA',
    direction: 'vertical',
    startX: 7,
    startY: 6,
    clue: 'Neoplasia epitelial benigna con patrón de crecimiento glandular o derivada de tejidos glandulares.',
  },
  {
    number: 5,
    word: 'EDEMA',
    direction: 'horizontal',
    startX: 5,
    startY: 8,
    clue: 'Acumulación excesiva de líquido seroalbúminoso en el espacio tisular intersticial o cavidades serosas.',
  },
  {
    number: 6,
    word: 'LINFOMA',
    direction: 'horizontal',
    startX: 3,
    startY: 10,
    clue: 'Neoplasia maligna primaria de los ganglios linfáticos y otros órganos del sistema linfático.',
  },
  {
    number: 7,
    word: 'FIBROMA',
    direction: 'vertical',
    startX: 6,
    startY: 10,
    clue: 'Tumor benigno diferenciado constituido exclusivamente por tejido conectivo fibroso maduro.',
  },
];

const GRID_COLS = 11;
const GRID_ROWS = 18;

// Helper to determine if a cell is part of any word and return the correct letter
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

// Helper to get number label for a cell
const getCellNumberLabel = (x: number, y: number): number | null => {
  for (const w of WORDS) {
    if (w.startX === x && w.startY === y) {
      return w.number;
    }
  }
  return null;
};

export default function PatologiaCrossword() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedWord, setSelectedWord] = useState<WordInfo | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ x: number; y: number } | null>(null);
  const [verified, setVerified] = useState(false);
  const [verificationResults, setVerificationResults] = useState<Record<string, boolean>>({});
  const [showSuccess, setShowSuccess] = useState(false);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Reset focus and states
  const resetPuzzle = () => {
    setAnswers({});
    setVerified(false);
    setVerificationResults({});
    setShowSuccess(false);
    setSelectedWord(null);
    setFocusedCell(null);
  };

  // Check if puzzle is completed and correct
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

  const revealSolution = () => {
    const fullSol: Record<string, string> = {};
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const sol = getCellSolution(x, y);
        if (sol) {
          fullSol[`${x}-${y}`] = sol;
        }
      }
    }
    setAnswers(fullSol);
    setVerified(false);
    setVerificationResults({});
  };

  const selectWordHandler = (word: WordInfo) => {
    setSelectedWord(word);
    setFocusedCell({ x: word.startX, y: word.startY });
    const key = `${word.startX}-${word.startY}`;
    inputRefs.current[key]?.focus();
    inputRefs.current[key]?.select();
  };

  // Find word details associated with a cell
  const getWordsForCell = (x: number, y: number): WordInfo[] => {
    return WORDS.filter((w) => {
      const len = w.word.length;
      for (let i = 0; i < len; i++) {
        const curX = w.direction === 'horizontal' ? w.startX + i : w.startX;
        const curY = w.direction === 'vertical' ? w.startY + i : w.startY;
        if (curX === x && curY === y) return true;
      }
      return false;
    });
  };

  const handleCellClick = (x: number, y: number) => {
    const cellWords = getWordsForCell(x, y);
    if (cellWords.length === 0) return;

    let nextWord = cellWords[0];
    if (selectedWord && cellWords.includes(selectedWord)) {
      // Toggle direction if cell has multiple words
      if (cellWords.length > 1) {
        nextWord = cellWords.find((w) => w !== selectedWord) || cellWords[0];
      }
    }
    setSelectedWord(nextWord);
    setFocusedCell({ x, y });
  };

  const handleInputChange = (x: number, y: number, value: string) => {
    const key = `${x}-${y}`;
    const cleanVal = value.slice(-1).toUpperCase().replace(/[^A-Z]/g, '');

    const newAnswers = { ...answers, [key]: cleanVal };
    setAnswers(newAnswers);

    if (verified) {
      // Clear verification on edit
      setVerified(false);
    }

    if (cleanVal && selectedWord) {
      // Find next cell in current word
      const nextIndex = getCellIndexInWord(x, y, selectedWord) + 1;
      if (nextIndex < selectedWord.word.length) {
        const nextX = selectedWord.direction === 'horizontal' ? selectedWord.startX + nextIndex : selectedWord.startX;
        const nextY = selectedWord.direction === 'vertical' ? selectedWord.startY + nextIndex : selectedWord.startY;
        setFocusedCell({ x: nextX, y: nextY });
        const nextKey = `${nextX}-${nextY}`;
        inputRefs.current[nextKey]?.focus();
      }
    }
  };

  const getCellIndexInWord = (x: number, y: number, word: WordInfo): number => {
    if (word.direction === 'horizontal') {
      return x - word.startX;
    } else {
      return y - word.startY;
    }
  };

  const handleKeyDown = (x: number, y: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!selectedWord) return;

    const curIndex = getCellIndexInWord(x, y, selectedWord);

    if (e.key === 'Backspace') {
      const key = `${x}-${y}`;
      if (!answers[key] && curIndex > 0) {
        e.preventDefault();
        const prevIndex = curIndex - 1;
        const prevX = selectedWord.direction === 'horizontal' ? selectedWord.startX + prevIndex : selectedWord.startX;
        const prevY = selectedWord.direction === 'vertical' ? selectedWord.startY + prevIndex : selectedWord.startY;
        setFocusedCell({ x: prevX, y: prevY });
        const prevKey = `${prevX}-${prevY}`;
        inputRefs.current[prevKey]?.focus();
        
        // Remove value from previous cell
        setAnswers((prev) => ({ ...prev, [prevKey]: '' }));
      }
    } else if (e.key === 'ArrowRight' && selectedWord.direction === 'horizontal') {
      if (curIndex + 1 < selectedWord.word.length) {
        const nextX = x + 1;
        setFocusedCell({ x: nextX, y });
        inputRefs.current[`${nextX}-${y}`]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && selectedWord.direction === 'horizontal') {
      if (curIndex > 0) {
        const prevX = x - 1;
        setFocusedCell({ x: prevX, y });
        inputRefs.current[`${prevX}-${y}`]?.focus();
      }
    } else if (e.key === 'ArrowDown' && selectedWord.direction === 'vertical') {
      if (curIndex + 1 < selectedWord.word.length) {
        const nextY = y + 1;
        setFocusedCell({ x, y: nextY });
        inputRefs.current[`${x}-${nextY}`]?.focus();
      }
    } else if (e.key === 'ArrowUp' && selectedWord.direction === 'vertical') {
      if (curIndex > 0) {
        const prevY = y - 1;
        setFocusedCell({ x, y: prevY });
        inputRefs.current[`${x}-${prevY}`]?.focus();
      }
    }
  };

  const isCellHighlighted = (x: number, y: number): boolean => {
    if (!selectedWord) return false;
    const len = selectedWord.word.length;
    for (let i = 0; i < len; i++) {
      const curX = selectedWord.direction === 'horizontal' ? selectedWord.startX + i : selectedWord.startX;
      const curY = selectedWord.direction === 'vertical' ? selectedWord.startY + i : selectedWord.startY;
      if (curX === x && curY === y) return true;
    }
    return false;
  };

  const isCellFocused = (x: number, y: number): boolean => {
    return focusedCell?.x === x && focusedCell?.y === y;
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <span className="text-amber-500 font-semibold tracking-wider text-xs uppercase bg-amber-500/10 px-3 py-1 rounded-full">
          Estudiantes & Profesionales
        </span>
        <h2 className="text-3xl font-light text-white mt-3 mb-2 tracking-wide font-serif">
          Palabras Cruzadas: Patología Especial
        </h2>
        <p className="text-gray-400 max-w-xl mx-auto text-sm leading-relaxed">
          Pone a prueba tus conocimientos sobre patología sistémica y orgánica. Hacé click sobre una pista o una celda para comenzar a escribir.
        </p>
      </div>

      {showSuccess && (
        <div className="mb-6 p-6 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-center backdrop-blur-sm animate-fade-in">
          <p className="text-3xl mb-2">🎉</p>
          <h3 className="text-lg font-semibold text-emerald-400">¡Excelente Diagnóstico!</h3>
          <p className="text-gray-300 text-sm mt-1 max-w-md mx-auto">
            Resolviste todas las definiciones de patología especial de manera perfecta. Tu nivel clínico está a punto.
          </p>
          <button
            onClick={resetPuzzle}
            className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 transition-colors font-medium"
          >
            Jugar de nuevo
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* CROSSWORD GRID CONTAINER */}
        <div className="lg:col-span-7 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 shadow-xl overflow-x-auto flex justify-center backdrop-blur-md">
          <div 
            className="grid gap-1.5 p-1 select-none"
            style={{ 
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
              width: '100%',
              maxWidth: '480px'
            }}
          >
            {Array.from({ length: GRID_ROWS }).map((_, y) => (
              <React.Fragment key={y}>
                {Array.from({ length: GRID_COLS }).map((_, x) => {
                  const solution = getCellSolution(x, y);
                  const cellLabel = getCellNumberLabel(x, y);
                  const isPlayable = solution !== null;
                  const key = `${x}-${y}`;
                  const val = answers[key] || '';

                  let cellBg = 'bg-zinc-950/40 border-zinc-850';
                  let isHighlighted = false;

                  if (isPlayable) {
                    isHighlighted = isCellHighlighted(x, y);
                    const focused = isCellFocused(x, y);

                    if (verified) {
                      cellBg = verificationResults[key]
                        ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
                        : 'bg-rose-950/60 border-rose-500/50 text-rose-400';
                    } else if (focused) {
                      cellBg = 'bg-amber-500/10 border-amber-500 text-amber-300';
                    } else if (isHighlighted) {
                      cellBg = 'bg-zinc-800/80 border-zinc-700 text-white';
                    } else {
                      cellBg = 'bg-zinc-900 border-zinc-800 text-white hover:border-zinc-700';
                    }
                  }

                  return (
                    <div 
                      key={x} 
                      className={`relative aspect-square flex items-center justify-center rounded-md border text-sm font-semibold transition-all ${cellBg}`}
                      onClick={() => isPlayable && handleCellClick(x, y)}
                      style={{ cursor: isPlayable ? 'text' : 'default' }}
                    >
                      {cellLabel && (
                        <span className="absolute top-0.5 left-0.5 text-[9px] font-bold text-zinc-500 select-none">
                          {cellLabel}
                        </span>
                      )}
                      
                      {isPlayable ? (
                        <input
                          ref={(el) => {
                            inputRefs.current[key] = el;
                          }}
                          type="text"
                          maxLength={1}
                          className="w-full h-full bg-transparent text-center focus:outline-none uppercase caret-transparent text-base font-medium"
                          value={val}
                          onChange={(e) => handleInputChange(x, y, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(x, y, e)}
                          onFocus={() => handleCellClick(x, y)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* CLUES & CONTROLS */}
        <div className="lg:col-span-5 space-y-6">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl">
            <button
              onClick={verifyAnswers}
              className="flex-1 min-w-[120px] px-4 py-2.5 bg-amber-500 text-black font-semibold rounded-lg text-sm hover:bg-amber-400 transition-colors shadow-md shadow-amber-500/15"
            >
              Verificar
            </button>
            <button
              onClick={revealSolution}
              className="flex-1 min-w-[120px] px-4 py-2.5 bg-zinc-800 text-zinc-300 font-semibold rounded-lg text-sm hover:bg-zinc-700 border border-zinc-700 transition-colors"
            >
              Revelar
            </button>
            <button
              onClick={resetPuzzle}
              className="px-4 py-2.5 bg-transparent text-zinc-400 font-medium rounded-lg text-sm hover:text-zinc-200 transition-colors"
            >
              Reiniciar
            </button>
          </div>

          {/* Current Selection Panel */}
          {selectedWord && (
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl animate-fade-in">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                Pista Seleccionada: {selectedWord.number} {selectedWord.direction === 'horizontal' ? 'Horizontal' : 'Vertical'}
              </span>
              <p className="text-zinc-200 text-sm mt-1 leading-relaxed">
                {selectedWord.clue}
              </p>
            </div>
          )}

          {/* CLUES COLUMNS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6">
            {/* HORIZONTAL CLUES */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wider text-zinc-400 uppercase border-b border-zinc-800 pb-2">
                Horizontales
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {WORDS.filter((w) => w.direction === 'horizontal').map((w) => {
                  const isSelected = selectedWord === w;
                  return (
                    <div
                      key={`${w.number}-${w.word}`}
                      onClick={() => selectWordHandler(w)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all text-xs leading-relaxed ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/5'
                          : 'bg-zinc-900/30 border-zinc-850 hover:bg-zinc-800/40 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <span className="font-bold text-amber-500 mr-1.5">{w.number}.</span>
                      {w.clue}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* VERTICAL CLUES */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wider text-zinc-400 uppercase border-b border-zinc-800 pb-2">
                Verticales
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {WORDS.filter((w) => w.direction === 'vertical').map((w) => {
                  const isSelected = selectedWord === w;
                  return (
                    <div
                      key={`${w.number}-${w.word}`}
                      onClick={() => selectWordHandler(w)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all text-xs leading-relaxed ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/5'
                          : 'bg-zinc-900/30 border-zinc-850 hover:bg-zinc-800/40 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <span className="font-bold text-amber-500 mr-1.5">{w.number}.</span>
                      {w.clue}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

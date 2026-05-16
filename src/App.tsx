import { useEffect, useRef, useState, useCallback } from 'react';
import { SkyDominanceEngine } from './game/engine';
import { LEVELS } from './game/levels';
import type { GameState } from './game/types';
import './App.css';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SkyDominanceEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [hp, setHp] = useState(5);
  const [maxHp, setMaxHp] = useState(5);
  const [weapon, setWeapon] = useState('Single');
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [unlockedLevels, setUnlockedLevels] = useState(() => {
    try {
      const saved = localStorage.getItem('sky_dominance_unlocked');
      return saved ? parseInt(saved, 10) : 1;
    } catch { return 1; }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new SkyDominanceEngine(canvas);
    engineRef.current = engine;

    engine.onStateChange = (state) => {
      setGameState(state);
      if (state === 'GAME_OVER') {
        const hs = engine.getHighScore();
        setHighScore(hs);
      }
    };

    engine.onScoreChange = (s, c) => {
      setScore(s);
      setCoins(c);
    };

    engine.onHpChange = (h, m) => {
      setHp(h);
      setMaxHp(m);
    };

    engine.onWeaponChange = (w) => setWeapon(w);

    engine.onBossHpChange = (_h, _m) => {
      // Boss HP is rendered on canvas
    };

    engine.onLevelChange = (l) => setLevel(l);

    const saved = engine.getHighScore();
    setHighScore(saved);

    engine.start();

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      engine.handleKeyDown(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => engine.handleKeyUp(e.key);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Mouse handlers
    const handleMouseMove = (e: MouseEvent) => engine.handleMouseMove(e.clientX, e.clientY);
    const handleClick = (e: MouseEvent) => engine.handleClick(e.clientX, e.clientY);

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    // Touch handlers
    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) engine.handleTouch(touch.clientX, touch.clientY);
    };
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
    };

    canvas.addEventListener('touchmove', handleTouch, { passive: false });
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      engine.stop();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchmove', handleTouch);
      canvas.removeEventListener('touchstart', handleTouch);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const startGame = useCallback((lvl = 1, endless = false) => {
    engineRef.current?.startGame(lvl, endless);
  }, []);

  const pauseGame = useCallback(() => engineRef.current?.pause(), []);
  const resumeGame = useCallback(() => engineRef.current?.resume(), []);

  const handleNextLevel = useCallback(() => {
    const nextLevel = level + 1;
    if (nextLevel <= 10) {
      const newUnlocked = Math.max(unlockedLevels, nextLevel);
      setUnlockedLevels(newUnlocked);
      try { localStorage.setItem('sky_dominance_unlocked', String(newUnlocked)); } catch { /* ignore */ }
      startGame(nextLevel);
    } else {
      startGame(1, true); // Endless mode after level 10
    }
  }, [level, unlockedLevels, startGame]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />

      {/* ===== MAIN MENU ===== */}
      {gameState === 'MENU' && (
        <div className="menu-overlay">
          <div className="menu-bg" />
          <div className="menu-content">
            <h1 className="game-title">
              <span className="title-sky">SKY</span>
              <span className="title-dominance">DOMINANCE</span>
            </h1>
            <p className="game-subtitle">Ace of the Skies</p>

            <div className="menu-buttons">
              <button className="menu-btn btn-play" onClick={() => startGame(1)}>
                <span className="btn-icon">▶</span> PLAY
              </button>
              <button className="menu-btn btn-levels" onClick={() => setShowLevelSelect(true)}>
                <span className="btn-icon">☰</span> LEVEL SELECT
              </button>
              <button className="menu-btn btn-endless" onClick={() => startGame(1, true)}>
                <span className="btn-icon">∞</span> ENDLESS MODE
              </button>
            </div>

            <div className="menu-stats">
              <p>HIGH SCORE: <span className="stat-value">{highScore.toLocaleString()}</span></p>
            </div>

            <div className="menu-controls">
              <p><strong>Controls:</strong></p>
              <p>WASD / Arrow Keys - Move</p>
              <p>Mouse / Touch - Aim &amp; Move</p>
              <p>E or Q - Nuke Skill</p>
              <p>ESC or P - Pause</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== LEVEL SELECT ===== */}
      {showLevelSelect && gameState === 'MENU' && (
        <div className="level-select-overlay">
          <div className="level-select-content">
            <h2 className="level-select-title">SELECT LEVEL</h2>
            <div className="level-grid">
              {LEVELS.map((lvl) => {
                const isUnlocked = lvl.level <= unlockedLevels;
                return (
                  <button
                    key={lvl.level}
                    className={`level-btn ${!isUnlocked ? 'locked' : ''} ${selectedLevel === lvl.level ? 'selected' : ''}`}
                    onClick={() => {
                      if (isUnlocked) {
                        setSelectedLevel(lvl.level);
                        setShowLevelSelect(false);
                        startGame(lvl.level);
                      }
                    }}
                    disabled={!isUnlocked}
                  >
                    <span className="level-num">{lvl.level}</span>
                    <span className="level-name">{lvl.name}</span>
                    {!isUnlocked && <span className="level-lock">🔒</span>}
                  </button>
                );
              })}
            </div>
            <button className="menu-btn btn-back" onClick={() => setShowLevelSelect(false)}>
              BACK
            </button>
          </div>
        </div>
      )}

      {/* ===== PAUSE SCREEN ===== */}
      {gameState === 'PAUSED' && (
        <div className="pause-overlay">
          <div className="pause-content">
            <h2 className="pause-title">PAUSED</h2>
            <div className="pause-stats">
              <p>Score: {score.toLocaleString()}</p>
              <p>Coins: {coins}</p>
              <p>Weapon: {weapon}</p>
            </div>
            <div className="pause-buttons">
              <button className="menu-btn btn-resume" onClick={resumeGame}>
                <span className="btn-icon">▶</span> RESUME
              </button>
              <button className="menu-btn btn-restart" onClick={() => startGame(level)}>
                <span className="btn-icon">↻</span> RESTART
              </button>
              <button className="menu-btn btn-quit" onClick={() => { engineRef.current?.setState('MENU'); }}>
                <span className="btn-icon">✖</span> QUIT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== GAME OVER SCREEN ===== */}
      {gameState === 'GAME_OVER' && (
        <div className="gameover-overlay">
          <div className="gameover-content">
            <h2 className="gameover-title">MISSION FAILED</h2>
            <div className="gameover-stats">
              <p className="gameover-score">Score: <span>{score.toLocaleString()}</span></p>
              <p className="gameover-coins">Coins: <span>{coins}</span></p>
              <p className="gameover-high">High Score: <span>{Math.max(highScore, score).toLocaleString()}</span></p>
              <p className="gameover-level">Level: <span>{level}</span></p>
            </div>
            <div className="gameover-buttons">
              <button className="menu-btn btn-restart" onClick={() => startGame(level)}>
                <span className="btn-icon">↻</span> RETRY
              </button>
              <button className="menu-btn btn-menu" onClick={() => { engineRef.current?.setState('MENU'); }}>
                <span className="btn-icon">⌂</span> MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== LEVEL COMPLETE SCREEN ===== */}
      {gameState === 'LEVEL_COMPLETE' && (
        <div className="level-complete-overlay">
          <div className="level-complete-content">
            <h2 className="level-complete-title">LEVEL COMPLETE!</h2>
            <p className="level-complete-name">Level {level}: {LEVELS[level - 1]?.name}</p>
            <div className="level-complete-stats">
              <p>Score: <span>{score.toLocaleString()}</span></p>
              <p>Coins: <span>{coins}</span></p>
              <p>HP Remaining: <span>{hp} / {maxHp}</span></p>
            </div>
            <div className="star-rating">
              {[1, 2, 3].map((star) => (
                <span key={star} className={`star ${hp >= maxHp * (4 - star) / 3 ? 'filled' : ''}`}>★</span>
              ))}
            </div>
            <div className="level-complete-buttons">
              {level < 10 ? (
                <button className="menu-btn btn-next" onClick={handleNextLevel}>
                  <span className="btn-icon">▶</span> NEXT LEVEL
                </button>
              ) : (
                <button className="menu-btn btn-endless" onClick={() => startGame(1, true)}>
                  <span className="btn-icon">∞</span> ENDLESS MODE
                </button>
              )}
              <button className="menu-btn btn-menu" onClick={() => { engineRef.current?.setState('MENU'); }}>
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== IN-GAME HUD (React overlay for pause button) ===== */}
      {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
        <div className="hud-overlay">
          <button className="pause-btn" onClick={gameState === 'PLAYING' ? pauseGame : resumeGame}>
            {gameState === 'PLAYING' ? '⏸' : '▶'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

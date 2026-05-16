// ===== GAME TYPES =====

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'LEVEL_COMPLETE';

export type WeaponType = 'single' | 'double' | 'spread' | 'laser' | 'missile' | 'rapid';

export type PowerUpType = 'double' | 'spread' | 'laser' | 'missile' | 'shield' | 'rapid';

export type EnemyType = 'green' | 'red' | 'tank' | 'dive';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  speed: number;
  weapon: WeaponType;
  weaponTimer: number;
  shootCooldown: number;
  invulnerable: boolean;
  invulnTimer: number;
  shieldActive: boolean;
  shieldTimer: number;
  rapidTimer: number;
  laserTimer: number;
  missileTimer: number;
  tilt: number;
  engineParticles: Particle[];
}

export interface Enemy extends Entity {
  type: EnemyType;
  hp: number;
  maxHp: number;
  speed: number;
  speedX: number;
  shootTimer: number;
  shootInterval: number;
  scoreValue: number;
  movePattern: 'straight' | 'zigzag' | 'diagonal' | 'dive';
  zigzagPhase: number;
  flashTimer: number;
}

export interface Boss extends Entity {
  hp: number;
  maxHp: number;
  speed: number;
  speedX: number;
  phase: 'entering' | 'strafe_left' | 'strafe_right' | 'bombing' | 'defeated';
  phaseTimer: number;
  shootTimer: number;
  shootInterval: number;
  flashTimer: number;
  attackPattern: number;
  entered: boolean;
}

export interface Bullet extends Entity {
  speed: number;
  speedX: number;
  isPlayer: boolean;
  damage: number;
  isLaser?: boolean;
  isMissile?: boolean;
  targetX?: number;
  targetY?: number;
}

export interface PowerUp extends Entity {
  type: PowerUpType;
  speed: number;
  bobPhase: number;
}

export interface Coin extends Entity {
  speed: number;
  value: number;
  bobPhase: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  active: boolean;
  type: 'explosion' | 'spark' | 'trail' | 'smoke';
}

export interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  alpha: number;
}

export interface GameData {
  score: number;
  coins: number;
  highScore: number;
  level: number;
  difficulty: Difficulty;
  isPaused: boolean;
  screenShake: { x: number; y: number; intensity: number; duration: number };
  combo: number;
  comboTimer: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  difficultyMultiplier: number;
}

export interface LevelConfig {
  level: number;
  name: string;
  spawnRate: number;
  scrollSpeed: number;
  bulletSpeed: number;
  enemyHpMultiplier: number;
  enemyTypes: EnemyType[];
  hasBoss: boolean;
  bossType?: 'bomber' | 'ace';
  targetScore: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  shoot: boolean;
  skill: boolean;
  mouseX: number;
  mouseY: number;
  useMouse: boolean;
}

export const POWERUP_NAMES: Record<PowerUpType, string> = {
  double: 'Double Shot',
  spread: 'Triple Spread',
  laser: 'Laser Beam',
  missile: 'Homing Missile',
  shield: 'Shield',
  rapid: 'Rapid Fire',
};

export const POWERUP_COLORS: Record<PowerUpType, string> = {
  double: '#4169E1',
  spread: '#FF6347',
  laser: '#00FF7F',
  missile: '#FF8C00',
  shield: '#00BFFF',
  rapid: '#FFD700',
};

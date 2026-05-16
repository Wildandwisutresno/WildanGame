import type {
  GameState, Player, Enemy, Boss, Bullet, PowerUp, Coin, Particle, Cloud,
  GameData, InputState, EnemyType, PowerUpType, LevelConfig,
} from './types';
import { LEVELS, ENDLESS_LEVEL } from './levels';
import { POWERUP_NAMES, POWERUP_COLORS } from './types';

// ===== CONSTANTS =====
const CANVAS_W = 720;
const CANVAS_H = 900;
const PLAYER_SIZE = 60;
const PLAYER_SPEED = 6;
const PLAYER_MAX_HP = 5;
const SHOOT_COOLDOWN = 200; // ms
const RAPID_SHOOT_COOLDOWN = 80;
const INVULN_DURATION = 60; // frames (1s)
const SHIELD_DURATION = 600; // frames (10s)
const POWERUP_DURATION = 600; // frames (10s)
const COIN_HEAL_THRESHOLD = 50;

export class SkyDominanceEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: GameState = 'MENU';
  lastTime = 0;
  animFrameId = 0;

  // Game data
  data: GameData = {
    score: 0,
    coins: 0,
    highScore: 0,
    level: 1,
    difficulty: 'normal',
    isPaused: false,
    screenShake: { x: 0, y: 0, intensity: 0, duration: 0 },
    combo: 0,
    comboTimer: 0,
    bossSpawned: false,
    bossDefeated: false,
    difficultyMultiplier: 1,
  };

  // Entities
  player!: Player;
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  bullets: Bullet[] = [];
  powerUps: PowerUp[] = [];
  coins: Coin[] = [];
  particles: Particle[] = [];
  clouds: Cloud[] = [];

  // Input
  input: InputState = {
    left: false, right: false, up: false, down: false,
    shoot: false, skill: false,
    mouseX: CANVAS_W / 2, mouseY: CANVAS_H - 100,
    useMouse: false,
  };

  // Timers
  enemySpawnTimer = 0;
  lastShootTime = 0;
  gameTime = 0;
  endlessMode = false;
  currentLevel: LevelConfig = LEVELS[0];

  // Assets
  images: Record<string, HTMLImageElement> = {};
  imagesLoaded = false;

  // Skill
  skillCooldown = 0;
  skillMaxCooldown = 3600; // 60s in frames

  // Callbacks
  onStateChange?: (state: GameState) => void;
  onScoreChange?: (score: number, coins: number) => void;
  onHpChange?: (hp: number, maxHp: number) => void;
  onWeaponChange?: (weapon: string) => void;
  onBossHpChange?: (hp: number, maxHp: number) => void;
  onLevelChange?: (level: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.loadAssets();
    this.initClouds();
    this.loadHighScore();
  }

  // ===== ASSET LOADING =====
  loadAssets() {
    const assetList = [
      { key: 'player', src: '/assets/player_jet.png' },
      { key: 'enemy_green', src: '/assets/enemy_green.png' },
      { key: 'enemy_red', src: '/assets/enemy_red.png' },
      { key: 'boss_bomber', src: '/assets/boss_bomber.png' },
      { key: 'boss_ace', src: '/assets/boss_ace.png' },
      { key: 'enemy_tank', src: '/assets/enemy_tank.png' },
    ];

    let loaded = 0;
    assetList.forEach(({ key, src }) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === assetList.length) this.imagesLoaded = true;
      };
      img.onerror = () => {
        loaded++;
        if (loaded === assetList.length) this.imagesLoaded = true;
      };
      img.src = src;
      this.images[key] = img;
    });
  }

  loadHighScore() {
    try {
      const saved = localStorage.getItem('sky_dominance_high_score');
      if (saved) this.data.highScore = parseInt(saved, 10);
    } catch { /* ignore */ }
  }

  saveHighScore() {
    try {
      if (this.data.score > this.data.highScore) {
        this.data.highScore = this.data.score;
        localStorage.setItem('sky_dominance_high_score', String(this.data.highScore));
      }
    } catch { /* ignore */ }
  }

  // ===== INITIALIZATION =====
  initPlayer() {
    this.player = {
      x: CANVAS_W / 2 - PLAYER_SIZE / 2,
      y: CANVAS_H - 120,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      active: true,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      speed: PLAYER_SPEED,
      weapon: 'single',
      weaponTimer: 0,
      shootCooldown: SHOOT_COOLDOWN,
      invulnerable: false,
      invulnTimer: 0,
      shieldActive: false,
      shieldTimer: 0,
      rapidTimer: 0,
      laserTimer: 0,
      missileTimer: 0,
      tilt: 0,
      engineParticles: [],
    };
  }

  initClouds() {
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      this.clouds.push(this.createCloud(true));
    }
  }

  createCloud(randomY = false): Cloud {
    return {
      x: Math.random() * CANVAS_W,
      y: randomY ? Math.random() * CANVAS_H : -100,
      width: 80 + Math.random() * 200,
      height: 40 + Math.random() * 80,
      speed: 0.5 + Math.random() * 1.5,
      alpha: 0.1 + Math.random() * 0.3,
    };
  }

  // ===== GAME FLOW CONTROL =====
  startGame(level = 1, endless = false) {
    this.endlessMode = endless;
    this.data.level = level;
    this.data.score = 0;
    this.data.coins = 0;
    this.data.bossSpawned = false;
    this.data.bossDefeated = false;
    this.data.combo = 0;
    this.data.comboTimer = 0;
    this.data.difficultyMultiplier = 1;
    this.currentLevel = endless ? ENDLESS_LEVEL : (LEVELS[level - 1] || LEVELS[0]);

    this.enemies = [];
    this.boss = null;
    this.bullets = [];
    this.powerUps = [];
    this.coins = [];
    this.particles = [];
    this.enemySpawnTimer = 0;
    this.lastShootTime = 0;
    this.gameTime = 0;
    this.skillCooldown = 0;

    this.initPlayer();
    this.initClouds();
    this.setState('PLAYING');
    this.notifyAll();
  }

  setState(newState: GameState) {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  pause() {
    if (this.state === 'PLAYING') {
      this.data.isPaused = true;
      this.setState('PAUSED');
    }
  }

  resume() {
    if (this.state === 'PAUSED') {
      this.data.isPaused = false;
      this.setState('PLAYING');
    }
  }

  // ===== MAIN GAME LOOP =====
  start() {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 16.667, 3); // cap delta
      this.lastTime = now;

      if (this.state === 'PLAYING' && !this.data.isPaused) {
        this.update(dt);
      }
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
  }

  // ===== UPDATE =====
  update(dt: number) {
    this.gameTime++;
    const gd = this.currentLevel;

    this.updateClouds(dt);
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    if (this.boss) this.updateBoss(dt);
    this.updateBullets(dt);
    this.updatePowerUps(dt);
    this.updateCoins(dt);
    this.updateParticles(dt);
    this.updateScreenShake(dt);
    this.updateCombo(dt);
    this.updateSkill(dt);

    // Spawn enemies
    this.enemySpawnTimer += 16.667 * dt;
    const adjustedSpawnRate = this.endlessMode
      ? Math.max(200, gd.spawnRate - this.data.score * 0.01)
      : gd.spawnRate;

    if (!this.data.bossSpawned && this.enemySpawnTimer >= adjustedSpawnRate) {
      this.enemySpawnTimer = 0;
      this.spawnEnemy();
    }

    // Check boss spawn condition
    if (!this.data.bossSpawned && gd.hasBoss && this.data.score >= gd.targetScore) {
      this.spawnBoss();
    }

    // Check collisions
    this.checkCollisions();

    // Cleanup
    this.cleanupEntities();

    // Check game over
    if (this.player.hp <= 0) {
      this.playerDeath();
    }

    // Check level complete
    if (this.data.bossDefeated && !this.endlessMode) {
      this.setState('LEVEL_COMPLETE');
    }
  }

  // ===== PLAYER UPDATE =====
  updatePlayer(dt: number) {
    const p = this.player;
    if (!p.active) return;

    // Movement
    let dx = 0, dy = 0;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    // Mouse/touch movement
    if (this.input.useMouse) {
      const targetX = this.input.mouseX - p.width / 2;
      const targetY = this.input.mouseY - p.height / 2;
      const diffX = targetX - p.x;
      const diffY = targetY - p.y;
      const dist = Math.sqrt(diffX * diffX + diffY * diffY);
      if (dist > 5) {
        const speed = p.speed * dt;
        p.x += (diffX / dist) * Math.min(speed, dist);
        p.y += (diffY / dist) * Math.min(speed, dist);
        dx = diffX / dist;
      }
    } else {
      p.x += dx * p.speed * dt;
      p.y += dy * p.speed * dt;
    }

    // Clamp to canvas
    p.x = Math.max(0, Math.min(CANVAS_W - p.width, p.x));
    p.y = Math.max(0, Math.min(CANVAS_H - p.height, p.y));

    // Tilt animation
    const targetTilt = dx * 0.3;
    p.tilt += (targetTilt - p.tilt) * 0.1 * dt;

    // Invulnerability timer
    if (p.invulnerable) {
      p.invulnTimer -= dt;
      if (p.invulnTimer <= 0) {
        p.invulnerable = false;
      }
    }

    // Shield timer
    if (p.shieldActive) {
      p.shieldTimer -= dt;
      if (p.shieldTimer <= 0) {
        p.shieldActive = false;
      }
    }

    // Rapid fire timer
    if (p.rapidTimer > 0) {
      p.rapidTimer -= dt;
      if (p.rapidTimer <= 0) {
        p.shootCooldown = SHOOT_COOLDOWN;
      }
    }

    // Auto-shoot
    const now = performance.now();
    const cooldown = p.rapidTimer > 0 ? RAPID_SHOOT_COOLDOWN : p.shootCooldown;
    if (now - this.lastShootTime >= cooldown) {
      this.shoot();
      this.lastShootTime = now;
    }

    // Engine trail particles
    if (this.gameTime % 2 === 0) {
      this.particles.push({
        x: p.x + p.width / 2 + (Math.random() - 0.5) * 10,
        y: p.y + p.height - 5,
        vx: (Math.random() - 0.5) * 1,
        vy: 2 + Math.random() * 2,
        radius: 3 + Math.random() * 3,
        maxRadius: 8,
        color: p.shieldActive ? '#00BFFF' : p.rapidTimer > 0 ? '#FFD700' : '#87CEEB',
        alpha: 0.6,
        life: 20,
        maxLife: 20,
        active: true,
        type: 'trail',
      });
    }
  }

  // ===== SHOOTING =====
  shoot() {
    const p = this.player;
    const cx = p.x + p.width / 2;
    const cy = p.y;

    switch (p.weapon) {
      case 'single':
        this.spawnBullet(cx - 4, cy, 0, -10, true, 1);
        break;
      case 'double':
        this.spawnBullet(cx - 12, cy, 0, -10, true, 1);
        this.spawnBullet(cx + 4, cy, 0, -10, true, 1);
        break;
      case 'spread':
        this.spawnBullet(cx - 4, cy, 0, -10, true, 1);
        this.spawnBullet(cx - 4, cy, -3, -9, true, 1);
        this.spawnBullet(cx - 4, cy, 3, -9, true, 1);
        break;
      case 'laser':
        this.spawnBullet(cx - 3, cy, 0, -15, true, 2, true);
        this.spawnBullet(cx - 3, cy - 20, 0, -15, true, 2, true);
        break;
      case 'missile':
        this.spawnBullet(cx - 4, cy, 0, -8, true, 3, false, true);
        break;
      case 'rapid':
        this.spawnBullet(cx - 4, cy, (Math.random() - 0.5) * 2, -12, true, 1);
        break;
    }
  }

  spawnBullet(x: number, y: number, sx: number, sy: number, isPlayer: boolean, damage: number, isLaser = false, isMissile = false) {
    this.bullets.push({
      x, y, width: isLaser ? 6 : 8, height: isLaser ? 30 : 20,
      active: true, speed: Math.abs(sy), speedX: sx, isPlayer, damage, isLaser, isMissile,
    });
  }

  // ===== ENEMY SYSTEM =====
  spawnEnemy() {
    const types = this.currentLevel.enemyTypes;
    const type = types[Math.floor(Math.random() * types.length)];
    const x = Math.random() * (CANVAS_W - 50);

    const enemy = this.createEnemy(type, x, -60);
    this.enemies.push(enemy);
  }

  createEnemy(type: EnemyType, x: number, y: number): Enemy {
    const mult = this.currentLevel.enemyHpMultiplier * this.data.difficultyMultiplier;
    const configs = {
      green: { hp: 2, speed: 2, score: 100, w: 50, h: 50, pattern: 'straight' as const, interval: 2000 },
      red: { hp: 3, speed: 3, score: 250, w: 50, h: 50, pattern: 'zigzag' as const, interval: 1500 },
      tank: { hp: 8, speed: 1, score: 300, w: 50, h: 50, pattern: 'straight' as const, interval: 3000 },
      dive: { hp: 2, speed: 5, score: 200, w: 45, h: 45, pattern: 'dive' as const, interval: 0 },
    };
    const cfg = configs[type];

    return {
      x, y, width: cfg.w, height: cfg.h,
      active: true, type, hp: Math.ceil(cfg.hp * mult), maxHp: Math.ceil(cfg.hp * mult),
      speed: cfg.speed, speedX: type === 'red' ? (Math.random() > 0.5 ? 2 : -2) : type === 'dive' ? (Math.random() - 0.5) * 4 : 0,
      shootTimer: 0, shootInterval: cfg.interval,
      scoreValue: cfg.score, movePattern: cfg.pattern,
      zigzagPhase: Math.random() * Math.PI * 2,
      flashTimer: 0,
    };
  }

  updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.active) continue;

      e.flashTimer = Math.max(0, e.flashTimer - dt);

      switch (e.movePattern) {
        case 'straight':
          e.y += e.speed * dt;
          break;
        case 'zigzag':
          e.y += e.speed * dt;
          e.zigzagPhase += 0.05 * dt;
          e.x += Math.sin(e.zigzagPhase) * 3 * dt;
          break;
        case 'diagonal':
          e.y += e.speed * dt;
          e.x += e.speedX * dt;
          break;
        case 'dive':
          e.y += e.speed * dt;
          e.x += e.speedX * dt;
          break;
      }

      // Clamp X
      e.x = Math.max(0, Math.min(CANVAS_W - e.width, e.x));

      // Shooting
      if (e.shootInterval > 0) {
        e.shootTimer += 16.667 * dt;
        if (e.shootTimer >= e.shootInterval) {
          e.shootTimer = 0;
          this.enemyShoot(e);
        }
      }

      // Dive bomber special - aim at player
      if (e.type === 'dive') {
        const dx = (this.player.x + this.player.width / 2) - (e.x + e.width / 2);
        e.speedX += (dx * 0.001) * dt;
        e.speedX = Math.max(-4, Math.min(4, e.speedX));
      }
    }
  }

  enemyShoot(e: Enemy) {
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height;
    const bs = this.currentLevel.bulletSpeed;

    if (e.type === 'red') {
      // Spread shot
      for (let i = -1; i <= 1; i++) {
        this.bullets.push({
          x: cx - 3, y: cy, width: 8, height: 8,
          active: true, speed: bs, speedX: i * 1.5, isPlayer: false, damage: 1,
        });
      }
    } else if (e.type === 'tank') {
      // Heavy slow shot
      this.bullets.push({
        x: cx - 6, y: cy, width: 12, height: 12,
        active: true, speed: bs * 0.6, speedX: 0, isPlayer: false, damage: 2,
      });
    } else {
      // Single shot aimed at player
      const pdx = (this.player.x + this.player.width / 2) - cx;
      const pdy = (this.player.y + this.player.height / 2) - cy;
      const dist = Math.sqrt(pdx * pdx + pdy * pdy);
      const sx = dist > 0 ? (pdx / dist) * bs * 0.5 : 0;

      this.bullets.push({
        x: cx - 3, y: cy, width: 8, height: 8,
        active: true, speed: bs, speedX: sx, isPlayer: false, damage: 1,
      });
    }
  }

  // ===== BOSS SYSTEM =====
  spawnBoss() {
    this.data.bossSpawned = true;
    const isBomber = this.currentLevel.bossType === 'bomber';
    const size = isBomber ? 200 : 160;

    this.boss = {
      x: CANVAS_W / 2 - size / 2,
      y: -size,
      width: size,
      height: size,
      active: true,
      hp: isBomber ? 500 : 700,
      maxHp: isBomber ? 500 : 700,
      speed: 2,
      speedX: isBomber ? 3 : 5,
      phase: 'entering',
      phaseTimer: 0,
      shootTimer: 0,
      shootInterval: isBomber ? 40 : 20,
      flashTimer: 0,
      attackPattern: 0,
      entered: false,
    };

    this.onBossHpChange?.(this.boss.hp, this.boss.maxHp);
  }

  updateBoss(dt: number) {
    const b = this.boss!;
    if (!b.active) return;
    b.flashTimer = Math.max(0, b.flashTimer - dt);
    b.shootTimer += dt;

    const isBomber = this.currentLevel.bossType === 'bomber';
    const targetY = isBomber ? 120 : 80;

    switch (b.phase) {
      case 'entering':
        b.y += b.speed * dt;
        if (b.y >= targetY) {
          b.y = targetY;
          b.phase = 'strafe_right';
          b.entered = true;
        }
        break;

      case 'strafe_left':
        b.x -= b.speedX * dt;
        if (b.x <= 50) {
          b.x = 50;
          b.phase = isBomber ? 'strafe_right' : 'bombing';
        }
        this.bossShoot();
        break;

      case 'strafe_right':
        b.x += b.speedX * dt;
        if (b.x >= CANVAS_W - b.width - 50) {
          b.x = CANVAS_W - b.width - 50;
          b.phase = 'strafe_left';
        }
        this.bossShoot();
        break;

      case 'bombing':
        b.y += b.speed * dt;
        if (b.y >= 400) {
          b.y = 400;
          b.phase = 'entering';
        }
        this.bossShoot();
        break;

      case 'defeated':
        b.y += b.speed * 2 * dt;
        const fadeAlpha = b as unknown as Record<string, number>;
        fadeAlpha._alpha = Math.max(0, fadeAlpha._alpha !== undefined ? fadeAlpha._alpha - 0.02 * dt : 1);
        if (b.y > CANVAS_H + 100) {
          b.active = false;
          this.data.bossDefeated = true;
          this.data.score += 5000;
          this.data.difficultyMultiplier += 0.5;
        }
        break;
    }

    // Phase change based on HP
    const hpPercent = b.hp / b.maxHp;
    if (hpPercent < 0.5 && b.attackPattern === 0) {
      b.attackPattern = 1;
      b.speedX *= 1.5;
      b.shootInterval = Math.max(10, b.shootInterval * 0.6);
    }
    if (hpPercent < 0.2 && b.attackPattern === 1) {
      b.attackPattern = 2;
      b.speedX *= 1.3;
      b.shootInterval = Math.max(5, b.shootInterval * 0.5);
    }
  }

  bossShoot() {
    const b = this.boss!;
    if (b.shootTimer < b.shootInterval) return;
    b.shootTimer = 0;

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height * 0.8;
    const isBomber = this.currentLevel.bossType === 'bomber';

    if (isBomber) {
      if (b.attackPattern === 0) {
        // Basic: 1 bullet down
        this.bullets.push({
          x: cx - 4, y: cy, width: 8, height: 12,
          active: true, speed: 4, speedX: 0, isPlayer: false, damage: 1,
        });
      } else if (b.attackPattern === 1) {
        // Spread: 3-way
        for (let i = -1; i <= 1; i++) {
          this.bullets.push({
            x: cx - 4 + i * 10, y: cy, width: 8, height: 10,
            active: true, speed: 5, speedX: i * 2, isPlayer: false, damage: 1,
          });
        }
      } else {
        // Crazy: 5-way + big bomb
        for (let i = -2; i <= 2; i++) {
          this.bullets.push({
            x: cx - 4 + i * 8, y: cy, width: 6, height: 8,
            active: true, speed: 4 + Math.abs(i), speedX: i * 1.5, isPlayer: false, damage: 1,
          });
        }
        this.bullets.push({
          x: cx - 8, y: cy + 20, width: 16, height: 16,
          active: true, speed: 3, speedX: 0, isPlayer: false, damage: 3,
        });
      }
    } else {
      // Ace Interceptor - more complex patterns
      if (b.attackPattern === 0) {
        // Sweep: aimed burst
        const pdx = (this.player.x + this.player.width / 2) - cx;
        const angle = Math.atan2(200, pdx);
        for (let i = -1; i <= 1; i++) {
          const a = angle + i * 0.3;
          this.bullets.push({
            x: cx - 3, y: cy, width: 6, height: 6,
            active: true, speed: 6, speedX: Math.sin(a) * 6, isPlayer: false, damage: 1,
          });
        }
      } else if (b.attackPattern === 1) {
        // Circle spread
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.bullets.push({
            x: cx - 3, y: cy, width: 6, height: 6,
            active: true, speed: 4, speedX: Math.cos(a) * 4, isPlayer: false, damage: 1,
          });
        }
      } else {
        // Danmaku: dense pattern
        for (let i = -3; i <= 3; i++) {
          this.bullets.push({
            x: cx - 3 + i * 6, y: cy, width: 5, height: 5,
            active: true, speed: 3 + Math.random() * 3, speedX: i * (0.5 + Math.random()), isPlayer: false, damage: 1,
          });
        }
      }
    }
  }

  // ===== BULLET UPDATE =====
  updateBullets(dt: number) {
    for (const b of this.bullets) {
      if (!b.active) continue;

      if (b.isMissile && b.isPlayer) {
        // Homing missile - find nearest enemy
        let nearest: Enemy | Boss | null = null;
        let nearestDist = Infinity;
        for (const e of this.enemies) {
          if (!e.active) continue;
          const d = Math.hypot(e.x + e.width / 2 - b.x, e.y + e.height / 2 - b.y);
          if (d < nearestDist) { nearestDist = d; nearest = e; }
        }
        if (this.boss && this.boss.active && this.boss.entered) {
          const d = Math.hypot(this.boss.x + this.boss.width / 2 - b.x, this.boss.y + this.boss.height / 2 - b.y);
          if (d < nearestDist) { nearestDist = d; nearest = this.boss; }
        }
        if (nearest) {
          const tx = nearest.x + nearest.width / 2;
          const ty = nearest.y + nearest.height / 2;
          const angle = Math.atan2(ty - b.y, tx - b.x);
          b.speedX += (Math.cos(angle) * 0.3 - b.speedX * 0.02) * dt;
          b.speed += (6 - b.speed) * 0.05 * dt;
          b.x += Math.cos(angle) * b.speed * dt;
          b.y += Math.sin(angle) * b.speed * dt;
        } else {
          b.y -= b.speed * dt;
        }
      } else {
        b.y += b.isPlayer ? -b.speed * dt : b.speed * dt;
        b.x += b.speedX * dt;
      }

      if (b.x < -20 || b.x > CANVAS_W + 20 || b.y < -50 || b.y > CANVAS_H + 50) {
        b.active = false;
      }
    }
  }

  // ===== POWER-UP SYSTEM =====
  spawnPowerUp(x: number, y: number) {
    const types: PowerUpType[] = ['double', 'spread', 'laser', 'missile', 'shield', 'rapid'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.powerUps.push({
      x, y, width: 36, height: 36,
      active: true, type, speed: 2, bobPhase: Math.random() * Math.PI * 2,
    });
  }

  updatePowerUps(dt: number) {
    for (const p of this.powerUps) {
      if (!p.active) continue;
      p.y += p.speed * dt;
      p.bobPhase += 0.05 * dt;
      p.x += Math.sin(p.bobPhase) * 0.5;
    }
  }

  applyPowerUp(type: PowerUpType) {
    const p = this.player;
    switch (type) {
      case 'double':
        p.weapon = 'double';
        p.weaponTimer = POWERUP_DURATION;
        break;
      case 'spread':
        p.weapon = 'spread';
        p.weaponTimer = POWERUP_DURATION;
        break;
      case 'laser':
        p.weapon = 'laser';
        p.weaponTimer = POWERUP_DURATION;
        p.laserTimer = POWERUP_DURATION;
        break;
      case 'missile':
        p.weapon = 'missile';
        p.weaponTimer = POWERUP_DURATION;
        p.missileTimer = POWERUP_DURATION;
        break;
      case 'shield':
        p.shieldActive = true;
        p.shieldTimer = SHIELD_DURATION;
        break;
      case 'rapid':
        p.weapon = 'rapid';
        p.rapidTimer = POWERUP_DURATION;
        p.shootCooldown = RAPID_SHOOT_COOLDOWN;
        p.weaponTimer = POWERUP_DURATION;
        break;
    }
    this.onWeaponChange?.(POWERUP_NAMES[type]);
  }

  // ===== COIN SYSTEM =====
  spawnCoin(x: number, y: number) {
    this.coins.push({
      x, y, width: 24, height: 24,
      active: true, speed: 2, value: 10, bobPhase: Math.random() * Math.PI * 2,
    });
  }

  updateCoins(dt: number) {
    for (const c of this.coins) {
      if (!c.active) continue;
      c.y += c.speed * dt;
      c.bobPhase += 0.05 * dt;
      c.x += Math.sin(c.bobPhase) * 0.5;
    }
  }

  // ===== PARTICLES =====
  spawnExplosion(x: number, y: number, count: number, color: string, size: number) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * size * 0.3,
        maxRadius: size,
        color: i % 3 === 0 ? '#FFFFFF' : i % 3 === 1 ? '#FFD700' : color,
        alpha: 1,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        active: true,
        type: 'explosion',
      });
    }
  }

  spawnSparks(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        radius: 2 + Math.random() * 2,
        maxRadius: 4,
        color: '#FFD700',
        alpha: 1,
        life: 10,
        maxLife: 10,
        active: true,
        type: 'spark',
      });
    }
  }

  updateParticles(dt: number) {
    for (const p of this.particles) {
      if (!p.active && p.type !== 'explosion' && p.type !== 'spark' && p.type !== 'smoke' && p.type !== 'trail') continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.type === 'explosion') {
        p.radius = Math.min(p.maxRadius, p.radius + 0.5 * dt);
      }
      if (p.life <= 0) {
        p.active = false;
      }
    }
  }

  // ===== CLOUDS =====
  updateClouds(dt: number) {
    const scrollSpeed = this.state === 'PLAYING' ? this.currentLevel.scrollSpeed : 1;
    for (const c of this.clouds) {
      c.y += (c.speed + scrollSpeed * 0.3) * dt;
      if (c.y > CANVAS_H + c.height) {
        Object.assign(c, this.createCloud());
      }
    }
  }

  // ===== COLLISIONS =====
  checkCollisions() {
    const p = this.player;
    if (!p.active) return;

    const px = p.x + 5;
    const py = p.y + 5;
    const pw = p.width - 10;
    const ph = p.height - 10;

    // Player bullets vs Enemies
    for (const b of this.bullets) {
      if (!b.active || !b.isPlayer) continue;
      for (const e of this.enemies) {
        if (!e.active) continue;
        if (this.aabb(b.x, b.y, b.width, b.height, e.x, e.y, e.width, e.height)) {
          b.active = false;
          e.hp -= b.damage;
          e.flashTimer = 5;
          this.spawnSparks(b.x, b.y);

          if (e.hp <= 0) {
            e.active = false;
            this.data.score += e.scoreValue;
            this.data.combo++;
            this.data.comboTimer = 120;
            const comboMult = Math.min(5, 1 + this.data.combo * 0.1);
            this.data.score += Math.floor(e.scoreValue * (comboMult - 1));

            this.spawnExplosion(e.x + e.width / 2, e.y + e.height / 2, 15, '#FF4500', 40);

            // Drop coin
            if (Math.random() < 0.4) {
              this.spawnCoin(e.x + e.width / 2 - 12, e.y + e.height / 2);
            }
            // Drop power-up
            if (Math.random() < 0.12) {
              this.spawnPowerUp(e.x + e.width / 2 - 18, e.y + e.height / 2);
            }

            this.notifyScore();
          }
          break;
        }
      }

      // Player bullets vs Boss
      if (this.boss && this.boss.active && this.boss.entered) {
        const bsh = this.boss;
        if (this.aabb(b.x, b.y, b.width, b.height, bsh.x + 20, bsh.y + 20, bsh.width - 40, bsh.height - 40)) {
          b.active = false;
          bsh.hp -= b.damage;
          bsh.flashTimer = 5;
          this.spawnSparks(b.x, b.y);
          this.onBossHpChange?.(bsh.hp, bsh.maxHp);

          if (bsh.hp <= 0 && bsh.phase !== 'defeated') {
            bsh.phase = 'defeated';
            this.spawnExplosion(bsh.x + bsh.width / 2, bsh.y + bsh.height / 2, 50, '#FF0000', 100);
            this.spawnExplosion(bsh.x + bsh.width / 4, bsh.y + bsh.height / 4, 30, '#FF4500', 60);
            this.spawnExplosion(bsh.x + bsh.width * 0.75, bsh.y + bsh.height * 0.75, 30, '#FF4500', 60);
          }
        }
      }
    }

    // Enemy bullets vs Player
    if (!p.invulnerable) {
      for (const b of this.bullets) {
        if (!b.active || b.isPlayer) continue;
        if (this.aabb(b.x, b.y, b.width, b.height, px, py, pw, ph)) {
          b.active = false;
          if (p.shieldActive) {
            p.shieldActive = false;
            this.spawnExplosion(b.x, b.y, 8, '#00BFFF', 20);
          } else {
            p.hp -= b.damage;
            p.invulnerable = true;
            p.invulnTimer = INVULN_DURATION;
            this.triggerScreenShake(8, 15);
            this.spawnExplosion(p.x + p.width / 2, p.y + p.height / 2, 10, '#FF0000', 30);
            this.onHpChange?.(p.hp, p.maxHp);
          }
          break;
        }
      }

      // Enemy planes vs Player
      for (const e of this.enemies) {
        if (!e.active) continue;
        if (this.aabb(px, py, pw, ph, e.x, e.y, e.width, e.height)) {
          e.active = false;
          this.spawnExplosion(e.x + e.width / 2, e.y + e.height / 2, 15, '#FF4500', 40);
          if (p.shieldActive) {
            p.shieldActive = false;
          } else {
            p.hp -= 1;
            p.invulnerable = true;
            p.invulnTimer = INVULN_DURATION;
            this.triggerScreenShake(10, 20);
            this.onHpChange?.(p.hp, p.maxHp);
          }
          break;
        }
      }

      // Boss vs Player
      if (this.boss && this.boss.active && this.boss.entered) {
        const bsh = this.boss;
        if (this.aabb(px, py, pw, ph, bsh.x + 20, bsh.y + 20, bsh.width - 40, bsh.height - 40)) {
          if (p.shieldActive) {
            p.shieldActive = false;
          } else {
            p.hp -= 2;
            p.invulnerable = true;
            p.invulnTimer = INVULN_DURATION * 2;
            this.triggerScreenShake(15, 25);
            this.onHpChange?.(p.hp, p.maxHp);
          }
        }
      }
    }

    // Player vs Power-ups
    for (const pu of this.powerUps) {
      if (!pu.active) continue;
      if (this.aabb(px, py, pw, ph, pu.x, pu.y, pu.width, pu.height)) {
        pu.active = false;
        this.applyPowerUp(pu.type);
        this.spawnExplosion(pu.x + pu.width / 2, pu.y + pu.height / 2, 8, POWERUP_COLORS[pu.type], 25);
      }
    }

    // Player vs Coins
    for (const c of this.coins) {
      if (!c.active) continue;
      if (this.aabb(px, py, pw, ph, c.x, c.y, c.width, c.height)) {
        c.active = false;
        this.data.coins++;
        this.data.score += c.value;

        // Heal every 50 coins
        if (this.data.coins % COIN_HEAL_THRESHOLD === 0 && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          this.onHpChange?.(p.hp, p.maxHp);
          this.spawnExplosion(p.x + p.width / 2, p.y, 8, '#00FF7F', 20);
        }

        this.notifyScore();
      }
    }
  }

  aabb(x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  // ===== SCREEN SHAKE =====
  triggerScreenShake(intensity: number, duration: number) {
    this.data.screenShake = { x: 0, y: 0, intensity, duration };
  }

  updateScreenShake(dt: number) {
    const ss = this.data.screenShake;
    if (ss.duration > 0) {
      ss.duration -= dt;
      const factor = ss.duration / 15;
      ss.x = (Math.random() - 0.5) * ss.intensity * factor * 2;
      ss.y = (Math.random() - 0.5) * ss.intensity * factor * 2;
    } else {
      ss.x = 0;
      ss.y = 0;
    }
  }

  // ===== COMBO =====
  updateCombo(dt: number) {
    if (this.data.comboTimer > 0) {
      this.data.comboTimer -= dt;
      if (this.data.comboTimer <= 0) {
        this.data.combo = 0;
      }
    }
  }

  // ===== SKILL =====
  updateSkill(dt: number) {
    if (this.skillCooldown > 0) {
      this.skillCooldown -= dt;
    }
  }

  useSkill() {
    if (this.skillCooldown > 0 || this.state !== 'PLAYING') return;
    this.skillCooldown = this.skillMaxCooldown;

    // Nuke: destroy all enemies, damage boss
    for (const e of this.enemies) {
      if (e.active) {
        e.active = false;
        this.data.score += e.scoreValue;
        this.spawnExplosion(e.x + e.width / 2, e.y + e.height / 2, 15, '#FF4500', 40);
      }
    }
    if (this.boss && this.boss.active) {
      this.boss.hp -= 100;
      this.spawnExplosion(this.boss.x + this.boss.width / 2, this.boss.y + this.boss.height / 2, 40, '#FF0000', 80);
      this.onBossHpChange?.(this.boss.hp, this.boss.maxHp);
      if (this.boss.hp <= 0 && this.boss.phase !== 'defeated') {
        this.boss.phase = 'defeated';
      }
    }

    // Destroy enemy bullets
    for (const b of this.bullets) {
      if (!b.isPlayer) b.active = false;
    }

    this.triggerScreenShake(20, 30);
    this.notifyScore();
  }

  // ===== PLAYER DEATH =====
  playerDeath() {
    this.player.active = false;
    this.spawnExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 30, '#FF4500', 60);
    this.triggerScreenShake(20, 40);
    this.saveHighScore();
    setTimeout(() => {
      this.setState('GAME_OVER');
    }, 1500);
  }

  // ===== CLEANUP =====
  cleanupEntities() {
    this.enemies = this.enemies.filter(e => e.active && e.y < CANVAS_H + 100);
    this.bullets = this.bullets.filter(b => b.active);
    this.powerUps = this.powerUps.filter(p => p.active && p.y < CANVAS_H + 50);
    this.coins = this.coins.filter(c => c.active && c.y < CANVAS_H + 50);
    this.particles = this.particles.filter(p => p.life > 0);
  }

  // ===== RENDERING =====
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Screen shake
    ctx.translate(this.data.screenShake.x, this.data.screenShake.y);

    // Background
    this.renderBackground(ctx);

    // Game entities
    if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'GAME_OVER' || this.state === 'LEVEL_COMPLETE') {
      this.renderClouds(ctx);
      this.renderCoins(ctx);
      this.renderPowerUps(ctx);
      this.renderEnemies(ctx);
      if (this.boss) this.renderBoss(ctx);
      this.renderBullets(ctx);
      this.renderPlayer(ctx);
      this.renderParticles(ctx);
    }

    // HUD
    if (this.state === 'PLAYING' || this.state === 'PAUSED') {
      this.renderHUD(ctx);
    }

    ctx.restore();
  }

  renderBackground(ctx: CanvasRenderingContext2D) {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#87CEEB');
    grad.addColorStop(1, '#4682B4');
    ctx.fillStyle = grad;
    ctx.fillRect(-20, -20, CANVAS_W + 40, CANVAS_H + 40);
  }

  renderClouds(ctx: CanvasRenderingContext2D) {
    for (const c of this.clouds) {
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.width / 2, c.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x - c.width * 0.2, c.y + c.height * 0.1, c.width * 0.35, c.height * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x + c.width * 0.2, c.y + c.height * 0.1, c.width * 0.35, c.height * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  renderPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    if (!p || !p.active) return;

    // Invulnerability flash
    if (p.invulnerable && Math.floor(this.gameTime / 4) % 2 === 0) return;

    ctx.save();
    ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
    ctx.rotate(p.tilt);

    // Shield effect
    if (p.shieldActive) {
      ctx.beginPath();
      ctx.arc(0, 0, p.width * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 191, 255, ${0.5 + Math.sin(this.gameTime * 0.1) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Draw player image
    const img = this.images['player'];
    if (img && img.complete) {
      ctx.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height);
    } else {
      // Fallback
      ctx.fillStyle = '#4169E1';
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
    }

    ctx.restore();
  }

  renderEnemies(ctx: CanvasRenderingContext2D) {
    for (const e of this.enemies) {
      if (!e.active) continue;

      ctx.save();

      // Flash white when hit
      if (e.flashTimer > 0) {
        ctx.globalAlpha = 0.7;
      }

      const imgKey = e.type === 'green' ? 'enemy_green' : e.type === 'red' ? 'enemy_red' : 'enemy_tank';
      const img = this.images[imgKey];

      if (img && img.complete) {
        ctx.drawImage(img, e.x, e.y, e.width, e.height);
      } else {
        ctx.fillStyle = e.type === 'green' ? '#32CD32' : e.type === 'red' ? '#FF0000' : '#FFD700';
        ctx.fillRect(e.x, e.y, e.width, e.height);
      }

      // HP bar for tank enemies
      if (e.type === 'tank' || e.hp < e.maxHp) {
        const barW = e.width;
        const barH = 4;
        const barY = e.y - 8;
        ctx.fillStyle = '#333';
        ctx.fillRect(e.x, barY, barW, barH);
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(e.x, barY, barW * (e.hp / e.maxHp), barH);
      }

      ctx.restore();
    }
  }

  renderBoss(ctx: CanvasRenderingContext2D) {
    const b = this.boss;
    if (!b || !b.active) return;

    ctx.save();

    if (b.flashTimer > 0) {
      ctx.globalAlpha = 0.7;
    }

    const imgKey = this.currentLevel.bossType === 'bomber' ? 'boss_bomber' : 'boss_ace';
    const img = this.images[imgKey];

    if (b.phase === 'defeated') {
      const fadeAlpha = b as unknown as Record<string, number>;
      ctx.globalAlpha = fadeAlpha._alpha !== undefined ? fadeAlpha._alpha : 1;
    }

    if (img && img.complete) {
      ctx.drawImage(img, b.x, b.y, b.width, b.height);
    } else {
      ctx.fillStyle = '#333333';
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    ctx.restore();
  }

  renderBullets(ctx: CanvasRenderingContext2D) {
    for (const b of this.bullets) {
      if (!b.active) continue;

      if (b.isPlayer) {
        if (b.isLaser) {
          // Laser beam
          ctx.save();
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00FF7F';
          ctx.fillStyle = '#00FF7F';
          ctx.fillRect(b.x, b.y, b.width, b.height);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(b.x + 1, b.y, b.width - 2, b.height);
          ctx.restore();
        } else if (b.isMissile) {
          // Missile
          ctx.save();
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#FF8C00';
          ctx.fillStyle = '#FF8C00';
          ctx.beginPath();
          ctx.arc(b.x + b.width / 2, b.y + b.height / 2, 5, 0, Math.PI * 2);
          ctx.fill();
          // Trail
          ctx.fillStyle = '#FFD700';
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(b.x + b.width / 2, b.y + b.height / 2 + 8, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Normal player bullet
          ctx.save();
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#FF4500';
          const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
          grad.addColorStop(0, '#FF4500');
          grad.addColorStop(1, '#FFD700');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else {
        // Enemy bullet
        ctx.save();
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#FF0000';
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8B0000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  renderPowerUps(ctx: CanvasRenderingContext2D) {
    for (const pu of this.powerUps) {
      if (!pu.active) continue;

      ctx.save();
      const color = POWERUP_COLORS[pu.type];

      // Glow
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;

      // Box
      ctx.fillStyle = color;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      const r = 5;
      const x = pu.x, y = pu.y, w = pu.width, h = pu.height;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Icon letter
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = pu.type === 'double' ? '2' : pu.type === 'spread' ? '3' : pu.type === 'laser' ? 'L' : pu.type === 'missile' ? 'M' : pu.type === 'shield' ? 'S' : 'R';
      ctx.fillText(icon, x + w / 2, y + h / 2);

      ctx.restore();
    }
  }

  renderCoins(ctx: CanvasRenderingContext2D) {
    for (const c of this.coins) {
      if (!c.active) continue;

      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#FFD700';

      // Coin body
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#DAA520';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x + c.width / 2, c.y + c.height / 2, c.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Star
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#DAA520';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2605', c.x + c.width / 2, c.y + c.height / 2);

      ctx.restore();
    }
  }

  renderParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;

      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.type === 'explosion') {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.3, '#FFD700');
        grad.addColorStop(0.7, '#FF4500');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
        ctx.stroke();
      } else if (p.type === 'trail' || p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  renderHUD(ctx: CanvasRenderingContext2D) {
    // Score
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.strokeText(`SCORE: ${this.data.score}`, 15, 35);
    ctx.fillText(`SCORE: ${this.data.score}`, 15, 35);

    // Coins
    ctx.strokeText(`COINS: ${this.data.coins}`, 15, 65);
    ctx.fillText(`COINS: ${this.data.coins}`, 15, 65);

    // High Score
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.strokeText(`BEST: ${this.data.highScore}`, 15, 88);
    ctx.fillText(`BEST: ${this.data.highScore}`, 15, 88);

    // HP Bar (hearts)
    const heartSize = 24;
    const heartY = 25;
    const startX = CANVAS_W / 2 - (this.player.maxHp * heartSize) / 2;
    for (let i = 0; i < this.player.maxHp; i++) {
      const hx = startX + i * (heartSize + 4);
      this.drawHeart(ctx, hx, heartY, heartSize, i < this.player.hp ? '#4169E1' : '#333333');
    }

    // Weapon name
    if (this.player.weapon !== 'single') {
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.textAlign = 'center';
      const wepName = POWERUP_NAMES[this.player.weapon as PowerUpType] || this.player.weapon.toUpperCase();
      ctx.strokeText(`WEAPON: ${wepName}`, CANVAS_W / 2, 60);
      ctx.fillText(`WEAPON: ${wepName}`, CANVAS_W / 2, 60);

      // Weapon timer bar
      const maxTimer = POWERUP_DURATION;
      const timer = this.player.weaponTimer;
      if (timer > 0) {
        const barW = 120;
        const barH = 6;
        const barX = CANVAS_W / 2 - barW / 2;
        const barY = 68;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = POWERUP_COLORS[this.player.weapon as PowerUpType] || '#FFD700';
        ctx.fillRect(barX, barY, barW * (timer / maxTimer), barH);
      }
    }

    // Combo
    if (this.data.combo > 1) {
      ctx.font = `bold ${18 + Math.min(this.data.combo, 20)}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(`${this.data.combo}x COMBO`, CANVAS_W - 15, 65);
      ctx.fillText(`${this.data.combo}x COMBO`, CANVAS_W - 15, 65);
    }

    // Level
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeText(`LEVEL ${this.data.level}: ${this.currentLevel.name}`, CANVAS_W / 2, 90);
    ctx.fillText(`LEVEL ${this.data.level}: ${this.currentLevel.name}`, CANVAS_W / 2, 90);

    // Boss HP Bar
    if (this.boss && this.boss.active && this.boss.entered) {
      const barW = CANVAS_W * 0.6;
      const barH = 16;
      const barX = (CANVAS_W - barW) / 2;
      const barY = CANVAS_H - 40;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);

      const hpPercent = Math.max(0, this.boss.hp / this.boss.maxHp);
      const hpColor = hpPercent > 0.5 ? '#FF0000' : hpPercent > 0.2 ? '#FF4500' : '#FFD700';
      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, barW * hpPercent, barH);

      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFF';
      ctx.fillText('BOSS HP', CANVAS_W / 2, barY + 12);
    }

    // Skill button
    this.renderSkillButton(ctx);

    ctx.restore();
  }

  drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    const s = size / 24;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(12, 21);
    ctx.bezierCurveTo(12, 21, 2, 15, 2, 8);
    ctx.bezierCurveTo(2, 4, 5, 1, 9, 1);
    ctx.bezierCurveTo(11, 1, 12, 3, 12, 3);
    ctx.bezierCurveTo(12, 3, 13, 1, 15, 1);
    ctx.bezierCurveTo(19, 1, 22, 4, 22, 8);
    ctx.bezierCurveTo(22, 15, 12, 21, 12, 21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  renderSkillButton(ctx: CanvasRenderingContext2D) {
    const cx = CANVAS_W - 55;
    const cy = CANVAS_H - 55;
    const r = 35;

    ctx.save();

    // Button bg
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = this.skillCooldown > 0 ? '#444' : '#FF4500';
    ctx.fill();
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Nuke icon
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u2622', cx, cy + 2);

    // Cooldown overlay
    if (this.skillCooldown > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${Math.ceil(this.skillCooldown / 60)}`, cx, cy + 2);
    }

    ctx.restore();
  }

  // ===== NOTIFICATIONS =====
  notifyScore() {
    this.onScoreChange?.(this.data.score, this.data.coins);
  }

  notifyAll() {
    this.onScoreChange?.(this.data.score, this.data.coins);
    this.onHpChange?.(this.player.hp, this.player.maxHp);
    this.onWeaponChange?.(POWERUP_NAMES[this.player.weapon as PowerUpType] || 'Single');
    this.onLevelChange?.(this.data.level);
  }

  // ===== INPUT HANDLING =====
  handleKeyDown(key: string) {
    switch (key.toLowerCase()) {
      case 'arrowleft': case 'a': this.input.left = true; this.input.useMouse = false; break;
      case 'arrowright': case 'd': this.input.right = true; this.input.useMouse = false; break;
      case 'arrowup': case 'w': this.input.up = true; this.input.useMouse = false; break;
      case 'arrowdown': case 's': this.input.down = true; this.input.useMouse = false; break;
      case ' ': this.input.shoot = true; break;
      case 'e': case 'q': this.useSkill(); break;
      case 'escape': case 'p':
        if (this.state === 'PLAYING') this.pause();
        else if (this.state === 'PAUSED') this.resume();
        break;
    }
  }

  handleKeyUp(key: string) {
    switch (key.toLowerCase()) {
      case 'arrowleft': case 'a': this.input.left = false; break;
      case 'arrowright': case 'd': this.input.right = false; break;
      case 'arrowup': case 'w': this.input.up = false; break;
      case 'arrowdown': case 's': this.input.down = false; break;
      case ' ': this.input.shoot = false; break;
    }
  }

  handleMouseMove(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    this.input.mouseX = (x - rect.left) * scaleX;
    this.input.mouseY = (y - rect.top) * scaleY;
    this.input.useMouse = true;
  }

  handleTouch(x: number, y: number) {
    this.handleMouseMove(x, y);
  }

  handleClick(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const cx = (x - rect.left) * scaleX;
    const cy = (y - rect.top) * scaleY;

    // Check skill button click
    const btnCx = CANVAS_W - 55;
    const btnCy = CANVAS_H - 55;
    const dist = Math.hypot(cx - btnCx, cy - btnCy);
    if (dist < 35) {
      this.useSkill();
    }
  }

  // ===== GETTERS =====
  getState() { return this.state; }
  getScore() { return this.data.score; }
  getCoins() { return this.data.coins; }
  getHighScore() { return this.data.highScore; }
  getHp() { return this.player?.hp || 0; }
  getMaxHp() { return this.player?.maxHp || PLAYER_MAX_HP; }
  getLevel() { return this.data.level; }
  getWeapon() { return this.player?.weapon || 'single'; }
  getCurrentLevel() { return this.currentLevel; }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  Settings, 
  RefreshCw, 
  Plus, 
  Eye, 
  EyeOff, 
  Map as MapIcon, 
  Trophy, 
  Clock, 
  Footprints,
  ChevronRight,
  Menu,
  X,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants & Types ---

const CHUNK_SIZE = 20;
const CELL_SIZE = 30;
const WALL_WIDTH = 4;

enum Wall {
  TOP = 1,
  RIGHT = 2,
  BOTTOM = 4,
  LEFT = 8,
}

type Point = { x: number; y: number };

type Cell = {
  walls: number;
  revealed: boolean;
  decoration?: string;
};

type Chunk = {
  cells: Cell[][];
  revealed: boolean[][];
};

type Theme = {
  id: string;
  name: string;
  bg: string;
  wall: string;
  path: string;
  player: string;
  exit: string;
  fog: string;
  decorations: string[];
};

const THEMES: Record<string, Theme> = {
  forest: {
    id: 'forest',
    name: '森林',
    bg: '#064e3b',
    wall: '#10b981',
    path: '#34d399',
    player: '#fbbf24',
    exit: '#f87171',
    fog: '#022c22',
    decorations: ['🌳', '🌲', '🍄', '🪵'],
  },
  city: {
    id: 'city',
    name: '城市',
    bg: '#1e293b',
    wall: '#f1f5f9',
    path: '#38bdf8',
    player: '#f472b6',
    exit: '#fbbf24',
    fog: '#0f172a',
    decorations: ['🏠', '🏢', '🚧', '🧱'],
  },
  cave: {
    id: 'cave',
    name: '洞穴',
    bg: '#1c1917',
    wall: '#d6d3d1',
    path: '#a855f7',
    player: '#fbbf24',
    exit: '#22c55e',
    fog: '#0c0a09',
    decorations: ['🪨', '💎', '🕳️', '⛏️'],
  },
};

// --- Utilities ---

// Deterministic RNG (Mulberry32)
function createRNG(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashCoords(...args: number[]) {
  let h = 0;
  for (const v of args) {
    h = ((h << 5) - h) + v;
    h |= 0;
  }
  return h;
}

// --- Maze Generation ---

function generateClassicMaze(width: number, height: number, seed: number): Cell[][] {
  const rng = createRNG(seed);
  const maze: Cell[][] = Array.from({ length: height }, () => 
    Array.from({ length: width }, () => ({ walls: 15, revealed: false }))
  );

  const stack: Point[] = [{ x: 0, y: 0 }];
  const visited = new Set<string>();
  visited.add('0,0');

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: { p: Point; wall: Wall; opp: Wall }[] = [];

    const dirs = [
      { p: { x: current.x, y: current.y - 1 }, wall: Wall.TOP, opp: Wall.BOTTOM },
      { p: { x: current.x + 1, y: current.y }, wall: Wall.RIGHT, opp: Wall.LEFT },
      { p: { x: current.x, y: current.y + 1 }, wall: Wall.BOTTOM, opp: Wall.TOP },
      { p: { x: current.x - 1, y: current.y }, wall: Wall.LEFT, opp: Wall.RIGHT },
    ];

    for (const d of dirs) {
      if (d.p.x >= 0 && d.p.x < width && d.p.y >= 0 && d.p.y < height && !visited.has(`${d.p.x},${d.p.y}`)) {
        neighbors.push(d);
      }
    }

    if (neighbors.length > 0) {
      const next = neighbors[Math.floor(rng() * neighbors.length)];
      maze[current.y][current.x].walls &= ~next.wall;
      maze[next.p.y][next.p.x].walls &= ~next.opp;
      visited.add(`${next.p.x},${next.p.y}`);
      stack.push(next.p);
    } else {
      stack.pop();
    }
  }

  // Find the unique solution path to avoid placing obstacles on it
  const solutionSet = new Set<string>();
  const queue: { p: Point, path: string[] }[] = [{ p: { x: 0, y: 0 }, path: ['0,0'] }];
  const solVisited = new Set<string>(['0,0']);
  let finalPath: string[] = [];

  while (queue.length > 0) {
    const { p, path: pPath } = queue.shift()!;
    if (p.x === width - 1 && p.y === height - 1) {
      finalPath = pPath;
      break;
    }
    const cell = maze[p.y][p.x];
    const dirs = [
      { dx: 0, dy: -1, wall: Wall.TOP },
      { dx: 1, dy: 0, wall: Wall.RIGHT },
      { dx: 0, dy: 1, wall: Wall.BOTTOM },
      { dx: -1, dy: 0, wall: Wall.LEFT },
    ];
    for (const d of dirs) {
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !(cell.walls & d.wall) && !solVisited.has(`${nx},${ny}`)) {
        solVisited.add(`${nx},${ny}`);
        queue.push({ p: { x: nx, y: ny }, path: [...pPath, `${nx},${ny}`] });
      }
    }
  }
  finalPath.forEach(s => solutionSet.add(s));

  // Add decorations
  const themeKeys = Object.keys(THEMES);
  const theme = THEMES[themeKeys[Math.floor(rng() * themeKeys.length)]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Only place decorations if NOT on the solution path
      if (!solutionSet.has(`${x},${y}`) && rng() < 0.08 && (x !== 0 || y !== 0) && (x !== width - 1 || y !== height - 1)) {
        maze[y][x].decoration = theme.decorations[Math.floor(rng() * theme.decorations.length)];
      }
    }
  }

  return maze;
}

function generateChunk(cx: number, cy: number, globalSeed: number): Chunk {
  const chunkSeed = hashCoords(globalSeed, cx, cy);
  const rng = createRNG(chunkSeed);
  
  const cells: Cell[][] = Array.from({ length: CHUNK_SIZE }, () => 
    Array.from({ length: CHUNK_SIZE }, () => ({ walls: 15, revealed: false }))
  );

  // Determine border openings deterministically (standardized seeds for consistency)
  // Top border
  const topSeed = hashCoords(globalSeed, cx, cy - 1, cy);
  const topRng = createRNG(topSeed);
  const topOpening = Math.floor(topRng() * CHUNK_SIZE);
  cells[0][topOpening].walls &= ~Wall.TOP;

  // Bottom border
  const bottomSeed = hashCoords(globalSeed, cx, cy, cy + 1);
  const bottomRng = createRNG(bottomSeed);
  const bottomOpening = Math.floor(bottomRng() * CHUNK_SIZE);
  cells[CHUNK_SIZE - 1][bottomOpening].walls &= ~Wall.BOTTOM;

  // Left border
  const leftSeed = hashCoords(globalSeed, cx - 1, cx, cy);
  const leftRng = createRNG(leftSeed);
  const leftOpening = Math.floor(leftRng() * CHUNK_SIZE);
  cells[leftOpening][0].walls &= ~Wall.LEFT;

  // Right border
  const rightSeed = hashCoords(globalSeed, cx, cx + 1, cy);
  const rightRng = createRNG(rightSeed);
  const rightOpening = Math.floor(rightRng() * CHUNK_SIZE);
  cells[rightOpening][CHUNK_SIZE - 1].walls &= ~Wall.RIGHT;

  // Internal generation (DFS starting from openings)
  const visited = new Set<string>();
  const stack: Point[] = [{ x: topOpening, y: 0 }];
  visited.add(`${topOpening},0`);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: { p: Point; wall: Wall; opp: Wall }[] = [];

    const dirs = [
      { p: { x: current.x, y: current.y - 1 }, wall: Wall.TOP, opp: Wall.BOTTOM },
      { p: { x: current.x + 1, y: current.y }, wall: Wall.RIGHT, opp: Wall.LEFT },
      { p: { x: current.x, y: current.y + 1 }, wall: Wall.BOTTOM, opp: Wall.TOP },
      { p: { x: current.x - 1, y: current.y }, wall: Wall.LEFT, opp: Wall.RIGHT },
    ];

    for (const d of dirs) {
      if (d.p.x >= 0 && d.p.x < CHUNK_SIZE && d.p.y >= 0 && d.p.y < CHUNK_SIZE && !visited.has(`${d.p.x},${d.p.y}`)) {
        neighbors.push(d);
      }
    }

    if (neighbors.length > 0) {
      const next = neighbors[Math.floor(rng() * neighbors.length)];
      cells[current.y][current.x].walls &= ~next.wall;
      cells[next.p.y][next.p.x].walls &= ~next.opp;
      visited.add(`${next.p.x},${next.p.y}`);
      stack.push(next.p);
    } else {
      stack.pop();
    }
  }

  // Ensure all openings are connected (they should be by DFS, but let's be safe)
  // Actually, DFS from one opening covers the whole chunk if it's a perfect maze.

  // Random decorations
  const themeKeys = Object.keys(THEMES);
  const theme = THEMES[themeKeys[Math.floor(rng() * themeKeys.length)]];
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      if (rng() < 0.03) {
        cells[y][x].decoration = theme.decorations[Math.floor(rng() * theme.decorations.length)];
      }
    }
  }

  return {
    cells,
    revealed: Array.from({ length: CHUNK_SIZE }, () => Array(CHUNK_SIZE).fill(false))
  };
}

// --- Main Component ---

export default function App() {
  // Game State
  const [mode, setMode] = useState<'classic' | 'infinite'>('classic');
  const [mazeSize, setMazeSize] = useState(30);
  const [theme, setTheme] = useState<Theme>(THEMES.forest);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000000));
  const [path, setPath] = useState<Point[]>([{ x: 0, y: 0 }]);
  const [timer, setTimer] = useState(0);
  const [steps, setSteps] = useState(0);
  const [isWon, setIsWon] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickPosRef = useRef({ x: 0, y: 0 });
  const [joystickBase, setJoystickBase] = useState({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [failedMove, setFailedMove] = useState<Point | null>(null);
  const [lastFailedMove, setLastFailedMove] = useState<Point | null>(null);
  const [isRepeatedCollision, setIsRepeatedCollision] = useState(false);
  const [carRotation, setCarRotation] = useState(Math.PI / 4); // Initial rotation for Rocket

  // Classic Maze Data
  const [classicMaze, setClassicMaze] = useState<Cell[][]>([]);
  const [classicRevealed, setClassicRevealed] = useState<boolean[][]>([]);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const chunkStore = useRef<Map<string, Chunk>>(new Map());

  // Audio Context
  const audioCtx = useRef<AudioContext | null>(null);
  const failedMoveTimeoutRef = useRef<number | null>(null);

  const playSound = useCallback((type: 'engine' | 'hit' | 'win') => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtx.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'engine') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    } else if (type === 'hit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    } else if (type === 'win') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (type === 'win' ? 0.5 : 0.2));
  }, []);

  // --- Validation & Movement ---

  const getChunkCoords = useCallback((x: number, y: number) => {
    return {
      cx: Math.floor(x / CHUNK_SIZE),
      cy: Math.floor(y / CHUNK_SIZE),
      lx: ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      ly: ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    };
  }, []);

  const getOrGenChunk = useCallback((cx: number, cy: number) => {
    const key = `${cx},${cy}`;
    if (!chunkStore.current.has(key)) {
      chunkStore.current.set(key, generateChunk(cx, cy, seed));
    }
    return chunkStore.current.get(key)!;
  }, [seed]);

  const isValidMove = useCallback((from: Point, to: Point) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    // Must be adjacent
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

    let cell: Cell | null = null;
    let targetCell: Cell | null = null;

    if (mode === 'classic') {
      if (to.x < 0 || to.x >= mazeSize || to.y < 0 || to.y >= mazeSize) return false;
      cell = classicMaze[from.y][from.x];
      targetCell = classicMaze[to.y][to.x];
    } else {
      const fromCoords = getChunkCoords(from.x, from.y);
      const toCoords = getChunkCoords(to.x, to.y);
      cell = getOrGenChunk(fromCoords.cx, fromCoords.cy).cells[fromCoords.ly][fromCoords.lx];
      targetCell = getOrGenChunk(toCoords.cx, toCoords.cy).cells[toCoords.ly][toCoords.lx];
    }

    // Check walls (check both sides for consistency)
    if (dx === 1 && ((cell.walls & Wall.RIGHT) || (targetCell.walls & Wall.LEFT))) return false;
    if (dx === -1 && ((cell.walls & Wall.LEFT) || (targetCell.walls & Wall.RIGHT))) return false;
    if (dy === 1 && ((cell.walls & Wall.BOTTOM) || (targetCell.walls & Wall.TOP))) return false;
    if (dy === -1 && ((cell.walls & Wall.TOP) || (targetCell.walls & Wall.BOTTOM))) return false;

    // Check decorations (obstacles)
    if (targetCell.decoration) {
      const repeated = lastFailedMove && lastFailedMove.x === to.x && lastFailedMove.y === to.y;
      setIsRepeatedCollision(!!repeated);
      setFailedMove(to);
      setLastFailedMove(to);
      playSound('hit');
      
      if (failedMoveTimeoutRef.current) {
        clearTimeout(failedMoveTimeoutRef.current);
      }
      
      failedMoveTimeoutRef.current = window.setTimeout(() => {
        setFailedMove(null);
        failedMoveTimeoutRef.current = null;
      }, 800); // Slightly longer for better visibility
      
      return false;
    }

    return true;
  }, [mode, mazeSize, classicMaze, lastFailedMove, getChunkCoords, getOrGenChunk, playSound]);

  const handleMove = useCallback((to: Point) => {
    if (isWon) return;

    const last = path[path.length - 1];
    
    // Update rotation (Rocket defaults to ~45deg top-right)
    const dx = to.x - last.x;
    const dy = to.y - last.y;
    if (dx === 1) setCarRotation(Math.PI / 4); // Right
    else if (dx === -1) setCarRotation(-3 * Math.PI / 4); // Left
    else if (dy === 1) setCarRotation(3 * Math.PI / 4); // Down
    else if (dy === -1) setCarRotation(-Math.PI / 4); // Up

    // Backtracking
    if (path.length > 1 && path[path.length - 2].x === to.x && path[path.length - 2].y === to.y) {
      setPath(p => p.slice(0, -1));
      playSound('engine');
      setLastFailedMove(null); // Reset failure tracking on successful move
      setIsRepeatedCollision(false);
      return;
    }

    // New Step
    if (isValidMove(last, to)) {
      // Check if already in path (no loops)
      if (path.some(p => p.x === to.x && p.y === to.y)) return;

      if (!gameStarted) setGameStarted(true);

      const newPath = [...path, to];
      setPath(newPath);
      setSteps(s => s + 1);
      playSound('engine');
      setLastFailedMove(null); // Reset failure tracking on successful move
      setIsRepeatedCollision(false);

      if (mode === 'classic') {
        // Reveal
        const newRevealed = [...classicRevealed];
        const radius = 1;
        for (let rdy = -radius; rdy <= radius; rdy++) {
          for (let rdx = -radius; rdx <= radius; rdx++) {
            const nx = to.x + rdx;
            const ny = to.y + rdy;
            if (nx >= 0 && nx < mazeSize && ny >= 0 && ny < mazeSize) {
              newRevealed[ny][nx] = true;
            }
          }
        }
        setClassicRevealed(newRevealed);

        // Win check
        if (to.x === mazeSize - 1 && to.y === mazeSize - 1) {
          setIsWon(true);
          playSound('win');
        }
      } else {
        // revealInfinite logic inline to avoid dependency issues
        const radius = 1;
        for (let rdy = -radius; rdy <= radius; rdy++) {
          for (let rdx = -radius; rdx <= radius; rdx++) {
            const nx = to.x + rdx;
            const ny = to.y + rdy;
            const coords = getChunkCoords(nx, ny);
            const chunk = getOrGenChunk(coords.cx, coords.cy);
            chunk.revealed[coords.ly][coords.lx] = true;
          }
        }

        const dist = Math.sqrt(to.x * to.x + to.y * to.y);
        setDistanceTraveled(Math.max(distanceTraveled, Math.floor(dist)));
        
        // Infinite mode goal: reach 200 distance
        if (dist >= 200) {
          setIsWon(true);
          playSound('win');
        }
      }
    }
  }, [isWon, path, isValidMove, gameStarted, mode, mazeSize, classicRevealed, distanceTraveled, playSound, getChunkCoords, getOrGenChunk]);

  const revealInfinite = useCallback((x: number, y: number) => {
    const radius = 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const coords = getChunkCoords(nx, ny);
        const chunk = getOrGenChunk(coords.cx, coords.cy);
        chunk.revealed[coords.ly][coords.lx] = true;
      }
    }
  }, [getChunkCoords, getOrGenChunk]);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number | null>(null);
  const lastPointerPos = useRef<Point | null>(null);

  // --- Initialization ---

  const initGame = useCallback((newSeed?: number) => {
    const s = newSeed ?? Math.floor(Math.random() * 1000000);
    setSeed(s);
    setPath([{ x: 0, y: 0 }]);
    setTimer(0);
    setSteps(0);
    setIsWon(false);
    setGameStarted(false);
    setDistanceTraveled(0);
    setParticles([]);
    setShowSolution(false);
    setFailedMove(null);
    setLastFailedMove(null);
    setIsRepeatedCollision(false);
    setCarRotation(Math.PI / 4);
    if (failedMoveTimeoutRef.current) {
      clearTimeout(failedMoveTimeoutRef.current);
      failedMoveTimeoutRef.current = null;
    }

    if (mode === 'classic') {
      const maze = generateClassicMaze(mazeSize, mazeSize, s);
      setClassicMaze(maze);
      const revealed = Array.from({ length: mazeSize }, () => Array(mazeSize).fill(false));
      revealed[0][0] = true;
      // Reveal neighbors
      const neighbors = [[0,1], [1,0], [1,1]];
      neighbors.forEach(([dx, dy]) => {
        if (dx >= 0 && dx < mazeSize && dy >= 0 && dy < mazeSize) revealed[dy][dx] = true;
      });
      setClassicRevealed(revealed);
    } else {
      chunkStore.current.clear();
      revealInfinite(0, 0);
    }
  }, [mode, mazeSize]);

  useEffect(() => {
    initGame(seed);
  }, [mode, mazeSize]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const joystickIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    let timeoutId: number | null = null;
    
    const moveLoop = () => {
      if (!joystickActive || isWon || isPaused || showMenu) return;

      const dx = joystickPosRef.current.x - joystickBase.x;
      const dy = joystickPosRef.current.y - joystickBase.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      let nextDelay = 120; // Default fallback

      if (dist > 5) { // Deadzone check
        const head = path[path.length - 1];
        let next: Point | null = null;
        
        // Direction logic (45-degree split)
        if (Math.abs(dx) > Math.abs(dy)) {
          next = { x: head.x + (dx > 0 ? 1 : -1), y: head.y };
        } else {
          next = { x: head.x, y: head.y + (dy > 0 ? 1 : -1) };
        }
        
        if (next) handleMove(next);

        // Calculate next delay based on distance (Analog Speed)
        // dist ranges from 5 (deadzone) to ~40 (visual limit)
        const maxSpeedDist = 40;
        const minDelay = 80;   // Fastest speed (ms per step)
        const maxDelay = 350;  // Slowest speed (ms per step)
        
        const ratio = Math.min(1, Math.max(0, (dist - 5) / (maxSpeedDist - 5)));
        nextDelay = maxDelay - (maxDelay - minDelay) * ratio;
      } else {
        nextDelay = 100; // Still active but in deadzone, check again soon
      }

      timeoutId = window.setTimeout(moveLoop, nextDelay);
    };

    if (joystickActive && !isWon && !isPaused && !showMenu) {
      moveLoop();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [joystickActive, joystickBase, isWon, isPaused, showMenu, path, handleMove]);

  // --- Timer ---

  useEffect(() => {
    if (gameStarted && !isWon) {
      timerRef.current = window.setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameStarted, isWon]);

  const [showSolution, setShowSolution] = useState(false);
  const [particles, setParticles] = useState<{x: number, y: number, vx: number, vy: number, color: string, life: number}[]>([]);

  // --- Particles ---
  useEffect(() => {
    if (isWon) {
      const newParticles = Array.from({ length: 50 }, () => ({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        color: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][Math.floor(Math.random() * 4)],
        life: 1.0
      }));
      setParticles(newParticles);

      const interval = setInterval(() => {
        setParticles(prev => prev.map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.2,
          life: p.life - 0.02
        })).filter(p => p.life > 0));
      }, 16);
      return () => clearInterval(interval);
    }
  }, [isWon]);

  // --- Solution Solver (BFS) ---
  const solveMaze = useCallback(() => {
    if (mode !== 'classic') return [];
    const queue: { p: Point, path: Point[] }[] = [{ p: { x: 0, y: 0 }, path: [{ x: 0, y: 0 }] }];
    const visited = new Set<string>(['0,0']);

    while (queue.length > 0) {
      const { p, path } = queue.shift()!;
      if (p.x === mazeSize - 1 && p.y === mazeSize - 1) return path;

      const cell = classicMaze[p.y][p.x];
      const dirs = [
        { dx: 0, dy: -1, wall: Wall.TOP },
        { dx: 1, dy: 0, wall: Wall.RIGHT },
        { dx: 0, dy: 1, wall: Wall.BOTTOM },
        { dx: -1, dy: 0, wall: Wall.LEFT },
      ];

      for (const d of dirs) {
        const nx = p.x + d.dx;
        const ny = p.y + d.dy;
        if (nx >= 0 && nx < mazeSize && ny >= 0 && ny < mazeSize && !(cell.walls & d.wall) && !visited.has(`${nx},${ny}`)) {
          visited.add(`${nx},${ny}`);
          queue.push({ p: { x: nx, y: ny }, path: [...path, { x: nx, y: ny }] });
        }
      }
    }
    return [];
  }, [classicMaze, mode, mazeSize]);

  const solutionPath = useMemo(() => showSolution ? solveMaze() : [], [showSolution, solveMaze]);

  const verifyPath = () => {
    if (path.length < 2) return alert('路径太短，无需校验。');
    for (let i = 0; i < path.length - 1; i++) {
      if (!isValidMove(path[i], path[i+1])) {
        alert(`路径在第 ${i+1} 步处无效！`);
        return;
      }
    }
    alert('当前路径合法！');
  };

  // --- Rendering (Updated to include solution and particles) ---

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Safe area for joystick on mobile (bottom left)
    const joystickAreaSize = isMobile ? 120 : 0;
    const drawWidth = width;
    const drawHeight = height - (isMobile ? 80 : 0); // Leave some space at bottom

    const head = path[path.length - 1];
    
    // Camera
    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;

    if (mode === 'classic') {
      const mazeSizePx = mazeSize * CELL_SIZE;
      scale = Math.min(drawWidth / mazeSizePx, drawHeight / mazeSizePx) * 0.95;
      offsetX = (drawWidth - mazeSizePx * scale) / 2;
      offsetY = (drawHeight - mazeSizePx * scale) / 2;
    } else {
      scale = 1.2;
      offsetX = drawWidth / 2 - head.x * CELL_SIZE * scale;
      offsetY = drawHeight / 2 - head.y * CELL_SIZE * scale;
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw Visible Cells
    const viewRadius = mode === 'classic' ? mazeSize : 15;
    const startX = Math.floor(head.x - viewRadius);
    const endX = Math.ceil(head.x + viewRadius);
    const startY = Math.floor(head.y - viewRadius);
    const endY = Math.ceil(head.y + viewRadius);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        let cell: Cell | null = null;
        let revealed = false;

        if (mode === 'classic') {
          if (x >= 0 && x < mazeSize && y >= 0 && y < mazeSize) {
            cell = classicMaze[y][x];
            revealed = classicRevealed[y][x];
          }
        } else {
          const { cx, cy, lx, ly } = getChunkCoords(x, y);
          const chunk = getOrGenChunk(cx, cy);
          cell = chunk.cells[ly][lx];
          revealed = chunk.revealed[ly][lx];
        }

        if (!cell) continue;

        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        // Background
        ctx.fillStyle = theme.bg;
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

        // Decoration
        if (cell.decoration && (!fogEnabled || revealed)) {
          ctx.font = `${CELL_SIZE * 0.6}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.decoration, px + CELL_SIZE / 2, py + CELL_SIZE / 2);
        }

        // Walls
        ctx.strokeStyle = theme.wall;
        ctx.lineWidth = WALL_WIDTH;
        ctx.lineCap = 'round';

        if (cell.walls & Wall.TOP) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + CELL_SIZE, py); ctx.stroke();
        }
        if (cell.walls & Wall.RIGHT) {
          ctx.beginPath(); ctx.moveTo(px + CELL_SIZE, py); ctx.lineTo(px + CELL_SIZE, py + CELL_SIZE); ctx.stroke();
        }
        if (cell.walls & Wall.BOTTOM) {
          ctx.beginPath(); ctx.moveTo(px, py + CELL_SIZE); ctx.lineTo(px + CELL_SIZE, py + CELL_SIZE); ctx.stroke();
        }
        if (cell.walls & Wall.LEFT) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + CELL_SIZE); ctx.stroke();
        }

        // Fog
        if (fogEnabled && !revealed) {
          ctx.fillStyle = theme.fog;
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        }

        // Start/End Markers
        if (mode === 'classic') {
          if (x === 0 && y === 0) {
            ctx.fillStyle = theme.path;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            ctx.globalAlpha = 1.0;
          }
          if (x === mazeSize - 1 && y === mazeSize - 1) {
            ctx.fillStyle = theme.exit;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            ctx.globalAlpha = 1.0;
            ctx.font = `${CELL_SIZE * 0.6}px Arial`;
            ctx.fillText('🏁', px + CELL_SIZE / 2, py + CELL_SIZE / 2);
          }
        } else {
          const dist = Math.sqrt(x*x + y*y);
          if (Math.abs(dist - 200) < 1 && x > 0 && y > 0) {
             ctx.fillStyle = theme.exit;
             ctx.globalAlpha = 0.5;
             ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
             ctx.globalAlpha = 1.0;
          }
        }
      }
    }

    // Draw Solution (Debug)
    if (showSolution && solutionPath.length > 0) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = CELL_SIZE * 0.1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(solutionPath[0].x * CELL_SIZE + CELL_SIZE / 2, solutionPath[0].y * CELL_SIZE + CELL_SIZE / 2);
      for (let i = 1; i < solutionPath.length; i++) {
        ctx.lineTo(solutionPath[i].x * CELL_SIZE + CELL_SIZE / 2, solutionPath[i].y * CELL_SIZE + CELL_SIZE / 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Draw Path
    if (path.length > 1) {
      ctx.strokeStyle = theme.path;
      ctx.lineWidth = CELL_SIZE * 0.3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0].x * CELL_SIZE + CELL_SIZE / 2, path[0].y * CELL_SIZE + CELL_SIZE / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * CELL_SIZE + CELL_SIZE / 2, path[i].y * CELL_SIZE + CELL_SIZE / 2);
      }
      ctx.stroke();
    }

    // Draw Player (Rocket)
    ctx.save();
    ctx.translate(head.x * CELL_SIZE + CELL_SIZE / 2, head.y * CELL_SIZE + CELL_SIZE / 2);
    ctx.rotate(carRotation);
    ctx.font = `${CELL_SIZE * 0.8}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚀', 0, 0);
    ctx.restore();

    // Draw Failed Move (Red X or Forbidden)
    if (failedMove) {
      ctx.fillStyle = '#ef4444';
      ctx.font = `bold ${CELL_SIZE * 0.8}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isRepeatedCollision ? '🚫' : '❌', failedMove.x * CELL_SIZE + CELL_SIZE / 2, failedMove.y * CELL_SIZE + CELL_SIZE / 2);
    }

    ctx.restore();

    // Draw Particles
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;
  }, [classicMaze, classicRevealed, path, theme, fogEnabled, mode, distanceTraveled, showSolution, solutionPath, particles, mazeSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isWon || isPaused || showMenu) return;
      
      const head = path[path.length - 1];
      let next: Point | null = null;
      
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          next = { x: head.x, y: head.y - 1 };
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          next = { x: head.x, y: head.y + 1 };
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          next = { x: head.x - 1, y: head.y };
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          next = { x: head.x + 1, y: head.y };
          break;
      }
      
      if (next) {
        e.preventDefault();
        handleMove(next);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [path, isWon, isPaused, showMenu, handleMove]);

  useEffect(() => {
    const anim = requestAnimationFrame(function loop() {
      draw();
      requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(anim);
  }, [draw]);

  // --- Input Handling ---

  const screenToGrid = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const head = path[path.length - 1];
    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;

    if (mode === 'classic') {
      const mazeSizePx = mazeSize * CELL_SIZE;
      scale = Math.min(canvas.clientWidth / mazeSizePx, canvas.clientHeight / mazeSizePx) * 0.95;
      offsetX = (canvas.clientWidth - mazeSizePx * scale) / 2;
      offsetY = (canvas.clientHeight - mazeSizePx * scale) / 2;
    } else {
      scale = 1.2;
      offsetX = canvas.clientWidth / 2 - head.x * CELL_SIZE * scale;
      offsetY = canvas.clientHeight / 2 - head.y * CELL_SIZE * scale;
    }

    return {
      gx: Math.floor((x - offsetX) / (CELL_SIZE * scale)),
      gy: Math.floor((y - offsetY) / (CELL_SIZE * scale)),
    };
  };

  const pointerStartTime = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    const grid = screenToGrid(e.clientX, e.clientY);
    if (!grid) return;
    
    const head = path[path.length - 1];
    if (grid.gx === head.x && grid.gy === head.y) {
      lastPointerPos.current = { x: grid.gx, y: grid.gy };
      pointerStartTime.current = Date.now();
    } else {
      // Click to move: if adjacent, move there and start tracking
      if (isValidMove(head, { x: grid.gx, y: grid.gy })) {
        handleMove({ x: grid.gx, y: grid.gy });
        lastPointerPos.current = { x: grid.gx, y: grid.gy };
        pointerStartTime.current = 0; // Not a tap-to-undo
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!lastPointerPos.current) return;
    
    const grid = screenToGrid(e.clientX, e.clientY);
    if (!grid) return;

    if (grid.gx !== lastPointerPos.current.x || grid.gy !== lastPointerPos.current.y) {
      // If we moved, it's not a simple tap
      pointerStartTime.current = 0;

      const dx = grid.gx - lastPointerPos.current.x;
      const dy = grid.gy - lastPointerPos.current.y;
      const stepsCount = Math.max(Math.abs(dx), Math.abs(dy));
      
      for (let i = 1; i <= stepsCount; i++) {
        const tx = lastPointerPos.current.x + Math.sign(dx) * (Math.abs(dx) > Math.abs(dy) ? i : 0);
        const ty = lastPointerPos.current.y + Math.sign(dy) * (Math.abs(dy) > Math.abs(dx) ? i : 0);
        handleMove({ x: tx, y: ty });
      }
      
      lastPointerPos.current = { x: grid.gx, y: grid.gy };
    }
  };

  const handlePointerUp = () => {
    if (joystickActive) {
      setJoystickActive(false);
      return;
    }
    if (lastPointerPos.current && pointerStartTime.current > 0) {
      const duration = Date.now() - pointerStartTime.current;
      if (duration < 250 && path.length > 1) {
        setPath(p => p.slice(0, -1));
      }
    }
    lastPointerPos.current = null;
    pointerStartTime.current = 0;
  };

  // --- UI Helpers ---

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen bg-neutral-950 text-white font-sans overflow-hidden flex flex-col select-none">
      {/* Top Bar */}
      <header className="h-16 border-b border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <MapIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <h1 className="font-bold text-lg hidden sm:block">旗舰迷宫</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 px-4 py-1.5 bg-white/5 rounded-full border border-white/10 text-sm">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              <span className="font-mono">{formatTime(timer)}</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <Footprints className="w-4 h-4 text-amber-400" />
              <span className="font-mono">{steps}</span>
            </div>
            {mode === 'infinite' && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <ChevronRight className="w-4 h-4 text-purple-400" />
                  <span className="font-mono">{distanceTraveled}m</span>
                </div>
              </>
            )}
          </div>
          
          <button 
            onClick={() => setShowMenu(true)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative touch-none overflow-hidden min-h-0">
        <canvas 
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="block w-full h-full cursor-crosshair"
          style={{ touchAction: 'none' }}
        />

        {/* Virtual Joystick for Mobile */}
        {isMobile && (
          <div 
            className="absolute bottom-8 left-8 w-32 h-32 flex items-center justify-center z-30"
            onPointerDown={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const bx = rect.left + rect.width / 2;
              const by = rect.top + rect.height / 2;
              setJoystickBase({ x: bx, y: by });
              const pos = { x: e.clientX, y: e.clientY };
              setJoystickPos(pos);
              joystickPosRef.current = pos;
              setJoystickActive(true);
            }}
            onPointerMove={(e) => {
              if (joystickActive) {
                e.stopPropagation();
                const pos = { x: e.clientX, y: e.clientY };
                setJoystickPos(pos);
                joystickPosRef.current = pos;
              }
            }}
          >
            {/* Joystick Base */}
            <div className="w-24 h-24 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center">
              {/* Joystick Handle */}
              <motion.div 
                animate={{ 
                  x: joystickActive ? Math.max(-40, Math.min(40, joystickPos.x - joystickBase.x)) : 0,
                  y: joystickActive ? Math.max(-40, Math.min(40, joystickPos.y - joystickBase.y)) : 0
                }}
                transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                className="w-12 h-12 bg-emerald-500/80 shadow-lg shadow-emerald-500/20 rounded-full border border-white/40"
              />
            </div>
            
            {/* Visual Hint */}
            {!joystickActive && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/40 uppercase tracking-widest animate-pulse whitespace-nowrap">
                按住此处控制方向
              </div>
            )}
          </div>
        )}

        {/* Floating Controls - Moved to bottom right */}
        <div className="absolute bottom-6 right-6 flex items-center gap-2 p-1.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
          <button 
            onClick={() => initGame(seed)}
            className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-xl transition-all active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">重玩</span>
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button 
            onClick={() => initGame()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl transition-all active:scale-95 font-bold"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">新迷宫</span>
          </button>
        </div>
      </main>

      {/* Settings Menu Overlay */}
      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMenu(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-neutral-900 border-l border-white/10 z-40 p-6 flex flex-col gap-8 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  游戏设置
                </h2>
                <button onClick={() => setShowMenu(false)} className="p-2 hover:bg-white/10 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Mode Toggle */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-wider">游戏模式</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/5">
                    <button 
                      onClick={() => setMode('classic')}
                      className={`py-2 rounded-lg text-sm font-medium transition-all ${mode === 'classic' ? 'bg-white/10 text-white shadow-inner' : 'text-white/40 hover:text-white'}`}
                    >
                      经典模式
                    </button>
                    <button 
                      onClick={() => setMode('infinite')}
                      className={`py-2 rounded-lg text-sm font-medium transition-all ${mode === 'infinite' ? 'bg-white/10 text-white shadow-inner' : 'text-white/40 hover:text-white'}`}
                    >
                      无限探索
                    </button>
                  </div>
                </div>

                {/* Size Selector (Classic only) */}
                {mode === 'classic' && (
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider">迷宫尺寸</label>
                    <div className="grid grid-cols-4 gap-2 p-1 bg-black/40 rounded-xl border border-white/5">
                      {[10, 20, 30, 40].map(size => (
                        <button 
                          key={size}
                          onClick={() => setMazeSize(size)}
                          className={`py-2 rounded-lg text-xs font-medium transition-all ${mazeSize === size ? 'bg-white/10 text-white shadow-inner' : 'text-white/40 hover:text-white'}`}
                        >
                          {size}x{size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Theme Selector */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-wider">视觉主题</label>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.values(THEMES).map(t => (
                      <button 
                        key={t.id}
                        onClick={() => setTheme(t)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${theme.id === t.id ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-black/20 border-white/5 text-white/60 hover:border-white/20'}`}
                      >
                        <span className="font-medium">{t.name}</span>
                        <div className="flex gap-1">
                          {t.decorations.slice(0, 2).map((d, i) => <span key={i}>{d}</span>)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fog Toggle */}
                <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    {fogEnabled ? <EyeOff className="w-5 h-5 text-sky-400" /> : <Eye className="w-5 h-5 text-sky-400" />}
                    <span className="font-medium">战争迷雾</span>
                  </div>
                  <button 
                    onClick={() => setFogEnabled(!fogEnabled)}
                    className={`w-12 h-6 rounded-full transition-all relative ${fogEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${fogEnabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {/* Debug Actions */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-wider">辅助功能</label>
                  <button 
                    onClick={verifyPath}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all text-sm"
                  >
                    <Info className="w-4 h-4 text-amber-400" />
                    校验当前路径
                  </button>
                  {mode === 'classic' && (
                    <button 
                      onClick={() => setShowSolution(!showSolution)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-sm ${showSolution ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}`}
                    >
                      <Eye className="w-4 h-4" />
                      {showSolution ? '隐藏正确路径' : '显示正确路径'}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-white/5 text-xs text-white/30 flex items-center gap-2">
                <Info className="w-4 h-4" />
                <span>在迷宫中拖动以绘制路径。</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Victory Modal */}
      <AnimatePresence>
        {isWon && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative bg-neutral-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <Trophy className="w-10 h-10 text-emerald-400" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white">迷宫已突破！</h2>
                <p className="text-white/60">
                  {mode === 'classic' ? '你成功到达了终点。' : '你探索了足够远的距离。'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <div className="text-xs text-white/40 uppercase font-bold mb-1">用时</div>
                  <div className="text-xl font-mono font-bold text-sky-400">{formatTime(timer)}</div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <div className="text-xs text-white/40 uppercase font-bold mb-1">步数</div>
                  <div className="text-xl font-mono font-bold text-amber-400">{steps}</div>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={() => initGame()}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                >
                  开启新挑战
                </button>
                <button 
                  onClick={() => initGame(seed)}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all active:scale-95"
                >
                  再玩一次
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// CCE — Casino Calculator Engine
// Zero-dependency 2D/3D web game engine. One import, one call:
//
//   import { startGame } from './engine/index.js';
//   startGame(projectJson, document.getElementById('game'));

export { startGame, Game, GameNode, hydrate, serialize, NODE_TYPES } from './core.js';
export { AudioEngine } from './audio.js';
export { Input } from './input.js';
export { render2D, hitTest } from './renderer2d.js';
export { Renderer3D } from './renderer3d.js';
export * from './math.js';

export const VERSION = '0.1.0';

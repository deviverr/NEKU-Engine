// Neku Engine — 2D/3D web game engine.
// One import, one call:
//
//   import { startGame } from './engine/index.js';
//   startGame(projectJson, document.getElementById('game'));
//
// 3D (Three.js) loads dynamically only when a scene uses 3D nodes.

export { startGame, Game, GameNode, hydrate, serialize, treeHas3D, NODE_TYPES } from './core.js';
export { AudioEngine } from './audio.js';
export { Input } from './input.js';
export { render2D, drawNode, hitTest } from './renderer2d.js';
export { Physics2D } from './physics2d.js';
export { ScreenFX } from './fx.js';
export * from './math.js';

export const VERSION = '0.2.0';
export const ENGINE_NAME = 'Neku';

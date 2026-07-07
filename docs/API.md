# Neku Engine — API reference

A project is one JSON document (`.neku`): `settings`, `scenes` (trees of nodes),
`scripts`, `assets` (data URLs), `anims`, `prefabs`.

## Script hooks

Scripts attach to nodes. Inside a script, `self` is the node, `game` is the engine.

| Hook | Fires |
|---|---|
| `function ready()` | node entered the running scene |
| `function update(dt)` | every frame, `dt` seconds |
| `function onPress()` | this `Button` (2D) or `Mesh3D` was clicked/tapped |
| `function onInput(e)` | raw events: `{type:'pointerdown/move/up', x, y}` / `{type:'keydown/up', key}` |
| `function onSignal(name, data)` | any `game.emit(name, data)` |
| `function onCollide(other, side)` | physics contact — side: `top/bottom/left/right/overlap` (2D) or `'3d'` |
| `function onChange()` / `onSubmit()` | `TextInput` edits / Enter |

## game

```js
game.find(name)                    // depth-first search by node name
game.spawn(parent, type, props)    // create node ('parent' = node or name)
node.destroy()                     // remove node
game.gotoScene(name)               // switch scene
game.time                          // seconds since start
game.width / game.height
```

**Tweens & timers**
```js
game.tween(node, { x: 100, opacity: 0 }, { duration: 0.4, easing: 'backOut', delay: 0, onDone })
// easings: linear quadIn quadOut cubicIn cubicOut backOut elasticOut bounceOut
game.after(seconds, fn)            // one-shot; returns cancel()
game.every(seconds, fn)            // repeating; returns cancel()
```

**Signals**
```js
game.emit(name, data)              // reaches every onSignal + game.on listener
game.on(name, fn)
// built-ins: 'button' (name), 'press3d' (name), 'change'/'submit' ({name, text})
```

**Keyframe animation** (author in the Timeline panel)
```js
game.playAnim('name', { loop, onDone })
game.stopAnim('name')
```

**Audio** — synthesized, zero files
```js
game.audio.play('coin')  // click tick pop coin win lose jackpot spin whoosh
game.audio.tone({ freq: 440, type: 'square', duration: 0.2, slide: -100, gain: 0.5 })
game.audio.noise({ duration: 0.3, filter: 1200 })
game.audio.setVolume(0.5)
```

**Input**
```js
game.input.isDown('ArrowLeft')     game.input.justPressed(' ')
game.input.pointer                 // { x, y, down } in game coordinates
```

**Random & math** — `game.rand(a,b)` `game.randInt(a,b)` `game.pick(arr)` `game.clamp(v,lo,hi)` `game.lerp(a,b,t)`

**Debugging**
```js
game.watch('hp', hp)               // shows in the Studio's play debug bar
game.pause() / game.resume() / game.stepOnce()
```

**Particles** — on a `Particles` node:
```js
p.burst(30, { colors: ['#ffd700'], up: -80, minSpeed, maxSpeed, life, angle, spread })
```

**3D escape hatch** — `game.THREE` (full Three.js) once a 3D scene loaded.

## Nodes (2D)

Common: `x y rotation scaleX scaleY opacity visible script`

| Type | Key props |
|---|---|
| `Node` | group |
| `Rect` | `w h color radius strokeColor strokeWidth` |
| `Circle` | `radius color` |
| `Label` | `text size color align bold font shadow` |
| `Sprite` | `asset w h` · sheet anim: `sheetCols sheetRows frame fps playing` |
| `Button` | `w h text color textColor textSize radius sound hoverColor pressColor` |
| `TextInput` | `text placeholder size color bg border maxLength` |
| `Tilemap` | `tileset tileW tileH cols rows tiles[] collision` — paint in the 2D viewport |
| `Particles` | `color gravity` + `burst()` |

**Physics 2D** — any of Rect/Circle/Sprite: `body: 'dynamic'|'static'|'area'`,
`vx vy gravityScale bounce colliderW colliderH`; world gravity in
`settings.physics.gravity`. Dynamic bodies expose `_grounded`.

## Nodes (3D)

Common: `x y z rx ry rz sx sy sz`

| Type | Key props |
|---|---|
| `Node3D` | group |
| `Mesh3D` | `shape: box/sphere/plane/cylinder/cone/torus/model` · `w h d radius` · `model` (GLTF asset) · `color texture metalness roughness emissive emissiveIntensity unlit wireframe castShadow receiveShadow` |
| `Camera3D` | `fov near far tx ty tz` (look-at target) |
| `Light3D` | `kind: directional/ambient/point/hemi` · `color intensity` · `tx ty tz` (directional target) |
| `Screen3D` | `w h glow` — renders the live 2D scene onto the mesh; clicks pass through into the 2D UI |

**Physics 3D** (cannon-es, loads only when used) — on `Mesh3D`:
`body3d: 'dynamic'|'static'`, `mass friction restitution`.
World gravity: `settings.physics.gravity3d` (default −9.82).
```js
game.physics3d.impulse(node, x, y, z)
game.physics3d.setVelocity(node, x, y, z)
game.physics3d.velocity(node)      // -> {x, y, z}
```

## Project settings

```js
settings: {
  width, height, background, pixelated,
  uiMode: 'overlay' | 'screen3d',   // screen3d = 2D UI lives on Screen3D meshes
  physics: { gravity: 900, gravity3d: -9.82 },
  fx: { crt: true, curvature, scanlines, vignette, flicker, noise, glow, aberration },
  meta: { author, version, description },   // meta tags in exports
}
```

## File formats

| Ext | Contents |
|---|---|
| `.neku` / `.nk` | project (JSON) |
| `.nkp` | prefab — `{ neku:'prefab', name, node }` |
| `.nkt` | theme — `{ neku:'theme', name, vars }` |
| `.nkx` | Studio plugin (JS, `neku.register*` API) |

## Plugin API (.nkx)

```js
neku.registerTheme('lava', { '--bg': '#1a0500', '--accent': '#ff6a00', /* … */ });
neku.registerTemplate('Platformer', projectJson);   // appears in the main menu
neku.registerTool('My tool', (ed) => { /* editor context */ });
neku.on('play' | 'stop' | 'export' | 'projectLoaded', (data) => {});
neku.log('hello');
```

Plugins run with full editor access — only load `.nkx` files you trust.

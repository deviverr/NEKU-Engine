// Neku Studio script editor — CodeMirror 6 (vendored) with Neku API
// autocomplete and pixel-theme styling driven by the app's CSS variables.

import {
  basicSetup, EditorView, EditorState, Compartment, keymap,
  javascript, autocompletion, indentWithTab,
  HighlightStyle, syntaxHighlighting, tags,
} from '../vendor/codemirror.js';

// Colors come from CSS classes so theme switching restyles code instantly.
const nekuHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.controlKeyword, tags.definitionKeyword], class: 'tk-kw' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'tk-str' },
  { tag: [tags.number, tags.bool, tags.null], class: 'tk-num' },
  { tag: [tags.comment, tags.blockComment, tags.lineComment], class: 'tk-com' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'tk-fn' },
  { tag: tags.propertyName, class: 'tk-prop' },
  { tag: tags.variableName, class: 'tk-var' },
]);

const NEKU_COMPLETIONS = [
  // hooks
  ...['ready()', 'update(dt)', 'onPress()', 'onInput(e)', 'onSignal(name, data)', 'onCollide(other, side)'].map((s) => ({
    label: 'function ' + s.split('(')[0],
    apply: `function ${s} {\n  \n}`,
    type: 'keyword',
    detail: 'neku hook',
  })),
  // game api
  ...[
    ['game.find(name)', 'find node by name'],
    ['game.spawn(parent, type, props)', 'create a node'],
    ['game.tween(node, to, opts)', 'animate properties'],
    ['game.after(seconds, fn)', 'one-shot timer'],
    ['game.every(seconds, fn)', 'repeating timer'],
    ['game.emit(name, data)', 'broadcast signal'],
    ['game.on(name, fn)', 'listen for signal'],
    ['game.audio.play(name)', "sfx: 'click coin win lose jackpot spin'"],
    ['game.audio.tone({freq, type, duration})', 'custom synth tone'],
    ['game.rand(lo, hi)', 'random float'],
    ['game.randInt(lo, hi)', 'random int'],
    ['game.pick(array)', 'random element'],
    ['game.clamp(v, lo, hi)', ''],
    ['game.lerp(a, b, t)', ''],
    ['game.input.isDown(key)', 'keyboard state'],
    ['game.input.pointer', '{x, y, down}'],
    ['game.gotoScene(name)', 'switch scene'],
    ['game.time', 'seconds since start'],
    ['self.destroy()', 'remove this node'],
    ['self.find(name)', 'find in children'],
    ['self.burst(count, opts)', 'particles only'],
  ].map(([label, detail]) => ({ label, apply: label.split('(')[0], type: 'function', detail })),
  ...['self.x', 'self.y', 'self.vx', 'self.vy', 'self.visible', 'self.text', 'self.color', 'self.frame', 'self.playing'].map(
    (label) => ({ label, type: 'property' })
  ),
];

function nekuComplete(ctx) {
  const word = ctx.matchBefore(/[\w.]+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  return {
    from: word.from,
    options: NEKU_COMPLETIONS.filter((o) => o.label.startsWith(word.text) || o.label.includes(word.text)),
    validFor: /^[\w.]*$/,
  };
}

export class CodeEditor {
  constructor(container, { onChange } = {}) {
    this.onChange = onChange;
    this._silence = false;
    this.view = new EditorView({
      parent: container,
      state: this._state(''),
    });
  }

  _state(doc) {
    return EditorState.create({
      doc,
      extensions: [
        basicSetup,
        javascript(),
        syntaxHighlighting(nekuHighlight),
        autocompletion({ override: [nekuComplete] }),
        keymap.of([indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !this._silence) this.onChange?.(this.view.state.doc.toString());
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { fontFamily: 'var(--mono)' },
        }),
      ],
    });
  }

  setValue(v) {
    this._silence = true;
    this.view.setState(this._state(v ?? ''));
    this._silence = false;
  }

  getValue() {
    return this.view.state.doc.toString();
  }
}

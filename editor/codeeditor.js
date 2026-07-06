// CCE code editor — a transparent <textarea> stacked over a highlighted
// <pre>. ~zero weight, no dependencies, good enough for game scripts.

const KEYWORDS = new Set(
  ('const let var function return if else for while do switch case break continue new class extends ' +
    'typeof instanceof in of try catch finally throw async await yield import export default null ' +
    'undefined true false this super delete void static get set').split(' ')
);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    // comments
    if (ch === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      out += `<span class="tk-com">${esc(src.slice(i, j))}</span>`;
      i = j;
    } else if (ch === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      out += `<span class="tk-com">${esc(src.slice(i, j))}</span>`;
      i = j;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && (src[j] !== ch || src[j - 1] === '\\')) j++;
      j = Math.min(j + 1, n);
      out += `<span class="tk-str">${esc(src.slice(i, j))}</span>`;
      i = j;
    } else if (/[0-9]/.test(ch) && !/[a-zA-Z_$]/.test(src[i - 1] || '')) {
      let j = i;
      while (j < n && /[0-9a-fA-Fx.eE_]/.test(src[j])) j++;
      out += `<span class="tk-num">${esc(src.slice(i, j))}</span>`;
      i = j;
    } else if (/[a-zA-Z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while (k < n && src[k] === ' ') k++;
      if (KEYWORDS.has(word)) out += `<span class="tk-kw">${word}</span>`;
      else if (src[k] === '(') out += `<span class="tk-fn">${word}</span>`;
      else if (src[i - 1] === '.') out += `<span class="tk-prop">${word}</span>`;
      else out += word;
      i = j;
    } else {
      out += esc(ch);
      i++;
    }
  }
  return out;
}

export class CodeEditor {
  constructor(container, { onChange } = {}) {
    container.innerHTML = `
      <div class="ce">
        <pre><code></code></pre>
        <div class="gutter"></div>
        <textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
      </div>`;
    this.pre = container.querySelector('pre');
    this.code = container.querySelector('code');
    this.gutter = container.querySelector('.gutter');
    this.ta = container.querySelector('textarea');
    this.onChange = onChange;

    this.ta.addEventListener('input', () => {
      this.render();
      this.onChange?.(this.ta.value);
    });
    this.ta.addEventListener('scroll', () => {
      this.pre.scrollTop = this.ta.scrollTop;
      this.pre.scrollLeft = this.ta.scrollLeft;
      this.gutter.scrollTop = this.ta.scrollTop;
    });
    this.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: end, value } = this.ta;
        this.ta.setRangeText('  ', s, end, 'end');
        this.render();
        this.onChange?.(this.ta.value);
      }
      if (e.key === 'Enter') {
        // keep indentation of the current line
        e.preventDefault();
        const { selectionStart: s, value } = this.ta;
        const lineStart = value.lastIndexOf('\n', s - 1) + 1;
        const indent = (value.slice(lineStart).match(/^[ ]*/) || [''])[0];
        const extra = /[{([]\s*$/.test(value.slice(lineStart, s)) ? '  ' : '';
        this.ta.setRangeText('\n' + indent + extra, s, this.ta.selectionEnd, 'end');
        this.render();
        this.onChange?.(this.ta.value);
      }
      e.stopPropagation(); // don't trigger editor-level shortcuts (Delete etc.)
    });
  }

  setValue(v) {
    this.ta.value = v ?? '';
    this.render();
  }

  getValue() {
    return this.ta.value;
  }

  render() {
    const src = this.ta.value;
    this.code.innerHTML = highlight(src) + '\n';
    const lines = src.split('\n').length;
    this.gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    this.pre.scrollTop = this.ta.scrollTop;
  }
}

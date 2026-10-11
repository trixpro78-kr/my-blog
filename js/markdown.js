// 외부 라이브러리 없이 구현한 마크다운 → HTML 변환기.
// 원문은 항상 HTML 이스케이프한 뒤 마크다운 문법만 태그로 바꿉니다.

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const SAFE_SCHEMES = ['http', 'https', 'mailto'];

// 인라인 변환 중 보호할 조각을 가리키는 표식(입력에서는 미리 제거합니다).
const TOKEN = '\u0000';
const HARD_BREAK = '\u0001';

const RE = {
  fence: /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}>/,
  list: /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/,
  tableDivider: /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
  task: /^\[([ xX])\][ \t]+/,
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

export function parseMarkdown(text) {
  const source = String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000\u0001]/g, '')
    .replace(/^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '');
  return parseBlocks(source.split('\n'));
}

/* ---------- Block level ---------- */

function isBlank(line) {
  return /^[ \t]*$/.test(line);
}

function indentWidth(ws) {
  let width = 0;
  for (const ch of ws) width += ch === '\t' ? 4 - (width % 4) : 1;
  return width;
}

function leadingWidth(line) {
  return indentWidth(line.match(/^[ \t]*/)[0]);
}

// 앞쪽 공백을 최대 n칸까지 제거합니다(탭은 4칸으로 계산).
function stripIndent(line, n) {
  let width = 0;
  let i = 0;
  while (i < line.length && width < n && (line[i] === ' ' || line[i] === '\t')) {
    width += line[i] === '\t' ? 4 - (width % 4) : 1;
    i++;
  }
  return ' '.repeat(Math.max(0, width - n)) + line.slice(i);
}

function isBlockStart(line) {
  return (
    RE.fence.test(line) ||
    RE.heading.test(line) ||
    RE.hr.test(line) ||
    RE.quote.test(line) ||
    RE.list.test(line)
  );
}

function isTableStart(lines, i) {
  return (
    i + 1 < lines.length &&
    lines[i].includes('|') &&
    lines[i + 1].includes('|') &&
    RE.tableDivider.test(lines[i + 1]) &&
    splitRow(lines[i]).length === splitRow(lines[i + 1]).length
  );
}

function parseBlocks(lines) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = line.match(RE.fence);
    if (fence) {
      const result = parseFence(lines, i, fence);
      out.push(result.html);
      i = result.next;
      continue;
    }

    const heading = line.match(RE.heading);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${parseInline(heading[2] || '')}</h${level}>`);
      i++;
      continue;
    }

    if (RE.hr.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (RE.quote.test(line)) {
      const result = parseQuote(lines, i);
      out.push(result.html);
      i = result.next;
      continue;
    }

    if (RE.list.test(line)) {
      const result = parseList(lines, i);
      out.push(result.html);
      i = result.next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const result = parseTable(lines, i);
      out.push(result.html);
      i = result.next;
      continue;
    }

    const result = parseParagraph(lines, i);
    out.push(result.html);
    i = result.next;
  }

  return out.join('\n');
}

function parseFence(lines, start, match) {
  const openIndent = match[1].length;
  const marker = match[2];
  const lang = /^[\w+#.-]+$/.test(match[3]) ? match[3] : '';
  const closing = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);

  const body = [];
  let i = start + 1;
  while (i < lines.length && !closing.test(lines[i])) {
    body.push(stripIndent(lines[i], openIndent));
    i++;
  }

  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
  return {
    html: `<pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`,
    next: i + 1,
  };
}

function parseQuote(lines, start) {
  const body = [];
  let i = start;
  while (i < lines.length && !isBlank(lines[i])) {
    const line = lines[i];
    if (RE.quote.test(line)) {
      body.push(line.replace(/^ {0,3}> ?/, ''));
    } else if (!isBlockStart(line)) {
      body.push(line); // 게으른 연속 줄
    } else {
      break;
    }
    i++;
  }
  return {
    html: `<blockquote>\n${parseBlocks(body)}\n</blockquote>`,
    next: i,
  };
}

function parseList(lines, start) {
  const first = lines[start].match(RE.list);
  const baseIndent = indentWidth(first[1]);
  const childIndent = baseIndent + 2;
  const ordered = /\d/.test(first[2]);
  const startNum = ordered ? parseInt(first[2], 10) : 1;

  const items = [];
  let current = null;
  let loose = false;
  let prevBlank = false;
  let i = start;

  const newItem = (m) => {
    const contentIndent = indentWidth(m[1]) + m[2].length + m[3].length;
    current = { lines: [m[4]], contentIndent, childStrip: null };
    items.push(current);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j >= lines.length) break;

      const next = lines[j];
      const nextMatch = next.match(RE.list);
      const isChild = leadingWidth(next) >= childIndent;
      const isSibling =
        nextMatch &&
        leadingWidth(next) < childIndent &&
        /\d/.test(nextMatch[2]) === ordered &&
        !RE.hr.test(next);
      if (!isChild && !isSibling) break;

      current.lines.push('');
      prevBlank = true;
      i++;
      continue;
    }

    const indent = leadingWidth(line);
    const m = line.match(RE.list);

    if (indent < childIndent && (m || RE.hr.test(line))) {
      if (!m || RE.hr.test(line) || /\d/.test(m[2]) !== ordered) break;
      if (prevBlank) loose = true;
      newItem(m);
    } else if (indent >= childIndent) {
      if (current.childStrip === null) {
        current.childStrip = Math.min(indent, current.contentIndent);
      }
      current.lines.push(stripIndent(line, current.childStrip));
      if (prevBlank) loose = true;
    } else if (!prevBlank && !isBlockStart(line)) {
      current.lines.push(line.trim()); // 게으른 연속 줄
    } else {
      break;
    }

    prevBlank = false;
    i++;
  }

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
  const body = items.map((item) => renderListItem(item, loose)).join('\n');

  return {
    html: `<${tag}${startAttr}>\n${body}\n</${tag}>`,
    next: i,
  };
}

function renderListItem(item, loose) {
  const lines = item.lines.slice();
  let checkbox = '';
  const task = lines[0].match(RE.task);
  if (task) {
    const checked = task[1] !== ' ' ? ' checked' : '';
    checkbox = `<input type="checkbox" disabled${checked}> `;
    lines[0] = lines[0].slice(task[0].length);
  }

  let html = parseBlocks(lines);
  if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, '$1');

  if (checkbox) {
    html = html.startsWith('<p>') ? html.replace('<p>', `<p>${checkbox}`) : checkbox + html;
    return `<li class="task-item">${html}</li>`;
  }
  return `<li>${html}</li>`;
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function parseTable(lines, start) {
  const headers = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });

  const cell = (tag, text, col) => {
    const style = aligns[col] ? ` style="text-align:${aligns[col]}"` : '';
    return `<${tag}${style}>${parseInline(text)}</${tag}>`;
  };

  const head = headers.map((text, col) => cell('th', text, col)).join('');

  const rows = [];
  let i = start + 2;
  while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
    const cells = splitRow(lines[i]);
    const row = headers.map((_, col) => cell('td', cells[col] || '', col)).join('');
    rows.push(`<tr>${row}</tr>`);
    i++;
  }

  const tbody = rows.length ? `\n<tbody>\n${rows.join('\n')}\n</tbody>` : '';
  return {
    html: `<div class="table-wrap"><table>\n<thead>\n<tr>${head}</tr>\n</thead>${tbody}\n</table></div>`,
    next: i,
  };
}

function parseParagraph(lines, start) {
  const body = [];
  let i = start;
  while (i < lines.length && !isBlank(lines[i])) {
    if (i > start && (isBlockStart(lines[i]) || isTableStart(lines, i))) break;
    body.push(lines[i]);
    i++;
  }

  const text = body
    .map((line, idx) => {
      const trimmed = line.trim();
      if (idx === body.length - 1) return trimmed;
      if (/ {2,}$/.test(line)) return trimmed + HARD_BREAK;
      if (/\\$/.test(trimmed)) return trimmed.slice(0, -1) + HARD_BREAK;
      return trimmed;
    })
    .join('\n');

  return {
    html: `<p>${parseInline(text)}</p>`,
    next: i,
  };
}

/* ---------- Inline level ---------- */

function sanitizeUrl(url) {
  const compact = url.replace(/[\u0000- \u007f]/g, '').toLowerCase();
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/);
  if (scheme && !SAFE_SCHEMES.includes(scheme[1])) return '#';
  return url;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

function emphasis(text) {
  return text
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

export function parseInline(text) {
  const tokens = [];
  const protect = (html) => `${TOKEN}${tokens.push(html) - 1}${TOKEN}`;
  const tokenRe = new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'g');
  const restore = (value) => {
    let prev;
    do {
      prev = value;
      value = value.replace(tokenRe, (_, idx) => tokens[idx]);
    } while (value !== prev);
    return value;
  };
  const titleAttr = (title) => (title ? ` title="${title}"` : '');

  let out = escapeHtml(text);

  // 1. 인라인 코드 (내부는 다른 변환에서 제외)
  out = out.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, code) =>
    protect(`<code>${code.trim()}</code>`)
  );

  // 2. 백슬래시 이스케이프
  out = out.replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, (_, ch) => protect(ch));

  // 3. 이미지
  out = out.replace(
    /!\[([^\]]*)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g,
    (_, alt, src, title) => {
      const altText = restore(alt).replace(/<[^>]*>/g, '');
      return protect(
        `<img src="${sanitizeUrl(src)}" alt="${altText}"${titleAttr(title)} loading="lazy">`
      );
    }
  );

  // 4. 링크
  out = out.replace(
    /\[([^\]]+)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g,
    (_, label, href, title) => {
      const url = sanitizeUrl(href);
      const target = isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return protect(`<a href="${url}"${titleAttr(title)}${target}>${emphasis(label)}</a>`);
    }
  );

  // 5. 자동 링크 <https://...>
  out = out.replace(/&lt;(https?:\/\/[^\s]+?)&gt;/g, (_, url) =>
    protect(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
  );

  // 6. 강조, 취소선
  out = emphasis(out);

  return restore(out).replace(new RegExp(HARD_BREAK, 'g'), '<br>');
}

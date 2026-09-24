// Compile BC text expressions into parameterized SQL. Column expressions are
// registry-owned; bind() returns a parameter name and never interpolates values.
export function compileBcTextFilter(column, raw, bind) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (text.length > 1000) throw new Error('Invalid filter: maximum length is 1000 characters');
  let pos = 0, terms = 0;
  const fail = () => { throw new Error('Invalid filter: check operators, quotes and parentheses'); };
  const space = () => { while (/\s/.test(text[pos] || '') && pos < text.length) pos++; };
  function atom() {
    space();
    if (text[pos] === '(') {
      pos++; const value = or(); space();
      if (text[pos++] !== ')') fail();
      return `(${value})`;
    }
    let token = '', quoted = false;
    while (pos < text.length) {
      const c = text[pos];
      if (c === "'") {
        token += c; pos++;
        if (quoted && text[pos] === "'") { token += text[pos++]; continue; }
        quoted = !quoted; continue;
      }
      if (!quoted && '|&()'.includes(c)) break;
      token += c; pos++;
    }
    if (quoted || !token.trim() || ++terms > 50) fail();
    token = token.trim();
    let col = column;
    if (token.startsWith('@')) { col = `LOWER(${column})`; token = token.slice(1); }
    const insensitive = col !== column;
    const value = s => {
      s = s.trim();
      if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1).replaceAll("''", "'");
      return insensitive ? s.toLowerCase() : s;
    };
    const op = token.match(/^(<>|>=|<=|>|<|=)/)?.[0] || '=';
    if (token.startsWith(op)) token = token.slice(op.length).trim();
    const literal = token.startsWith("'") && token.endsWith("'");
    if (!literal && token.includes('..')) {
      if (op !== '=') fail();
      const range = token.split('..');
      if (range.length !== 2 || (!range[0] && !range[1])) fail();
      return '(' + [range[0] ? `${col} >= ${bind(value(range[0]))}` : '', range[1] ? `${col} <= ${bind(value(range[1]))}` : ''].filter(Boolean).join(' AND ') + ')';
    }
    if (!token && !literal) fail();
    if (!literal && /[*?]/.test(token)) {
      if (!['=', '<>'].includes(op)) fail();
      const pattern = value(token).replace(/[~%_\[]/g, c => '~' + c).replaceAll('*', '%').replaceAll('?', '_');
      return `${col} ${op === '<>' ? 'NOT LIKE' : 'LIKE'} ${bind(pattern)} ESCAPE '~'`;
    }
    return `${col} ${op} ${bind(value(token))}`;
  }
  function and() {
    const parts = [atom()]; space();
    while (text[pos] === '&') { pos++; parts.push(atom()); space(); }
    return parts.join(' AND ');
  }
  function or() {
    const parts = [and()]; space();
    while (text[pos] === '|') { pos++; parts.push(and()); space(); }
    return parts.length > 1 ? '(' + parts.join(' OR ') + ')' : parts[0];
  }
  const result = or(); space();
  if (pos !== text.length) fail();
  return `(${result})`;
}

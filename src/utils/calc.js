function tokenize(expr) {
  const s = String(expr || '').replace(/\s+/g, '');
  if (!s) return [];
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\d|\./.test(c)) {
      let j = i + 1;
      while (j < s.length && /\d|\./.test(s[j])) j++;
      const n = Number(s.slice(i, j));
      if (!Number.isFinite(n)) throw new Error('Invalid number');
      tokens.push({ type: 'n', value: n });
      i = j;
      continue;
    }
    if ('+-*/%^()'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i += 1;
      continue;
    }
    throw new Error('Invalid character');
  }
  return tokens;
}

function precedence(op) {
  if (op === '^') return 4;
  if (op === '*' || op === '/' || op === '%') return 3;
  if (op === '+' || op === '-') return 2;
  return 0;
}

function rightAssociative(op) {
  return op === '^';
}

function toRpn(tokens) {
  const out = [];
  const stack = [];
  let prev = null;
  for (const t of tokens) {
    if (t.type === 'n') {
      out.push(t);
      prev = t;
      continue;
    }
    const op = t.value;
    if (op === '(') {
      stack.push(op);
      prev = t;
      continue;
    }
    if (op === ')') {
      while (stack.length && stack[stack.length - 1] !== '(') out.push({ type: 'op', value: stack.pop() });
      if (!stack.length) throw new Error('Mismatched parentheses');
      stack.pop();
      prev = t;
      continue;
    }

    const unary = (op === '-' || op === '+') && (!prev || (prev.type === 'op' && prev.value !== ')') || (prev.value === '('));
    if (unary) {
      out.push({ type: 'n', value: 0 });
    }

    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top === '(') break;
      const p1 = precedence(op);
      const p2 = precedence(top);
      if (p2 > p1 || (p2 === p1 && !rightAssociative(op))) out.push({ type: 'op', value: stack.pop() });
      else break;
    }
    stack.push(op);
    prev = t;
  }
  while (stack.length) {
    const x = stack.pop();
    if (x === '(') throw new Error('Mismatched parentheses');
    out.push({ type: 'op', value: x });
  }
  return out;
}

function evalRpn(rpn) {
  const st = [];
  for (const t of rpn) {
    if (t.type === 'n') {
      st.push(t.value);
      continue;
    }
    const b = st.pop();
    const a = st.pop();
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid expression');
    let r;
    switch (t.value) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*': r = a * b; break;
      case '/': r = b === 0 ? NaN : a / b; break;
      case '%': r = b === 0 ? NaN : a % b; break;
      case '^': r = Math.pow(a, b); break;
      default: throw new Error('Invalid operator');
    }
    if (!Number.isFinite(r)) throw new Error('Result is not finite');
    st.push(r);
  }
  if (st.length !== 1) throw new Error('Invalid expression');
  return st[0];
}

function calculate(expr) {
  const tokens = tokenize(expr);
  if (!tokens.length) throw new Error('Empty expression');
  const rpn = toRpn(tokens);
  return evalRpn(rpn);
}

module.exports = { calculate };

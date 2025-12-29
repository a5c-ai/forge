type TokenType =
  | "number"
  | "string"
  | "ident"
  | "op"
  | "lparen"
  | "rparen"
  | "eof";

type Token = { type: TokenType; value?: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, value?: string) => tokens.push({ type, value });

  const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isIdentStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  const isIdent = (c: string) => isIdentStart(c) || isDigit(c) || c === ".";

  while (i < input.length) {
    const c = input[i]!;
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      push("lparen");
      i++;
      continue;
    }
    if (c === ")") {
      push("rparen");
      i++;
      continue;
    }
    if (c === "\"" || c === "'") {
      const quote = c;
      i++;
      let s = "";
      while (i < input.length) {
        const ch = input[i]!;
        if (ch === "\\") {
          const next = input[i + 1];
          if (next) {
            s += next;
            i += 2;
            continue;
          }
        }
        if (ch === quote) break;
        s += ch;
        i++;
      }
      if (input[i] !== quote) throw new Error("unterminated string");
      i++;
      push("string", s);
      continue;
    }
    if (isDigit(c) || (c === "-" && isDigit(input[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < input.length && (isDigit(input[j]!) || input[j] === ".")) j++;
      push("number", input.slice(i, j));
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < input.length && isIdent(input[j]!)) j++;
      push("ident", input.slice(i, j));
      i = j;
      continue;
    }

    const two = input.slice(i, i + 2);
    const ops2 = ["&&", "||", "==", "!=", ">=", "<="]; // order matters
    if (ops2.includes(two)) {
      push("op", two);
      i += 2;
      continue;
    }
    const ops1 = ["<", ">", "+", "-", "*", "/", "!"];
    if (ops1.includes(c)) {
      push("op", c);
      i++;
      continue;
    }
    throw new Error(`unexpected character: ${c}`);
  }
  push("eof");
  return tokens;
}

type ExprNode =
  | { kind: "literal"; value: unknown }
  | { kind: "ident"; path: string }
  | { kind: "unary"; op: string; rhs: ExprNode }
  | { kind: "binary"; op: string; lhs: ExprNode; rhs: ExprNode };

const PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  ">": 4,
  "<": 4,
  ">=": 4,
  "<=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6
};

function parseExpr(tokens: Token[]): ExprNode {
  let pos = 0;
  const peek = () => tokens[pos]!;
  const next = () => tokens[pos++]!;

  const parsePrimary = (): ExprNode => {
    const t = next();
    if (t.type === "number") return { kind: "literal", value: Number(t.value) };
    if (t.type === "string") return { kind: "literal", value: t.value };
    if (t.type === "ident") {
      if (t.value === "true") return { kind: "literal", value: true };
      if (t.value === "false") return { kind: "literal", value: false };
      if (t.value === "null") return { kind: "literal", value: null };
      return { kind: "ident", path: t.value! };
    }
    if (t.type === "lparen") {
      const e = parseBinary(0);
      const r = next();
      if (r.type !== "rparen") throw new Error("expected )");
      return e;
    }
    if (t.type === "op" && t.value === "!") {
      return { kind: "unary", op: "!", rhs: parsePrimary() };
    }
    throw new Error("expected primary");
  };

  const parseBinary = (minPrec: number): ExprNode => {
    let lhs = parsePrimary();
    while (true) {
      const t = peek();
      if (t.type !== "op" || !t.value || !(t.value in PREC)) break;
      const prec = PREC[t.value];
      if (prec < minPrec) break;
      const op = t.value;
      next();
      const rhs = parseBinary(prec + 1);
      lhs = { kind: "binary", op, lhs, rhs };
    }
    return lhs;
  };

  const expr = parseBinary(0);
  if (peek().type !== "eof") throw new Error("unexpected trailing tokens");
  return expr;
}

function getPath(root: any, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: any = root;
  for (const p of parts) {
    if (cur == null || (typeof cur !== "object" && typeof cur !== "function")) return undefined;
    cur = cur[p];
  }
  return cur;
}

function evalNode(node: ExprNode, ctx: Record<string, unknown>): unknown {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "ident":
      return getPath(ctx, node.path);
    case "unary": {
      const v = evalNode(node.rhs, ctx);
      if (node.op === "!") return !v;
      throw new Error(`unsupported unary op: ${node.op}`);
    }
    case "binary": {
      const a = evalNode(node.lhs, ctx) as any;
      const b = evalNode(node.rhs, ctx) as any;
      switch (node.op) {
        case "||":
          return Boolean(a) || Boolean(b);
        case "&&":
          return Boolean(a) && Boolean(b);
        case "==":
          return a === b;
        case "!=":
          return a !== b;
        case ">":
          return a > b;
        case "<":
          return a < b;
        case ">=":
          return a >= b;
        case "<=":
          return a <= b;
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        default:
          throw new Error(`unsupported op: ${node.op}`);
      }
    }
  }
}

export function evalExpr(expr: string, ctx: { state: unknown; transition?: unknown }): unknown {
  const tokens = tokenize(expr);
  const ast = parseExpr(tokens);
  return evalNode(ast, { state: ctx.state, transition: ctx.transition });
}

export function evalExprBoolean(expr: string, ctx: { state: unknown; transition?: unknown }): boolean {
  return Boolean(evalExpr(expr, ctx));
}


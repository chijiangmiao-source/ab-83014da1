/** 输入校验：3 至 7 个整数，绝对值恰好为 1..n 且互异。 */

export interface ValidationResult {
  ok: boolean;
  /** 合并后的错误反馈（非法时非空） */
  errors: string[];
  tokens: number[];
}

const INTEGER_RE = /^[+-]?\d+$/;

export function parseAndValidate(raw: string): ValidationResult {
  const errors: string[] = [];
  const trimmed = raw.trim();
  const parts = trimmed.length === 0 ? [] : trimmed.split(/[\s,，;；]+/).filter((s) => s.length > 0);
  const tokens: number[] = [];

  for (const part of parts) {
    if (!INTEGER_RE.test(part)) {
      errors.push(`“${part}” 不是合法整数（允许可选正负号）。`);
      continue;
    }
    tokens.push(Number(part));
  }

  const n = tokens.length;
  if (parts.length === 0) {
    errors.push('排列为空：请输入 3 至 7 个带符号整数。');
    return { ok: false, errors, tokens };
  }
  if (n < 3 || n > 7) {
    errors.push(`标记数量必须为 3 至 7 个，当前为 ${n} 个。`);
  }

  if (errors.length === 0) {
    const seen = new Map<number, number>();
    const duplicates: number[] = [];
    tokens.forEach((t, idx) => {
      const a = Math.abs(t);
      if (seen.has(a)) {
        if (!duplicates.includes(a)) duplicates.push(a);
      } else {
        seen.set(a, idx);
      }
    });
    if (duplicates.length > 0) {
      errors.push(`绝对值重复：${duplicates.map((d) => `|${d}|`).join('、')} 出现多次；绝对值必须互异。`);
    }

    const abs = new Set(tokens.map((t) => Math.abs(t)));
    const missing: number[] = [];
    const extra: number[] = [];
    for (let k = 1; k <= n; k++) {
      if (!abs.has(k)) missing.push(k);
    }
    for (const a of abs) {
      if (a < 1 || a > n) extra.push(a);
    }
    if (missing.length > 0 || extra.length > 0) {
      const detail: string[] = [];
      if (missing.length > 0) detail.push(`缺少绝对值 ${missing.join('、')}`);
      if (extra.length > 0) detail.push(`出现越界绝对值 ${extra.join('、')}`);
      errors.push(`绝对值必须恰好为 1 至 ${n} 的排列：${detail.join('；')}。`);
    }

    if (tokens.some((t) => !Number.isSafeInteger(t))) {
      errors.push('存在超出安全整数范围的数值。');
    }
  }

  return { ok: errors.length === 0, errors, tokens };
}

import { describe, expect, it } from 'vitest';
import {
  allIntervals,
  applyInversion,
  audit,
  type AuditResult,
  type Interval,
} from './signedReversal';
import { parseAndValidate } from './validate';

describe('applyInversion', () => {
  it('反序区间并翻转每个符号', () => {
    // [1,-3,-2,4] 倒位 [2,3]（1 基）-> [1,2,3,4]
    expect(applyInversion([1, -3, -2, 4], 1, 2)).toEqual([1, 2, 3, 4]);
    // 整段倒位
    expect(applyInversion([1, 2, 3, 4], 0, 3)).toEqual([-4, -3, -2, -1]);
    // 单点倒位只翻转符号
    expect(applyInversion([1, -2, 3], 1, 1)).toEqual([1, 2, 3]);
    // 倒位自逆
    const p = [-2, 1, -3];
    expect(applyInversion(applyInversion(p, 0, 2), 0, 2)).toEqual(p);
  });
});

describe('allIntervals', () => {
  it('按 (起, 止) 字典序列出闭区间', () => {
    expect(allIntervals(3)).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 2],
      [2, 3],
      [3, 3],
    ]);
  });
});

describe('parseAndValidate', () => {
  it('接受合法带符号排列（逗号/空白/中文标点分隔）', () => {
    for (const raw of ['1 -3 -2 4', '1,-3,-2,4', ' 1  -3   -2 4 ', '1，-3；-2，4']) {
      const r = parseAndValidate(raw);
      expect(r.ok, raw).toBe(true);
      expect(r.tokens).toEqual([1, -3, -2, 4]);
      expect(r.errors).toEqual([]);
    }
  });

  it('拒绝重复绝对值', () => {
    const r = parseAndValidate('1 2 -2 4');
    expect(r.ok).toBe(false);
    expect(r.errors.join('；')).toMatch(/重复/);
  });

  it('拒绝非整数 token', () => {
    const r = parseAndValidate('1 x -2 4');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/不是合法整数/);
  });

  it('对数量越界给出反馈', () => {
    expect(parseAndValidate('1 2').ok).toBe(false);
    expect(parseAndValidate('1 2 3 4 5 6 7 8').ok).toBe(false);
    expect(parseAndValidate('').ok).toBe(false);
    expect(parseAndValidate('   ').ok).toBe(false);
  });

  it('对缺失/越界绝对值给出反馈', () => {
    const r = parseAndValidate('1 2 5');
    expect(r.ok).toBe(false);
    expect(r.errors.join('；')).toMatch(/缺少绝对值 3/);
  });

  it('一次合并反馈全部问题（重复 + 缺失）', () => {
    const r = parseAndValidate('1 2 -2 4');
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('audit - 需求固定用例', () => {
  it('[1,-3,-2,4] 的最短步数为 1，规范倒位为 [2,3]，方案总数为 1', () => {
    const r = audit([1, -3, -2, 4]);
    expect(r.distance).toBe(1);
    expect(r.totalWays).toBe(1n);
    expect(r.canonicalPath).toEqual([[2, 3]]);
    expect(r.canonicalStates.at(-1)).toEqual([1, 2, 3, 4]);

    const col = r.intervals.findIndex(([i, j]) => i === 2 && j === 3);
    expect(r.depthMatrix[0][col]).toBe('all');
    for (let k = 0; k < r.intervals.length; k++) {
      if (k !== col) expect(r.depthMatrix[0][k]).toBe('none');
    }
  });

  it('全正顺序距离为 0、方案数为 1', () => {
    const r = audit([1, 2, 3]);
    expect(r.distance).toBe(0);
    expect(r.totalWays).toBe(1n);
    expect(r.canonicalPath).toEqual([]);
    expect(r.depthMatrix).toEqual([]);
  });

  it('全负反序一步到位', () => {
    const r = audit([-7, -6, -5, -4, -3, -2, -1]);
    expect(r.distance).toBe(1);
    expect(r.totalWays).toBe(1n);
    expect(r.canonicalPath).toEqual([[1, 7]]);
  });
});

/**
 * n=3 的独立参照实现：朴素 BFS 定距 + DFS 枚举“全部”最短路径，
 * 用于核对方案总数、规范方案的字典序最小性与出现矩阵分类。
 */
function reference(n: number) {
  const target = Array.from({ length: n }, (_, k) => k + 1);
  const tk = target.join(',');
  const dist = new Map<string, number>([[tk, 0]]);
  let frontier = [target];
  let d = 0;
  while (frontier.length > 0) {
    const next: number[][] = [];
    for (const p of frontier) {
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
          const q = applyInversion(p, i, j);
          const qk = q.join(',');
          if (!dist.has(qk)) {
            dist.set(qk, d + 1);
            next.push(q);
          }
        }
      }
    }
    frontier = next;
    d++;
  }

  const allPaths = (start: number[]): Interval[] => {
    void start;
    return [] as Interval[];
  };
  void allPaths;

  const enumeratePaths = (start: number[]): string[] => {
    const paths: string[] = [];
    const go = (p: number[], acc: Interval[]) => {
      const dd = dist.get(p.join(','))!;
      if (dd === 0) {
        paths.push(JSON.stringify(acc.map(([i, j]) => [i, j])));
        return;
      }
      // 与求解器相同的字典序枚举，保证首条即字典序最小
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
          const q = applyInversion(p, i, j);
          if (dist.get(q.join(',')) === dd - 1) {
            go(q, [...acc, [i + 1, j + 1] as Interval]);
          }
        }
      }
    };
    go(start, []);
    return paths;
  };

  return { dist, enumeratePaths };
}

describe('audit - n=3 全状态穷举对照', () => {
  const n = 3;
  const { dist, enumeratePaths } = reference(n);

  // 枚举全部 2^n * n! 个带符号排列
  const all: number[][] = [];
  const signs = Array.from({ length: 1 << n }, (_, k) => k);
  const perms = (arr: number[]): number[][] => {
    if (arr.length === 1) return [arr];
    const out: number[][] = [];
    for (let k = 0; k < arr.length; k++) {
      const rest = arr.slice(0, k).concat(arr.slice(k + 1));
      for (const tail of perms(rest)) out.push([arr[k], ...tail]);
    }
    return out;
  };
  for (const s of signs) {
    for (const base of perms([1, 2, 3])) {
      all.push(base.map((v, k) => (((s >> k) & 1) === 0 ? v : -v)));
    }
  }
  expect(all.length).toBe(48);
  expect(dist.size).toBe(48);

  let sawSome = false;

  for (const start of all) {
    const r: AuditResult = audit(start);
    const paths = enumeratePaths(start);

    it(`距离/总数/规范方案对照 ${JSON.stringify(start)}`, () => {
      expect(r.distance).toBe(dist.get(start.join(',')));
      expect(r.totalWays).toBe(BigInt(paths.length));
      expect(JSON.stringify(r.canonicalPath)).toBe(paths[0]);

      // 沿规范方案走回目标
      let p = start.slice();
      for (const [i, j] of r.canonicalPath) {
        p = applyInversion(p, i - 1, j - 1);
      }
      expect(p).toEqual([1, 2, 3]);

      // 矩阵逐格核对：最优边 vs 非最优边；全部分类要求独占
      for (let depth = 0; depth < r.distance; depth++) {
        const state = r.canonicalStates[depth];
        const dd = dist.get(state.join(','))!;
        const optimalCols: number[] = [];
        r.intervals.forEach(([i, j], col) => {
          const q = applyInversion(state, i - 1, j - 1);
          const onShortest = dist.get(q.join(',')) === dd - 1;
          const kind = r.depthMatrix[depth][col];
          if (onShortest) {
            expect(kind).not.toBe('none');
            optimalCols.push(col);
          } else {
            expect(kind).toBe('none');
          }
        });
        // “全部”当且仅当该状态只有一个最优第一步
        for (const col of r.intervals.keys()) {
          if (r.depthMatrix[depth][col] === 'all') {
            expect(optimalCols).toEqual([col]);
          }
        }
        if (r.depthMatrix[depth].includes('some')) sawSome = true;
        if (optimalCols.length > 1) {
          expect(r.depthMatrix[depth].filter((k) => k === 'all')).toEqual([]);
          expect(r.depthMatrix[depth].includes('some')).toBe(true);
        }
      }
    });
  }

  it('n=3 状态空间中确实存在“部分最短方案”分支（some 分类被覆盖）', () => {
    expect(sawSome).toBe(true);
  });
});

describe('audit - 方案总数为任意精度大整数', () => {
  it('总数为 bigint 且各状态为正整数', () => {
    for (const start of [
      [1, -3, -2, 4],
      [3, 1, 2],
      [-2, -1, 3],
    ] as number[][]) {
      const r = audit(start);
      expect(typeof r.totalWays).toBe('bigint');
      expect(r.totalWays >= 1n).toBe(true);
    }
  });
});

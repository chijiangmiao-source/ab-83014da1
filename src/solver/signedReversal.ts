/**
 * 带符号排列的最少倒位（反转）求解器。
 *
 * 状态空间为 {-n..-1, 1..n} 的全部排列（绝对值恰为 1..n），
 * 从目标态 [1,2,...,n] 出发做反向分层 BFS（倒位自逆，正反邻接相同），
 * 直到覆盖输入所在层：
 *   - dist 严格为到目标的最少倒位步数；
 *   - ways 为该状态到目标的最短路径条数（按 bigint 输出，任意精度）；
 *   - 比较“经过某状态某区间的最短路径条数”与该状态总条数，
 *     得到该倒位在 全部 / 部分 / 没有 最短方案中的出现分类；
 *   - 规范方案在所有最短方案中，按每一步 (起下标, 止下标)
 *     序列的字典序取最小（贪心选取保持最短距离的最小区间即可）。
 *
 * 性能：n ≤ 7（校验保证），状态数 2^n·n! ≤ 645 120。每个标记压成
 * 4 bit（低 3 位存绝对值 1..7，bit3 存负号），整状态 ≤ 28 bit；
 * 倒位直接在位上完成，状态用 (符号位, Lehmer 秩) 映射到稠密下标，
 * dist / ways 用类型化数组存储，避免字符串与 Map 的分配开销。
 *
 * 路径条数上界：每层至多 m=n(n+1)/2 ≤ 28 个选择，最短距离 ≤ n+1 ≤ 8，
 * 故 ways ≤ 28^8 < 2^36，Uint64 绝对安全；对外仍以 bigint 十进制给出。
 * 仅依赖 ES2022，无网络、无持久化。
 */

export type Interval = readonly [number, number];

/** 倒位出现分类：在该深度的全部 / 部分 / 没有最短方案中出现 */
export type OccurrenceKind = 'all' | 'some' | 'none';

export interface AuditResult {
  input: number[];
  n: number;
  distance: number;
  /** 最短方案总数（任意精度） */
  totalWays: bigint;
  /** 规范方案：从输入到目标，每一步为闭区间 [i,j]（1 基，含端点） */
  canonicalPath: Interval[];
  /** 规范方案每一步作用后的排列（含初始态，长度 distance+1） */
  canonicalStates: number[][];
  /**
   * depthMatrix[d][k]：第 d 步（0 基）、第 k 个区间（按 i 升、j 升）
   * 在“从规范轨迹第 d 个状态出发”的最短方案中的出现分类。
   */
  depthMatrix: OccurrenceKind[][];
  /** 与 depthMatrix 列对齐的区间顺序（1 基闭区间） */
  intervals: Interval[];
  /**
   * edgeWays[d][k]：经过“规范轨迹第 d 个状态 + 第 k 个区间”的最短
   * 路径条数（bigint）；非最优边上为 0n。供 UI 展示精确数字。
   */
  edgeWays: bigint[][];
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];

// ---- 位编码：每个标记 4 bit，值 1..n 放低 3 位，bit3=1 表示负号 ----

function encode(perm: readonly number[]): number {
  let code = 0;
  for (let k = 0; k < perm.length; k++) {
    const x = perm[k];
    code |= (Math.abs(x) | (x < 0 ? 8 : 0)) << (4 * k);
  }
  return code >>> 0;
}

function decode(code: number, n: number): number[] {
  const out: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const nibble = (code >>> (4 * k)) & 15;
    const v = nibble & 7;
    out[k] = nibble & 8 ? -v : v;
  }
  return out;
}

/** 位上倒位：交换两端 nibble 并各自翻转符号位（异或 8） */
function invertCode(code: number, i: number, j: number): number {
  let l = i;
  let r = j;
  while (l <= r) {
    const sl = 4 * l;
    const sr = 4 * r;
    const a = (code >>> sl) & 15;
    const b = (code >>> sr) & 15;
    code = (code & ~(15 << sl) & ~(15 << sr)) | ((b ^ 8) << sl) | ((a ^ 8) << sr);
    l++;
    r--;
  }
  return code >>> 0;
}

/** 稠密下标：符号位组合 × n! 个排列 + 绝对值序列的 Lehmer 秩 */
function rankOf(code: number, n: number): number {
  let signBits = 0;
  const vals: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const nibble = (code >>> (4 * k)) & 15;
    vals[k] = nibble & 7;
    if (nibble & 8) signBits |= 1 << k;
  }
  let rank = 0;
  for (let k = 0; k < n; k++) {
    let smaller = 0;
    for (let t = k + 1; t < n; t++) {
      if (vals[t] < vals[k]) smaller++;
    }
    rank += smaller * FACT[n - 1 - k];
  }
  return signBits * FACT[n] + rank;
}

/** 对排列的闭区间 [i,j]（0 基）做倒位：反序并翻转符号（供外部/测试使用） */
export function applyInversion(perm: readonly number[], i: number, j: number): number[] {
  return decode(invertCode(encode(perm), i, j), perm.length);
}

/** 全部闭区间，按 (i,j) 字典序（i 升、j 升），1 基 */
export function allIntervals(n: number): Interval[] {
  const out: Interval[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      out.push([i + 1, j + 1]);
    }
  }
  return out;
}

export function audit(perm: readonly number[]): AuditResult {
  const input = perm.slice();
  const n = input.length;
  if (n < 1 || n > 7) throw new Error('audit 仅支持 1 至 7 个标记');

  const stateCount = (1 << n) * FACT[n];
  const dist = new Int32Array(stateCount);
  dist.fill(-1);
  const ways = new BigUint64Array(stateCount);

  const targetCode = encode(Array.from({ length: n }, (_, k) => k + 1));
  const startCode = encode(input);
  const targetId = rankOf(targetCode, n);
  const startId = rankOf(startCode, n);

  dist[targetId] = 0;
  ways[targetId] = 1n;

  // 反向分层 BFS：code 与稠密 id 并行入队。
  let frontierCodes: number[] = [targetCode];
  let frontierIds: number[] = [targetId];
  let distance = -1;

  if (startId === targetId) {
    distance = 0;
  } else {
    for (let d = 0; frontierCodes.length > 0; d++) {
      const nextCodes: number[] = [];
      const nextIds: number[] = [];
      for (let f = 0; f < frontierCodes.length; f++) {
        const code = frontierCodes[f];
        const uid = frontierIds[f];
        const uw = ways[uid];
        for (let i = 0; i < n; i++) {
          for (let j = i; j < n; j++) {
            const child = invertCode(code, i, j);
            const vid = rankOf(child, n);
            const vd = dist[vid];
            if (vd === -1) {
              dist[vid] = d + 1;
              ways[vid] = uw;
              nextCodes.push(child);
              nextIds.push(vid);
            } else if (vd === d + 1) {
              ways[vid] += uw;
            }
          }
        }
      }
      frontierCodes = nextCodes;
      frontierIds = nextIds;
      if (dist[startId] !== -1) {
        distance = dist[startId];
        break;
      }
    }
  }

  if (distance < 0) throw new Error('内部错误：初始态不可达');

  // 规范方案：当前态下按 (i,j) 字典序选第一个保持最短距离的倒位。
  const intervals = allIntervals(n);
  const canonicalPath: Interval[] = [];
  const canonicalStates: number[][] = [input.slice()];
  let currentCode = startCode;
  for (let d = 0; d < distance; d++) {
    const uid = rankOf(currentCode, n);
    let chosenI = -1;
    let chosenJ = -1;
    let chosenChild = 0;
    for (let i = 0; i < n && chosenI === -1; i++) {
      for (let j = i; j < n; j++) {
        const child = invertCode(currentCode, i, j);
        const vid = rankOf(child, n);
        if (dist[vid] === dist[uid] - 1) {
          chosenI = i;
          chosenJ = j;
          chosenChild = child;
          break;
        }
      }
    }
    if (chosenI === -1) throw new Error('内部错误：规范方案断链');
    canonicalPath.push([chosenI + 1, chosenJ + 1]);
    currentCode = chosenChild;
    canonicalStates.push(decode(currentCode, n));
  }

  // 深度×区间矩阵：沿规范轨迹逐状态统计各区间承担的最短路径条数。
  // 经过 (状态 u, 区间 e→v) 的最短路径条数即 ways[v]（要求 dist 差 1）。
  const depthMatrix: OccurrenceKind[][] = [];
  const edgeWays: bigint[][] = [];
  let cursorCode = startCode;
  for (let d = 0; d < distance; d++) {
    const uid = rankOf(cursorCode, n);
    const total = ways[uid];
    const row: OccurrenceKind[] = new Array(intervals.length);
    const waysRow: bigint[] = new Array(intervals.length);
    for (let k = 0; k < intervals.length; k++) {
      const [i1, j1] = intervals[k];
      const child = invertCode(cursorCode, i1 - 1, j1 - 1);
      const vid = rankOf(child, n);
      const w = dist[vid] === dist[uid] - 1 ? BigInt(ways[vid]) : 0n;
      waysRow[k] = w;
      if (w === 0n) row[k] = 'none';
      else if (w === BigInt(total)) row[k] = 'all';
      else row[k] = 'some';
    }
    depthMatrix.push(row);
    edgeWays.push(waysRow);
    const step = canonicalPath[d];
    cursorCode = invertCode(cursorCode, step[0] - 1, step[1] - 1);
  }

  return {
    input,
    n,
    distance,
    totalWays: BigInt(ways[startId]),
    canonicalPath,
    canonicalStates,
    depthMatrix,
    intervals,
    edgeWays,
  };
}

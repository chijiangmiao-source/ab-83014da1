import { useState } from 'react';
import type { AuditResultDto } from '../worker/auditWorker';
import type { OccurrenceKind } from '../solver/signedReversal';

const KIND_TEXT: Record<OccurrenceKind, string> = {
  all: '全部最短方案均含此倒位',
  some: '仅部分最短方案含此倒位',
  none: '任何最短方案中均未出现',
};

function formatPerm(p: readonly number[]): string {
  return `[${p.join(', ')}]`;
}

export function ResultView({ result }: { result: AuditResultDto }) {
  const { distance, totalWays, canonicalPath, canonicalStates, depthMatrix, intervals, edgeWays } =
    result;

  // 当前查看的步骤（0 基）；矩阵单元格与规范轨迹双向联动。
  const [activeDepth, setActiveDepth] = useState<number | null>(
    distance > 0 ? 0 : null,
  );
  const [activeCol, setActiveCol] = useState<number | null>(null);

  const isCanonicalCell = (d: number, col: number) => {
    const [ci, cj] = canonicalPath[d];
    return intervals[col][0] === ci && intervals[col][1] === cj;
  };

  const selectCell = (d: number, col: number) => {
    setActiveDepth(d);
    setActiveCol(col);
  };

  const activeInterval = activeDepth !== null && activeCol !== null ? intervals[activeCol] : null;
  const activeKind =
    activeDepth !== null && activeCol !== null ? depthMatrix[activeDepth][activeCol] : null;
  const activeEdgeWays =
    activeDepth !== null && activeCol !== null ? edgeWays[activeDepth][activeCol] : null;

  return (
    <>
      <section className="card">
        <h2>② 审计结论</h2>
        <div className="stats">
          <div className="stat">
            <div className="label">最少倒位步数</div>
            <div className="value">{distance}</div>
          </div>
          <div className="stat">
            <div className="label">最短方案总数（任意精度十进制）</div>
            <div className="value big">{totalWays}</div>
          </div>
          <div className="stat">
            <div className="label">规范方案（区间序列）</div>
            <div className="path-line">
              {distance === 0
                ? '∅（输入已是全正顺序）'
                : canonicalPath.map(([i, j], d) => (
                    <span
                      key={d}
                      className={`step-token ${activeDepth === d ? 'active' : ''}`}
                      title={`第 ${d + 1} 步`}
                      onClick={() => {
                        const col = intervals.findIndex(
                          ([a, b]) => a === i && b === j,
                        );
                        selectCell(d, col);
                      }}
                    >
                      [{i},{j}]
                    </span>
                  ))}
            </div>
          </div>
        </div>

        {distance > 0 && (
          <>
            <div className="row" style={{ marginTop: 14 }}>
              <button
                disabled={activeDepth === null || activeDepth === 0}
                onClick={() => {
                  const d = Math.max(0, (activeDepth ?? 0) - 1);
                  const [ci, cj] = canonicalPath[d];
                  selectCell(d, intervals.findIndex(([a, b]) => a === ci && b === cj));
                }}
              >
                ← 上一步
              </button>
              <button
                disabled={activeDepth === null || activeDepth === distance - 1}
                onClick={() => {
                  const d = Math.min(distance - 1, (activeDepth ?? -1) + 1);
                  const [ci, cj] = canonicalPath[d];
                  selectCell(d, intervals.findIndex(([a, b]) => a === ci && b === cj));
                }}
              >
                下一步 →
              </button>
              <span className="hint" style={{ margin: 0 }}>
                {activeDepth === null
                  ? '尚未选择步骤'
                  : `第 ${activeDepth + 1} / ${distance} 步：倒位 [${canonicalPath[activeDepth][0]}, ${canonicalPath[activeDepth][1]}]`}
              </span>
            </div>
          <div className="trace">
            {canonicalStates.map((state, idx) => {
              const d = idx; // 该行对应“第 d 步之前”的状态
              const isLast = idx === canonicalStates.length - 1;
              return (
                <div key={idx}>
                  <div
                    className={`trace-row ${activeDepth === d ? 'active' : ''}`}
                    onClick={() => {
                      if (!isLast) {
                        const [ci, cj] = canonicalPath[d];
                        selectCell(d, intervals.findIndex(([a, b]) => a === ci && b === cj));
                      }
                    }}
                  >
                    <span className="depth-tag">
                      {isLast ? '结果' : `深度 ${d}`}
                    </span>
                    <span className="markers">
                      {state.map((m, k) => {
                        const inInterval =
                          !isLast &&
                          activeDepth === d &&
                          k + 1 >= canonicalPath[d][0] &&
                          k + 1 <= canonicalPath[d][1];
                        return (
                          <span
                            key={k}
                            className={`marker ${m < 0 ? 'neg' : 'pos'} ${inInterval ? 'in-interval' : ''}`}
                          >
                            {m > 0 ? `+${m}` : m}
                          </span>
                        );
                      })}
                    </span>
                    {!isLast && (
                      <span className="arrow-label">
                        第 {d + 1} 步倒位 [{canonicalPath[d][0]}, {canonicalPath[d][1]}]
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </section>

      {distance > 0 && (
        <section className="card">
          <h2>③ 深度 × 区间出现矩阵</h2>
          <div className="legend">
            <span>
              <span className="swatch" style={{ background: 'var(--all-bg)', border: '1px solid var(--all)' }} />
              全部：该步的所有最短方案都走此区间
            </span>
            <span>
              <span className="swatch" style={{ background: 'var(--some-bg)', border: '1px solid var(--some)' }} />
              部分：仅部分最短方案走此区间
            </span>
            <span>
              <span className="swatch" style={{ background: 'var(--none-bg)', border: '1px solid var(--none)' }} />
              从不：任何最短方案均未出现
            </span>
            <span>
              <span style={{ color: 'var(--canonical)', fontWeight: 700 }}>● 紫框</span>
              ：规范方案在该步选择的区间
            </span>
          </div>
          <div className="matrix-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th>深度 ＼ 区间</th>
                  {intervals.map(([i, j], col) => (
                    <th key={col} className="rot">
                      <span>[{i},{j}]</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depthMatrix.map((row, d) => (
                  <tr key={d} className={activeDepth === d ? 'row-selected' : ''}>
                    <th>
                      深度 {d}
                      <br />
                      <span style={{ color: 'var(--muted)' }}>{formatPerm(canonicalStates[d])}</span>
                    </th>
                    {row.map((kind, col) => (
                      <td
                        key={col}
                        className={[
                          'cell',
                          kind,
                          isCanonicalCell(d, col) ? 'canonical' : '',
                          activeDepth === d && activeCol === col ? 'selected' : '',
                        ].join(' ')}
                        title={`深度 ${d} · 区间 [${intervals[col][0]},${intervals[col][1]}]：${KIND_TEXT[kind]}（${edgeWays[d][col]} / ${totalWaysAt(result, d)} 条最短前缀）`}
                        onClick={() => selectCell(d, col)}
                      >
                        {kind === 'all' ? '必' : kind === 'some' ? '或' : '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sel-panel">
            {activeInterval === null ||
            activeKind === null ||
            activeDepth === null ||
            activeCol === null ? (
              '点击任意单元格查看该倒位在最短方案集合中的出现情况，并联动高亮规范轨迹。'
            ) : (
              (() => {
                const d = activeDepth;
                const col = activeCol;
                return (
                <>
                深度 {d}：从 {formatPerm(canonicalStates[d])} 施加倒位{' '}
                <code>[{activeInterval[0]}, {activeInterval[1]}]</code>
                <span className={`badge ${activeKind}`}>{KIND_TEXT[activeKind]}</span>
                {activeKind === 'none' ? (
                      <>
                        。选择它将偏离任一最短方案。
                      </>
                    ) : (
                      <>
                        {' '}
                        —— 经过该步的最短方案有 <code>{activeEdgeWays}</code> 条（该状态全部最短方案
                        共 <code>{totalWaysAt(result, d)}</code> 条；整个输入的最短方案总数
                        为 <code>{totalWays}</code>）。
                      </>
                    )}
                {isCanonicalCell(d, col) && (
                  <>
                    {' '}
                    <strong style={{ color: 'var(--canonical)' }}>此即规范方案第 {d + 1} 步。</strong>
                  </>
                )}
              </>
                );
              })()
            )}
          </div>
          <div className="hint">
            计数说明：格内数字为“从规范轨迹该深度状态出发、第一步走此区间”的最短路径条数；
            不同深度的前缀条数不可直接相加。总数 {totalWays} 与各格计数均为精确十进制整数。
          </div>
        </section>
      )}
    </>
  );
}

/** 规范轨迹第 d 个状态出发的最短路径总条数：用该行 edgeWays 求和。 */
function totalWaysAt(result: AuditResultDto, d: number): string {
  // BigInt 计算（值远小于 2^53 上界时也可 Number，此处保持精确）。
  let acc = 0n;
  for (const v of result.edgeWays[d]) acc += BigInt(v);
  return acc.toString();
}

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { ResultView } from './components/ResultView';
import { audit } from './solver/signedReversal';
import type { AuditResultDto } from './worker/auditWorker';

function toDto(perm: number[]): AuditResultDto {
  const r = audit(perm);
  return {
    ...r,
    totalWays: r.totalWays.toString(),
    edgeWays: r.edgeWays.map((row) => row.map((v) => v.toString())),
  };
}

describe('ResultView 服务端渲染冒烟', () => {
  it('渲染需求用例：距离 1、规范区间 [2,3]、总数 1 出现在页面', () => {
    const html = renderToString(createElement(ResultView, { result: toDto([1, -3, -2, 4]) }));
    expect(html).toContain('深度 × 区间');
    expect(html).toContain('[2,3]');
    expect(html).toContain('任何最短方案中均未出现');
    expect(html).toContain('全部最短方案均含此倒位');
    expect(html).toContain('规范方案');
  });

  it('距离为 0 时不渲染矩阵而渲染空方案说明', () => {
    const html = renderToString(createElement(ResultView, { result: toDto([1, 2, 3]) }));
    expect(html).toContain('已是全正顺序');
    expect(html).not.toContain('深度 × 区间');
  });

  it('多解用例 [3,2,1] 的页面出现“部分最短方案”单元与任意精度方案总数', () => {
    const r = audit([3, 2, 1]);
    expect(r.depthMatrix.some((row) => row.includes('some'))).toBe(true);
    const html = renderToString(createElement(ResultView, { result: toDto([3, 2, 1]) }));
    expect(html).toContain('仅部分最短方案含此倒位');
    expect(html).toContain(r.totalWays.toString());
  });
});

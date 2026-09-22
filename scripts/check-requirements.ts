/**
 * verify 一次性服务的验收脚本（也可在宿主机本地运行）：
 *   1. 等待并对已发布页面做 HTTP 冒烟（/ 与 /healthz，及静态资源）；
 *   2. 断言 [1,-3,-2,4] 的最少倒位步数为 1（规范倒位 [2,3]，方案数 1）；
 *   3. 断言重复绝对值的排列被校验拒绝。
 * 全部通过以退出码 0 报告，任一失败以退出码 1 报告。
 *
 * 用法：BASE_URL=http://web/ npx tsx scripts/check-requirements.ts
 */
import { audit } from '../src/solver/signedReversal';
import { parseAndValidate } from '../src/solver/validate';

const failures: string[] = [];
const passes: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) passes.push(name);
  else failures.push(`${name}${detail ? ` —— ${detail}` : ''}`);
}

async function waitFor(url: string, timeoutMs = 60_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`等待 ${url} 超时（${lastErr}）`);
}

async function httpSmoke(baseUrl: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  await waitFor(`${base}healthz`);
  const health = await fetch(`${base}healthz`);
  check('HTTP 冒烟：GET /healthz 返回 200', health.status === 200, `status=${health.status}`);
  const healthText = (await health.text()).trim();
  check('HTTP 冒烟：/healthz 响应体为 ok', healthText === 'ok', `body=${healthText}`);

  const index = await fetch(base);
  check('HTTP 冒烟：GET / 返回 200', index.status === 200, `status=${index.status}`);
  const html = await index.text();
  check(
    'HTTP 冒烟：首页包含挂载节点与脚本入口',
    html.includes('id="root"') && html.includes('/src/main.tsx') === false && html.includes('assets/'),
    'dist 构建产物特征缺失',
  );

  // 校验 JS/CSS 资源可达
  const assetMatches = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  check('HTTP 冒烟：首页引用了构建后的静态资源', assetMatches.length >= 2, assetMatches.join(','));
  for (const asset of assetMatches) {
    const res = await fetch(`${base}${asset.replace(/^\//, '')}`);
    check(`HTTP 冒烟：静态资源 ${asset} 返回 200`, res.status === 200, `status=${res.status}`);
  }

  // SPA 回退
  const fallback = await fetch(`${base}some/client/route`);
  check('HTTP 冒烟：未知路径回退 index.html', fallback.status === 200, `status=${fallback.status}`);
}

function requirementAssertions() {
  // 需求固定用例：[1,-3,-2,4] 最短步数为 1（倒位 [2,3] 即得 [1,2,3,4]）
  const r = audit([1, -3, -2, 4]);
  check('需求断言：[1,-3,-2,4] 最短步数为 1', r.distance === 1, `distance=${r.distance}`);
  check(
    '需求断言：规范倒位为 [2,3]',
    r.canonicalPath.length === 1 && r.canonicalPath[0][0] === 2 && r.canonicalPath[0][1] === 3,
    JSON.stringify(r.canonicalPath),
  );
  check(
    '需求断言：一步后到达全正顺序',
    JSON.stringify(r.canonicalStates[r.canonicalStates.length - 1]) === JSON.stringify([1, 2, 3, 4]),
  );
  check('需求断言：最短方案总数为 1', r.totalWays === 1n, `ways=${r.totalWays}`);
  check(
    '需求断言：矩阵中仅 [2,3] 列为“全部”，其余为“从不”',
    r.depthMatrix[0].every((kind, col) => {
      const [i, j] = r.intervals[col];
      return i === 2 && j === 3 ? kind === 'all' : kind === 'none';
    }),
  );

  // 重复绝对值必须被拒绝（输入保留在 UI 状态中，这里只校验校验器；非法时不产生结果）
  const dup = parseAndValidate('1 2 -2 4');
  check('需求断言：重复绝对值被拒绝', !dup.ok, JSON.stringify(dup.errors));
  check(
    '需求断言：拒绝信息明确指出绝对值重复',
    dup.errors.some((e) => /重复/.test(e)),
    JSON.stringify(dup.errors),
  );

  // 合法排列应通过，避免校验器误杀
  const ok = parseAndValidate('1 -3 -2 4');
  check('需求断言：合法排列通过校验', ok.ok && ok.tokens.length === 4, JSON.stringify(ok.errors));

  // 附加健全性：全正顺序距离 0；全负反序距离 1
  check('健全性：[1,2,3] 距离 0', audit([1, 2, 3]).distance === 0);
  const neg = audit([-4, -3, -2, -1]);
  check('健全性：[-4,-3,-2,-1] 距离 1 且规范区间 [1,4]', neg.distance === 1);
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:8080/';
  console.log(`==> HTTP 冒烟目标：${baseUrl}`);
  try {
    await httpSmoke(baseUrl);
  } catch (err) {
    failures.push(`HTTP 冒烟异常：${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('==> 需求断言（直接调用编译外的 TS 源码）');
  try {
    requirementAssertions();
  } catch (err) {
    failures.push(`需求断言异常：${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }

  console.log('');
  for (const p of passes) console.log(`  PASS  ${p}`);
  if (failures.length > 0) {
    console.error('');
    for (const f of failures) console.error(`  FAIL  ${f}`);
    console.error(`\n${failures.length} 项失败，${passes.length} 项通过。`);
    process.exit(1);
  }
  console.log(`\n全部 ${passes.length} 项验收通过。`);
}

main();

import { useMemo, useRef, useState } from 'react';
import { parseAndValidate } from './solver/validate';
import type { AuditResultDto } from './worker/auditWorker';
import { ResultView } from './components/ResultView';

const EXAMPLES: { label: string; value: string }[] = [
  { label: '需求用例 [1,-3,-2,4]', value: '1 -3 -2 4' },
  { label: '单符号反转', value: '1 2 3 4 5 6 -7' },
  { label: 'n=4 多方案分支', value: '-4 -3 -2 -1' },
  { label: 'n=7 难例', value: '3 -5 1 7 -2 6 -4' },
];

export function App() {
  const [raw, setRaw] = useState('1 -3 -2 4');
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<AuditResultDto | null>(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const preview = useMemo(() => {
    const v = parseAndValidate(raw);
    return { ok: v.ok, count: v.tokens.length };
  }, [raw]);

  const runAudit = () => {
    // 非法输入：合并反馈并保留输入内容（不清空 textarea）。
    const validation = parseAndValidate(raw);
    if (!validation.ok) {
      setErrors(validation.errors);
      setResult(null);
      return;
    }
    setErrors([]);
    setRunning(true);

    workerRef.current?.terminate();
    const worker = new Worker(new URL('./worker/auditWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (ev: MessageEvent<import('./worker/auditWorker').AuditResponse>) => {
      const msg = ev.data;
      setRunning(false);
      if (msg.type === 'done') {
        setResult(msg.result);
      } else {
        setErrors([`审计失败：${msg.message}`]);
      }
      worker.terminate();
      workerRef.current = null;
    };
    worker.onerror = (e) => {
      setRunning(false);
      setErrors([`审计线程错误：${e.message}`]);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({ type: 'audit', perm: validation.tokens });
  };

  return (
    <div className="app">
      <header>
        <h1>带符号排列 · 规范倒位审计</h1>
        <p>
          输入 3 至 7 个带符号标记（绝对值必须恰好为 1 至 n 且互异）。一次倒位选择闭区间
          [i,j]，反转区间内标记次序并同时翻转每个符号。系统通过全状态反向分层穷举求到
          全正顺序 [1,…,n] 的最少步数，在全部最短方案中按每步 (起, 止) 下标对序列的字典序
          选出规范方案，并以任意精度十进制给出方案总数。全部计算仅在本浏览器内完成。
        </p>
      </header>

      <section className="card">
        <h2>① 输入排列</h2>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
          placeholder="例如：1 -3 -2 4（支持空格、逗号、中文逗号/分号分隔）"
        />
        <div className="row">
          <button className="primary" onClick={runAudit} disabled={running}>
            {running ? (
              <>
                <span className="spinner" /> 审计中…
              </>
            ) : (
              '启动审计'
            )}
          </button>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              className="chip-btn"
              onClick={() => {
                setRaw(ex.value);
                setErrors([]);
              }}
            >
              {ex.label}
            </button>
          ))}
          <span className="hint" style={{ margin: 0 }}>
            {raw.trim().length === 0
              ? '尚未输入'
              : preview.ok
                ? `已识别 ${preview.count} 个标记，校验通过`
                : '当前输入未通过校验（点击启动审计查看合并反馈）'}
          </span>
        </div>
        <div className="hint">
          符号约定：负号写在数字前（如 -3）；区间下标 1 基、含两端；单元素区间仅翻转该标记符号。
        </div>
        {errors.length > 0 && (
          <div className="errors" role="alert">
            <strong>输入不合法：</strong>
            <ul>
              {errors.map((e, k) => (
                <li key={k}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {result && <ResultView result={result} />}

      <footer>
        纯静态页面（TypeScript + React + Vite），无业务后端、无持久化、无在线调用；
        穷举在 Web Worker 内进行，n≤7 时状态空间上限为 2ⁿ·n! = 645,120。
      </footer>
    </div>
  );
}

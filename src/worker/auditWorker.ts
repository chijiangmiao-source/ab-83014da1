/// <reference lib="webworker" />
import { audit, type AuditResult } from '../solver/signedReversal';

/** 跨 Worker 边界的可序列化结果：bigint 一律转十进制字符串（任意精度） */
export interface AuditResultDto extends Omit<AuditResult, 'totalWays' | 'edgeWays'> {
  totalWays: string;
  edgeWays: string[][];
}

export type AuditRequest = { type: 'audit'; perm: number[] };
export type AuditResponse = { type: 'done'; result: AuditResultDto } | { type: 'error'; message: string };

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (ev: MessageEvent<AuditRequest>) => {
  const msg = ev.data;
  if (msg.type !== 'audit') return;
  try {
    const r: AuditResult = audit(msg.perm);
    const result: AuditResultDto = {
      ...r,
      totalWays: r.totalWays.toString(),
      edgeWays: r.edgeWays.map((row) => row.map((v) => v.toString())),
    };
    worker.postMessage({ type: 'done', result } satisfies AuditResponse);
  } catch (err) {
    worker.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies AuditResponse);
  }
};

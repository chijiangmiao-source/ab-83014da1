# 带符号排列 · 规范倒位审计

基因组装配复核场景的纯浏览器审计页：对 3–7 个带符号标记组成的排列，求到全正顺序
`[1,2,…,n]` 的**最少**倒位序列，并给出全部最短方案的精确总数、规范方案与
“深度 × 区间”出现矩阵。

> 反例背景：只按“眼前减少断点最多”的贪心选择区间，可能错过最短修复，
> 也会掩盖同样短的替代路径。本工具因此对整个状态空间做反向分层穷举，
> 给出经证明的最优解与全部等长路径信息。

## 规则与定义

- 输入：3–7 个带符号整数，**绝对值必须恰好为 1..n 且互异**（如 `1 -3 -2 4`）。
- 一次倒位选择闭区间 `[i,j]`（1 基、含两端）：反转区间内标记次序，
  同时翻转每个符号。例：`[1,-3,-2,4]` 倒位 `[2,3]` → `[1,2,3,4]`。
- **最少步数**：从目标态 `[1,…,n]` 反向分层 BFS（倒位自逆），
  输入所在层即严格最短距离。
- **方案总数**：按最短路径动态规划计数（内部 `BigUint64`，输出为 bigint
  十进制字符串，任意精度）。
- **规范方案**：在所有最短方案中，使每步 `(起下标, 止下标)` 对的序列
  字典序最小；实现上每一步按 `(i,j)` 字典序选第一个保持最短距离的倒位。
- **深度 × 区间矩阵**：沿规范轨迹，在每个深度状态标出各区间属于
  - `全部`（all）：该状态的每条最短路径第一步都走此区间；
  - `部分`（some）：只有一部分最短路径走此区间；
  - `从不`（none）：任何最短方案都不走此区间。
  格内同时给出经过该边的精确最短路径条数。点击单元格会联动高亮
  规范轨迹中对应的深度、区间与标记；轨迹/区间按钮也反向定位单元格。

状态空间上限 2ⁿ·n!（n=7 时 645,120），最坏输入在普通浏览器约 1 秒，
计算运行于 **Web Worker**，不阻塞页面。全部计算本地完成：
**无业务后端、无持久化、无在线调用**。

## 本地开发

```bash
npm ci
npm test          # vitest：64 项测试（含 n=3 全 48 状态穷举对照）
npm run build     # tsc --noEmit + vite 生产构建 → dist/
npm run dev       # 本地开发服务器
BASE_URL=http://localhost:4173/ npm run check:requirements
                  # HTTP 冒烟 + 需求断言（需先启动静态服务）
```

## Docker 发布

静态 Web 由多阶段 Dockerfile 构建（Node 构建 → nginx 托管 `dist`）。

```bash
# 默认宿主机端口 8080，可用 WEB_PORT 覆盖：
WEB_PORT=9090 docker compose up -d --build

# 一次性验收服务（退出码报告结果）：
docker compose build verify
docker compose run --rm verify
# verify 会等待 web 健康检查通过，然后：
#   npm test → npm run build → HTTP 冒烟 → 需求断言
#   · [1,-3,-2,4] 最短步数为 1（规范倒位 [2,3]）
#   · 重复绝对值被校验拒绝
```

- 健康检查：`GET /healthz` → `200 ok`（容器内 wget 健康检查）。
- 未知路径回退 `index.html`（静态 SPA）。

## 目录结构

```
src/
  solver/signedReversal.ts   核心：位编码状态 + 稠密秩 BFS + 路径计数 + 规范方案 + 出现矩阵
  solver/validate.ts         输入解析与合并校验反馈
  worker/auditWorker.ts      Web Worker（bigint 以十进制字符串跨线程传递）
  components/ResultView.tsx  结论卡片、逐步轨迹、深度×区间矩阵与联动
  App.tsx                    输入/粘贴/示例、错误反馈（保留输入）
scripts/check-requirements.ts verify 服务的 HTTP 冒烟与需求断言（退出码报告）
Dockerfile                   deps / build / web / verify 多目标
docker-compose.yml           web（可配置端口+健康检查）、verify（一次性）
nginx.conf                   纯静态托管 + /healthz
```

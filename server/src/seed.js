'use strict';

/**
 * 首次初始化数据库时写入的示例方案：
 *
 *   R1(120) ──50──> E1(120)        E1 可直达，另有 R2 汇入
 *   R2(80)  ──100─> E1             R2 也可借道 R3 去往 E2
 *   R3(60)  ──60──> E2(80)        E2 直达
 *   R2      ──30──> R3            通道共享
 *   R4(30)  （无任何连通通道，孤立房间）
 *
 * 正常：总需求 290；R1→E1 瓶颈 50，R3→E2 瓶颈 60，最大送达 180，缺口 110
 *       （按编号优先分配：R1=50, R2=80, R3=50, R4=0；R2 借道 R3 10 人）。
 * 封闭 E1：仅剩 E2，最大送达 60（R2→R3 中转 30 + R3 自身 30），R1/R4 孤立。
 * 封闭 E2：仅剩 E1，最大送达 120（R1=50, R2=70），R3/R4 孤立。
 */
export const sampleScenario = {
  name: '示例展馆（4 房间 / 2 出口）',
  rooms: [
    { id: 'R1', name: '1 号展厅', people: 120 },
    { id: 'R2', name: '2 号展厅', people: 80 },
    { id: 'R3', name: '3 号展厅', people: 60 },
    { id: 'R4', name: '设备间（孤立）', people: 30 },
  ],
  exits: [
    { id: 'E1', name: '东出口', capacity: 120 },
    { id: 'E2', name: '西出口', capacity: 80 },
  ],
  passages: [
    { from: 'R1', to: 'E1', capacity: 50 },
    { from: 'R2', to: 'E1', capacity: 100 },
    { from: 'R3', to: 'E2', capacity: 60 },
    { from: 'R2', to: 'R3', capacity: 30 },
  ],
};

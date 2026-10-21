/**
 * MES 系统 - 进程内互斥执行器
 * =============================================================================
 * 用途：把「先查询再写入」的临界区串行化，消除单进程内的 TOCTOU 竞态，例如：
 *   · 同一工单的两笔报工（数量上限校验 + 累加）
 *   · 同一工单的并发状态流转
 *   · 同一物料的并发出库（库存充足性校验 + 扣减）
 *   · 同一设备的排程冲突检测 + 创建
 *
 * 实现：按 key 维护一条 Promise 链，后到任务等待前序任务 settle（无论成功/失败）后执行。
 *
 * ⚠️ 边界说明（重要）：
 *   1. 仅对**同一个 Node 进程**有效。当前部署约定为单实例（SQLite 单写者，PM2 instances=1）；
 *      若将来改为多实例 + MySQL，需改用数据库行锁（SELECT ... FOR UPDATE）或分布式锁。
 *   2. 任务内部异常不会阻断后续任务；异常仍会原样抛给调用方。
 *   3. key 建议使用业务主键（如 `work-order:12`），避免全局串行导致吞吐下降。
 */

/** key → 队尾 Promise（值始终是「已吞掉异常」的 Promise） */
const queues = new Map();

/**
 * 在指定 key 上串行执行任务
 * @param {string} key 互斥键（同一 key 的任务串行执行，不同 key 并行）
 * @param {() => Promise<any>} task 待执行任务
 * @returns {Promise<any>} 任务执行结果
 */
function runExclusive(key, task) {
  const previous = queues.get(key) || Promise.resolve();

  // 前序任务无论成功失败都继续执行当前任务
  const current = previous.then(task, task);

  // 队尾只关心「已结束」，避免前序失败导致链断裂；同时不吞掉 current 的异常（由调用方处理）
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);

  // 清理：当前任务仍是队尾时移除，避免 Map 随工单/物料数量无限增长
  tail.then(() => {
    if (queues.get(key) === tail) {
      queues.delete(key);
    }
  });

  return current;
}

module.exports = { runExclusive };

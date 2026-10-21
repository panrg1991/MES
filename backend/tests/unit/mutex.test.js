/**
 * 单元测试：src/utils/mutex.js
 * ---------------------------------------------------------------------------
 * 进程内互斥器是报工 / 状态流转 / 排程并发正确性的基础，必须保证：
 *  ① 同一 key 串行执行（后到任务等待前序任务结束）
 *  ② 前序任务失败不会阻断后续任务（异常仍抛给各自调用方）
 *  ③ 不同 key 互不影响（可并行）
 */

const { describe, test, expect } = require('@jest/globals');
const { runExclusive } = require('../../src/utils/mutex');

/** 延时工具 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('runExclusive - 进程内互斥', () => {
  test('同一 key 的任务严格串行执行', async () => {
    const order = [];
    const key = `serial-${Date.now()}`;

    const first = runExclusive(key, async () => {
      order.push('first-start');
      await delay(20);
      order.push('first-end');
    });
    const second = runExclusive(key, async () => {
      order.push('second');
    });

    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  test('前序任务失败不阻断后续任务，异常按调用方分别抛出', async () => {
    const key = `fail-${Date.now()}`;

    const failing = runExclusive(key, async () => {
      throw new Error('boom');
    });
    const next = runExclusive(key, async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  test('不同 key 的任务可并行执行', async () => {
    const order = [];
    const base = Date.now();

    const slow = runExclusive(`a-${base}`, async () => {
      await delay(30);
      order.push('slow');
    });
    const fast = runExclusive(`b-${base}`, async () => {
      order.push('fast');
    });

    await Promise.all([slow, fast]);
    expect(order).toEqual(['fast', 'slow']);
  });
});

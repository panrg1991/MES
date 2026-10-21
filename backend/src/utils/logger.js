/**
 * MES 系统 - 轻量结构化日志
 * =============================================================================
 * 设计目标：
 *  ① 一行一条 JSON（生产），便于 Filebeat / Loki / ELK 采集与按字段检索；
 *  ② 开发环境输出人可读格式，保留现场调试体验；
 *  ③ 自动脱敏 password / token / authorization / secret 等敏感字段；
 *  ④ 零外部依赖：仅使用 console，避免引入 pino 等额外包与配置成本。
 *
 * 级别：error > warn > info > debug
 * 控制：LOG_LEVEL 环境变量（默认 production=info，其他=debug）
 *
 * ⚠️ 调用约定：只记录「可定位问题」的最小上下文（requestId / userId / path / 业务主键），
 *    不要记录密码、完整 Token、请求体全文。
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/** 需要脱敏的字段名（不区分大小写） */
const SENSITIVE_KEY_PATTERN = /password|passwd|token|authorization|secret|cookie/i;

/**
 * 解析当前日志级别
 * @returns {'error'|'warn'|'info'|'debug'} 级别
 */
function resolveLevel() {
  const fromEnv = String(process.env.LOG_LEVEL || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEVELS, fromEnv)) {
    return fromEnv;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * 递归脱敏（仅处理普通对象/数组，最多 3 层，避免循环引用与性能开销）
 * @param {unknown} value 原始值
 * @param {number} depth 当前深度
 * @returns {unknown} 脱敏后的值
 */
function sanitize(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 3) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '***';
    } else if (item instanceof Error) {
      result[key] = { name: item.name, message: item.message };
    } else {
      result[key] = sanitize(item, depth + 1);
    }
  }
  return result;
}

/**
 * 移除 undefined 字段（JSON.stringify 会丢弃，但开发格式的可读性更好）
 * @param {object} context 上下文
 * @returns {object} 清理后的上下文
 */
function compact(context) {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  );
}

/**
 * 输出一条日志
 * @param {'error'|'warn'|'info'|'debug'} level 级别
 * @param {string} message 事件名（建议英文小写下划线，便于聚合，如 http_request）
 * @param {object} [context] 上下文字段
 */
function write(level, message, context = {}) {
  if (LEVELS[level] > LEVELS[resolveLevel()]) return;

  const payload = compact(sanitize(context));
  const time = new Date().toISOString();

  if (process.env.NODE_ENV === 'production') {
    const line = JSON.stringify({ time, level, msg: message, ...payload });
    const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    output.call(console, line);
    return;
  }

  const suffix = Object.keys(payload).length > 0 ? ` ${JSON.stringify(payload)}` : '';
  const line = `[${time}] ${level.toUpperCase().padEnd(5)} ${message}${suffix}`;
  const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  output.call(console, line);
}

const logger = {
  /**
   * 记录错误（含堆栈，仅用于 5xx / 未捕获异常）
   * @param {string} message 事件名
   * @param {object} [context] 上下文
   */
  error(message, context) {
    write('error', message, context);
  },
  /**
   * 记录告警（4xx 安全事件、慢请求、降级）
   * @param {string} message 事件名
   * @param {object} [context] 上下文
   */
  warn(message, context) {
    write('warn', message, context);
  },
  /**
   * 记录一般信息（请求完成、启动、业务关键动作）
   * @param {string} message 事件名
   * @param {object} [context] 上下文
   */
  info(message, context) {
    write('info', message, context);
  },
  /**
   * 记录调试信息（仅开发环境默认输出）
   * @param {string} message 事件名
   * @param {object} [context] 上下文
   */
  debug(message, context) {
    write('debug', message, context);
  },
};

module.exports = { logger, sanitize };

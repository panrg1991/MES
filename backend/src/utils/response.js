/**
 * MES 系统 - 统一响应封装
 * 所有 Controller 通过此模块返回标准化 JSON 响应
 * 响应格式：{ code, data, message, errors? }
 *
 * 【Decimal 序列化约定】
 * schema 中数量、工时等字段使用 `Decimal @db.Decimal(12,2)` 以保证精度，
 * 但 Prisma Client 返回的是 Decimal 对象，JSON.stringify 后会变成**字符串**（如 "12.34"），
 * 破坏前端「数值即 number」的契约（前端会调用 .toFixed()、直接参与算术运算）。
 * 因此所有成功响应在写出前统一递归转换：Decimal → number，BigInt → number。
 */

/**
 * 递归把 Prisma Decimal / BigInt 转成 JS number
 * @param {unknown} value - 任意值（对象 / 数组 / 原始值）
 * @returns {unknown} 转换后的值（Date 与普通对象结构保持不变）
 */
function toPlainNumber(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(toPlainNumber);
  }
  if (value instanceof Date) {
    // 交给 JSON.stringify 处理为 ISO 字符串，保持原有契约
    return value;
  }
  if (typeof value === 'object') {
    // Prisma Decimal（decimal.js 实例）同时具备 toNumber 与 toFixed
    if (
      typeof value.toNumber === 'function' &&
      typeof value.toFixed === 'function'
    ) {
      return value.toNumber();
    }
    const plain = {};
    Object.keys(value).forEach((key) => {
      plain[key] = toPlainNumber(value[key]);
    });
    return plain;
  }
  return value;
}

/**
 * 成功响应
 * @param {object} res - Express Response 对象
 * @param {unknown} data - 业务数据
 * @param {string} message - 提示信息
 * @param {number} statusCode - HTTP 状态码（默认 200）
 * @returns {object} Express Response
 */
function sendSuccess(res, data = null, message = '操作成功', statusCode = 200) {
  return res.status(statusCode).json({
    code: statusCode,
    data: toPlainNumber(data),
    message,
  });
}

/**
 * 创建成功响应（201）
 * @param {object} res - Express Response 对象
 * @param {unknown} data - 业务数据
 * @param {string} message - 提示信息
 * @returns {object} Express Response
 */
function sendCreated(res, data = null, message = '创建成功') {
  return sendSuccess(res, data, message, 201);
}

/**
 * 分页响应
 * @param {object} res - Express Response 对象
 * @param {Array} list - 列表数据
 * @param {number} total - 总条数
 * @param {number} page - 当前页码
 * @param {number} pageSize - 每页条数
 * @param {string} message - 提示信息
 * @returns {object} Express Response
 */
function sendPaginated(res, list, total, page, pageSize, message = '查询成功') {
  return res.status(200).json({
    code: 200,
    data: {
      list: toPlainNumber(list),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    },
    message,
  });
}

/**
 * 错误响应
 * @param {object} res - Express Response 对象
 * @param {string} message - 错误信息
 * @param {number} statusCode - HTTP 状态码（默认 400）
 * @param {Array} errors - 字段级错误明细
 * @returns {object} Express Response
 */
function sendError(res, message = '操作失败', statusCode = 400, errors = null) {
  const response = {
    code: statusCode,
    data: null,
    message,
  };

  if (errors && errors.length > 0) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
}

/**
 * 未认证响应（401）
 * @param {object} res - Express Response 对象
 * @param {string} message - 错误信息
 * @returns {object} Express Response
 */
function sendUnauthorized(res, message = '未登录或 Token 已过期') {
  return sendError(res, message, 401);
}

/**
 * 无权限响应（403）
 * @param {object} res - Express Response 对象
 * @param {string} message - 错误信息
 * @returns {object} Express Response
 */
function sendForbidden(res, message = '无权限访问') {
  return sendError(res, message, 403);
}

/**
 * 资源不存在响应（404）
 * @param {object} res - Express Response 对象
 * @param {string} message - 错误信息
 * @returns {object} Express Response
 */
function sendNotFound(res, message = '资源不存在') {
  return sendError(res, message, 404);
}

/**
 * 业务冲突响应（409）
 * @param {object} res - Express Response 对象
 * @param {string} message - 错误信息
 * @returns {object} Express Response
 */
function sendConflict(res, message = '操作冲突') {
  return sendError(res, message, 409);
}

/**
 * 功能未实现响应（501）
 * 【P1 新增】用于 T06 阶段已挂载但业务逻辑待 T07~T09 填充的骨架端点，
 * 保证端点可达且返回语义明确的状态码，不产生 404/500 噪音。
 * @param {object} res - Express Response 对象
 * @param {string} message - 提示信息
 * @returns {object} Express Response
 */
function sendNotImplemented(res, message = '功能建设中，敬请期待') {
  return sendError(res, message, 501);
}

module.exports = {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendNotImplemented,
  toPlainNumber,
};

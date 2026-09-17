/**
 * MES 系统 - 统一响应封装
 * 所有 Controller 通过此模块返回标准化 JSON 响应
 * 响应格式：{ code, data, message, errors? }
 */

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
    data,
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
      list,
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
};

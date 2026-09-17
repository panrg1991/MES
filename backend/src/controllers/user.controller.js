/**
 * MES 系统 - 用户管理控制器
 * 处理：用户列表、详情、创建、更新、状态切换、重置密码、删除
 */

const userService = require('../services/user.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/**
 * GET /api/users?page=1&pageSize=20&keyword=xxx&status=true
 * 用户列表（分页）
 */
async function getUsers(req, res, next) {
  try {
    const { page, pageSize, keyword, status } = req.query;
    const { list, total } = await userService.getUsers(page, pageSize, keyword, status);
    return sendPaginated(res, list, total, page, pageSize, '查询用户列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/users/:id
 * 用户详情
 */
async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(Number(id));
    return sendSuccess(res, user, '查询用户详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/users
 * 创建用户
 */
async function createUser(req, res, next) {
  try {
    const user = await userService.createUser(req.body);
    return sendCreated(res, user, '创建用户成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/users/:id
 * 更新用户
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userService.updateUser(Number(id), req.body);
    return sendSuccess(res, user, '更新用户成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PATCH /api/users/:id/status
 * 切换用户状态
 */
async function toggleStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = await userService.toggleStatus(Number(id), status);
    return sendSuccess(res, user, status ? '已启用' : '已停用');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PATCH /api/users/:id/password
 * 重置密码
 */
async function resetPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    await userService.resetPassword(Number(id), newPassword);
    return sendSuccess(res, null, '密码重置成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/users/:id
 * 删除用户
 */
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    await userService.deleteUser(Number(id));
    return sendSuccess(res, null, '删除用户成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleStatus,
  resetPassword,
  deleteUser,
};

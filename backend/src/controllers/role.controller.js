/**
 * MES 系统 - 角色权限控制器
 * 处理：角色列表、详情、创建、更新、删除、权限分配、权限树
 */

const roleService = require('../services/role.service');
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendError,
} = require('../utils/response');

/**
 * GET /api/roles?page=1&pageSize=20&keyword=xxx
 * 角色列表（分页）
 */
async function getRoles(req, res, next) {
  try {
    const { page, pageSize, keyword } = req.query;
    const { list, total } = await roleService.getRoles(page, pageSize, keyword);
    return sendPaginated(res, list, total, page, pageSize, '查询角色列表成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/roles/:id
 * 角色详情（含权限列表）
 */
async function getRoleById(req, res, next) {
  try {
    const { id } = req.params;
    const role = await roleService.getRoleById(Number(id));
    return sendSuccess(res, role, '查询角色详情成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * POST /api/roles
 * 创建角色
 */
async function createRole(req, res, next) {
  try {
    const role = await roleService.createRole(req.body);
    return sendCreated(res, role, '创建角色成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/roles/:id
 * 更新角色
 */
async function updateRole(req, res, next) {
  try {
    const { id } = req.params;
    const role = await roleService.updateRole(Number(id), req.body);
    return sendSuccess(res, role, '更新角色成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * DELETE /api/roles/:id
 * 删除角色
 */
async function deleteRole(req, res, next) {
  try {
    const { id } = req.params;
    await roleService.deleteRole(Number(id));
    return sendSuccess(res, null, '删除角色成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/roles/:id/permissions
 * 获取角色的权限 ID 列表
 */
async function getRolePermissions(req, res, next) {
  try {
    const { id } = req.params;
    const permissionIds = await roleService.getRolePermissions(Number(id));
    return sendSuccess(res, { permissionIds }, '获取角色权限成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * PUT /api/roles/:id/permissions
 * 分配权限给角色
 */
async function assignPermissions(req, res, next) {
  try {
    const { id } = req.params;
    const { permissionIds } = req.body;
    await roleService.assignPermissions(Number(id), permissionIds);
    return sendSuccess(res, null, '权限分配成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * GET /api/permissions
 * 获取所有权限（树形结构）
 */
async function getAllPermissions(req, res, next) {
  try {
    const tree = await roleService.getAllPermissions();
    return sendSuccess(res, tree, '获取权限树成功');
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  assignPermissions,
  getAllPermissions,
};

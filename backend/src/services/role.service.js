/**
 * MES 系统 - 角色权限服务层
 * 功能：角色 CRUD、权限分配、权限树构建
 */

const { prisma } = require('../config/database');

/**
 * 获取角色列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getRoles(page, pageSize, keyword) {
  const where = {};

  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
    ];
  }

  const [list, total] = await Promise.all([
    prisma.role.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            userRoles: true,
            rolePermissions: true,
          },
        },
      },
    }),
    prisma.role.count({ where }),
  ]);

  // 格式化返回数据
  const formattedList = list.map((role) => ({
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    status: role.status,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    userCount: role._count.userRoles,
    permissionCount: role._count.rolePermissions,
  }));

  return { list: formattedList, total };
}

/**
 * 根据 ID 获取角色详情（含权限列表）
 * @param {number} id - 角色 ID
 * @returns {Promise<object>} 角色信息（含权限编码列表）
 * @throws {Error} 角色不存在
 */
async function getRoleById(id) {
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      rolePermissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  if (!role) {
    const error = new Error('角色不存在');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    status: role.status,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: role.rolePermissions.map((rp) => rp.permission),
  };
}

/**
 * 创建角色
 * @param {object} data - { name, code, description }
 * @returns {Promise<object>} 创建后的角色
 * @throws {Error} 角色编码已存在
 */
async function createRole(data) {
  const { name, code, description } = data;

  // 检查编码唯一性
  const existing = await prisma.role.findUnique({ where: { code } });
  if (existing) {
    const error = new Error('角色编码已存在');
    error.statusCode = 409;
    throw error;
  }

  const role = await prisma.role.create({
    data: {
      name,
      code,
      description: description || '',
    },
  });

  return role;
}

/**
 * 更新角色
 * @param {number} id - 角色 ID
 * @param {object} data - { name?, description?, status? }
 * @returns {Promise<object>} 更新后的角色
 * @throws {Error} 角色不存在 / 不允许修改系统管理员角色
 */
async function updateRole(id, data) {
  const { name, description, status } = data;

  // 检查角色是否存在
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('角色不存在');
    error.statusCode = 404;
    throw error;
  }

  // 不允许修改系统管理员角色的编码
  if (existing.code === 'system:admin' && status === false) {
    const error = new Error('不允许停用系统管理员角色');
    error.statusCode = 403;
    throw error;
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (status !== undefined) updateData.status = status;

  const role = await prisma.role.update({
    where: { id },
    data: updateData,
  });

  return role;
}

/**
 * 删除角色
 * @param {number} id - 角色 ID
 * @throws {Error} 角色不存在 / 角色下有用户 / 不允许删除系统管理员角色
 */
async function deleteRole(id) {
  // 检查角色是否存在
  const existing = await prisma.role.findUnique({
    where: { id },
    include: {
      _count: {
        select: { userRoles: true },
      },
    },
  });

  if (!existing) {
    const error = new Error('角色不存在');
    error.statusCode = 404;
    throw error;
  }

  // 不允许删除系统管理员角色
  if (existing.code === 'system:admin') {
    const error = new Error('不允许删除系统管理员角色');
    error.statusCode = 403;
    throw error;
  }

  // 检查角色下是否有用户
  if (existing._count.userRoles > 0) {
    const error = new Error(`该角色下还有 ${existing._count.userRoles} 个用户，无法删除`);
    error.statusCode = 409;
    throw error;
  }

  // 使用事务删除角色及其权限关联
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({
      where: { roleId: id },
    });
    await tx.role.delete({
      where: { id },
    });
  });
}

/**
 * 获取角色的权限 ID 列表
 * @param {number} roleId - 角色 ID
 * @returns {Promise<number[]>} 权限 ID 列表
 * @throws {Error} 角色不存在
 */
async function getRolePermissions(roleId) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      rolePermissions: {
        select: {
          permissionId: true,
        },
      },
    },
  });

  if (!role) {
    const error = new Error('角色不存在');
    error.statusCode = 404;
    throw error;
  }

  return role.rolePermissions.map((rp) => rp.permissionId);
}

/**
 * 分配权限给角色
 * @param {number} roleId - 角色 ID
 * @param {number[]} permissionIds - 权限 ID 列表
 * @throws {Error} 角色不存在 / 不允许修改系统管理员权限
 */
async function assignPermissions(roleId, permissionIds) {
  // 检查角色是否存在
  const existing = await prisma.role.findUnique({ where: { id: roleId } });
  if (!existing) {
    const error = new Error('角色不存在');
    error.statusCode = 404;
    throw error;
  }

  // 检查权限 ID 是否都存在
  const permissions = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { id: true },
  });
  if (permissions.length !== permissionIds.length) {
    const error = new Error('部分权限不存在');
    error.statusCode = 400;
    throw error;
  }

  // 使用事务：先删除旧权限关联，再创建新的
  await prisma.$transaction(async (tx) => {
    // 删除旧的权限关联
    await tx.rolePermission.deleteMany({
      where: { roleId },
    });

    // 创建新的权限关联
    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId,
        permissionId,
      })),
    });
  });
}

/**
 * 获取所有权限列表（树形结构）
 * @returns {Promise<Array>} 权限树（嵌套结构）
 */
async function getAllPermissions() {
  // 查询所有权限
  const permissions = await prisma.permission.findMany({
    orderBy: { sort: 'asc' },
  });

  // 构建树形结构
  return buildPermissionTree(permissions, null);
}

/**
 * 递归构建权限树
 * @param {Array} permissions - 权限列表
 * @param {number|null} parentId - 父权限 ID
 * @returns {Array} 权限树节点数组
 */
function buildPermissionTree(permissions, parentId) {
  return permissions
    .filter((p) => p.parentId === parentId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      type: p.type,
      path: p.path,
      sort: p.sort,
      children: buildPermissionTree(permissions, p.id),
    }));
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

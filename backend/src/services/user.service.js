/**
 * MES 系统 - 用户管理服务层
 * 功能：用户 CRUD、分页查询、状态切换、重置密码、角色分配
 */

const { prisma } = require('../config/database');
const { hashPassword } = require('./auth.service');

/**
 * 获取用户列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {string} keyword - 搜索关键字（用户名/姓名/部门）
 * @param {string} status - 状态过滤（'true'/'false'）
 * @returns {Promise<{list: Array, total: number}>}
 */
async function getUsers(page, pageSize, keyword, status) {
  // 构造查询条件
  const where = {
    AND: [],
  };

  if (keyword) {
    where.AND.push({
      OR: [
        { username: { contains: keyword } },
        { name: { contains: keyword } },
        { department: { contains: keyword } },
      ],
    });
  }

  if (status !== undefined) {
    where.AND.push({ status: status === 'true' });
  }

  // 如果 AND 为空，移除该条件
  if (where.AND.length === 0) {
    delete where.AND;
  }

  // 并行查询数据和总数
  const [list, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        userRoles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // 格式化返回数据（移除 passwordHash）
  const formattedList = list.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    department: user.department,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.userRoles.map((ur) => ur.role),
  }));

  return { list: formattedList, total };
}

/**
 * 根据 ID 获取用户详情
 * @param {number} id - 用户 ID
 * @returns {Promise<object>} 用户信息（含角色）
 * @throws {Error} 用户不存在
 */
async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      userRoles: {
        include: {
          role: {
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    const error = new Error('用户不存在');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    department: user.department,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.userRoles.map((ur) => ur.role),
  };
}

/**
 * 创建用户
 * @param {object} data - { username, name, department, password, roleIds }
 * @returns {Promise<object>} 创建后的用户信息
 * @throws {Error} 用户名已存在
 */
async function createUser(data) {
  const { username, name, department, password, roleIds } = data;

  // 1. 检查用户名是否已存在
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    const error = new Error('用户名已存在');
    error.statusCode = 409;
    throw error;
  }

  // 2. 检查角色 ID 是否都存在
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true },
  });
  if (roles.length !== roleIds.length) {
    const error = new Error('部分角色不存在');
    error.statusCode = 400;
    throw error;
  }

  // 3. 创建用户（含角色关联），使用事务保证一致性
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        username,
        name,
        department,
        passwordHash: hashPassword(password),
      },
    });

    // 批量创建用户-角色关联
    await tx.userRole.createMany({
      data: roleIds.map((roleId) => ({
        userId: newUser.id,
        roleId,
      })),
    });

    return newUser;
  });

  // 4. 查询完整信息返回
  return await getUserById(user.id);
}

/**
 * 更新用户
 * @param {number} id - 用户 ID
 * @param {object} data - { name?, department?, roleIds? }
 * @returns {Promise<object>} 更新后的用户信息
 * @throws {Error} 用户不存在
 */
async function updateUser(id, data) {
  const { name, department, roleIds } = data;

  // 1. 检查用户是否存在
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('用户不存在');
    error.statusCode = 404;
    throw error;
  }

  // 2. 使用事务更新用户基本信息和角色关联
  await prisma.$transaction(async (tx) => {
    // 更新基本信息
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (department !== undefined) updateData.department = department;

    if (Object.keys(updateData).length > 0) {
      await tx.user.update({
        where: { id },
        data: updateData,
      });
    }

    // 如果提供了 roleIds，更新角色关联
    if (roleIds !== undefined) {
      // 先删除旧的角色关联
      await tx.userRole.deleteMany({
        where: { userId: id },
      });

      // 再创建新的角色关联
      if (roleIds.length > 0) {
        // 验证角色存在
        const roles = await tx.role.findMany({
          where: { id: { in: roleIds } },
          select: { id: true },
        });
        if (roles.length !== roleIds.length) {
          throw new Error('部分角色不存在');
        }

        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId: id,
            roleId,
          })),
        });
      }
    }
  });

  // 3. 返回更新后的信息
  return await getUserById(id);
}

/**
 * 切换用户状态（启用/停用）
 * @param {number} id - 用户 ID
 * @param {boolean} status - 目标状态
 * @returns {Promise<object>} 更新后的用户信息
 * @throws {Error} 用户不存在
 */
async function toggleStatus(id, status) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('用户不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.user.update({
    where: { id },
    data: { status },
  });

  return await getUserById(id);
}

/**
 * 重置密码
 * @param {number} id - 用户 ID
 * @param {string} newPassword - 新密码
 * @throws {Error} 用户不存在
 */
async function resetPassword(id, newPassword) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('用户不存在');
    error.statusCode = 404;
    throw error;
  }

  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashPassword(newPassword) },
  });
}

/**
 * 删除用户（物理删除，关联数据通过 SetNull 保留）
 * @param {number} id - 用户 ID
 * @throws {Error} 用户不存在 / 不允许删除管理员
 */
async function deleteUser(id) {
  // 1. 检查用户是否存在
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('用户不存在');
    error.statusCode = 404;
    throw error;
  }

  // 2. 不允许删除系统管理员账号
  if (existing.username === 'admin') {
    const error = new Error('不允许删除系统管理员账号');
    error.statusCode = 403;
    throw error;
  }

  // 3. 使用事务删除用户及其角色关联
  await prisma.$transaction(async (tx) => {
    // 删除用户-角色关联（外键设为 Cascade）
    await tx.userRole.deleteMany({
      where: { userId: id },
    });

    // 删除用户
    await tx.user.delete({
      where: { id },
    });
  });
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

/**
 * MES 系统 - 用户管理服务层
 * 功能：用户 CRUD、分页查询、状态切换、重置密码、角色分配
 */

const { prisma } = require('../config/database');
const { hashPassword } = require('./auth.service');

/** 系统管理员角色编码（与 seed.js 保持一致） */
const ADMIN_ROLE_CODE = 'system:admin';

/**
 * 判断用户是否持有系统管理员角色
 * @param {object} client Prisma 客户端或事务客户端
 * @param {number} userId 用户 ID
 * @returns {Promise<boolean>} 是否管理员
 */
async function hasAdminRole(client, userId) {
  const hit = await client.userRole.findFirst({
    where: { userId, role: { code: ADMIN_ROLE_CODE } },
    select: { userId: true },
  });
  return Boolean(hit);
}

/**
 * 统计「除指定用户外、仍处于启用状态」的管理员数量
 * 用于阻止停用/删除/降权最后一个管理员，避免系统无人可管理。
 * @param {object} client Prisma 客户端或事务客户端
 * @param {number} excludeUserId 排除的用户 ID
 * @returns {Promise<number>} 其他启用管理员数量
 */
async function countOtherActiveAdmins(client, excludeUserId) {
  return client.user.count({
    where: {
      status: true,
      id: { not: excludeUserId },
      userRoles: { some: { role: { code: ADMIN_ROLE_CODE } } },
    },
  });
}

/**
 * 构造带状态码的业务异常
 * @param {string} message 错误信息
 * @param {number} statusCode HTTP 状态码
 * @returns {Error}
 */
function createBusinessError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

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
        passwordHash: await hashPassword(password),
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
    throw createBusinessError('用户不存在', 404);
  }

  // 2. 角色相关校验放在事务外，便于返回明确的 400/403（避免事务内抛裸 Error 变成 500）
  if (roleIds !== undefined) {
    if (roleIds.length === 0) {
      throw createBusinessError('至少需要为用户保留一个角色', 400);
    }

    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true },
    });
    if (roles.length !== roleIds.length) {
      throw createBusinessError('部分角色不存在', 400);
    }

    // 管理员保护：不允许把「最后一个启用管理员」降权
    if (await hasAdminRole(prisma, id)) {
      const adminRole = await prisma.role.findUnique({
        where: { code: ADMIN_ROLE_CODE },
        select: { id: true },
      });
      const stillAdmin = adminRole ? roleIds.includes(adminRole.id) : false;
      if (!stillAdmin && (await countOtherActiveAdmins(prisma, id)) === 0) {
        throw createBusinessError('不能移除系统中最后一个管理员的角色', 403);
      }
    }
  }

  // 3. 使用事务更新用户基本信息和角色关联
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
      await tx.userRole.deleteMany({
        where: { userId: id },
      });

      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId: id,
          roleId,
        })),
      });
    }
  });

  // 4. 返回更新后的信息
  return await getUserById(id);
}

/**
 * 切换用户状态（启用/停用）
 * @param {number} id - 用户 ID
 * @param {boolean} status - 目标状态
 * @returns {Promise<object>} 更新后的用户信息
 * @throws {Error} 用户不存在
 */
async function toggleStatus(id, status, operatorId) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('用户不存在', 404);
  }

  if (!status) {
    // 不允许停用当前登录账号，避免误操作把自己锁在门外
    if (operatorId && Number(operatorId) === id) {
      throw createBusinessError('不能停用当前登录账号', 403);
    }

    // 不允许停用最后一个启用管理员
    if (await hasAdminRole(prisma, id)) {
      if ((await countOtherActiveAdmins(prisma, id)) === 0) {
        throw createBusinessError('不能停用系统中最后一个管理员账号', 403);
      }
    }
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
    data: { passwordHash: await hashPassword(newPassword) },
  });
}

/**
 * 删除用户（物理删除，关联数据通过 SetNull 保留）
 * @param {number} id - 用户 ID
 * @throws {Error} 用户不存在 / 不允许删除管理员
 */
async function deleteUser(id, operatorId) {
  // 1. 检查用户是否存在
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw createBusinessError('用户不存在', 404);
  }

  // 2. 不允许删除当前登录账号
  if (operatorId && Number(operatorId) === id) {
    throw createBusinessError('不能删除当前登录账号', 403);
  }

  // 3. 内置管理员账号不可删除（防止演示/初始账号被误删）
  if (existing.username === 'admin') {
    throw createBusinessError('不允许删除系统内置管理员账号', 403);
  }

  // 4. 不允许删除最后一个启用管理员：否则系统将无人可管理
  if (await hasAdminRole(prisma, id)) {
    if ((await countOtherActiveAdmins(prisma, id)) === 0) {
      throw createBusinessError('不允许删除系统中最后一个管理员账号', 403);
    }
  }

  // 5. 使用事务删除用户及其角色关联
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

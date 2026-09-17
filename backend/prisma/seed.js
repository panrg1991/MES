/**
 * MES 系统 - 初始数据种子脚本
 * 执行命令: node prisma/seed.js
 * 数据内容：管理员账号 / 角色 / 权限 / 车间 / 示例设备
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * 生成权限定义数据
 * 数据来源：P0 权限清单 + mes-prd-p1.md §5 新增 50 项权限（14 菜单 + 36 按钮）
 * 统计口径：P1 新增 2 个顶级菜单 + 12 个二级菜单 + 36 个按钮权限 = 50 项
 * 排序要求：顶级（parentId: null）先被创建，随后按数组顺序创建子级，
 *          因此**父级必须出现在其子级之前**（新权限块已按此顺序插入）。
 * @returns {Array} 权限定义列表
 */
function getPermissionDefinitions() {
  return [
    // ==================== 数据看板 ====================
    { name: '数据看板', code: 'dashboard', type: 'menu', path: '/dashboard', sort: 1, parentId: null },
    { name: '查看看板', code: 'dashboard:view', type: 'button', path: '', sort: 1, parentCode: 'dashboard' },

    // ==================== 生产管理 ====================
    { name: '生产管理', code: 'production', type: 'menu', path: '/production/orders', sort: 2, parentId: null },
    { name: '工单管理', code: 'production:order', type: 'menu', path: '/production/orders', sort: 1, parentCode: 'production' },
    { name: '查看工单', code: 'production:order:view', type: 'button', path: '', sort: 1, parentCode: 'production:order' },
    { name: '创建工单', code: 'production:order:create', type: 'button', path: '', sort: 2, parentCode: 'production:order' },
    { name: '编辑工单', code: 'production:order:edit', type: 'button', path: '', sort: 3, parentCode: 'production:order' },
    { name: '删除工单', code: 'production:order:delete', type: 'button', path: '', sort: 4, parentCode: 'production:order' },
    { name: '流转状态', code: 'production:order:status', type: 'button', path: '', sort: 5, parentCode: 'production:order' },
    { name: '提交报工', code: 'production:order:report', type: 'button', path: '', sort: 6, parentCode: 'production:order' },

    // ---- P1-01 生产排程（5 项：1 菜单 + 4 按钮）----
    { name: '生产排程', code: 'production:schedule', type: 'menu', path: '/production/schedule', sort: 2, parentCode: 'production' },
    { name: '查看排程', code: 'production:schedule:view', type: 'button', path: '', sort: 1, parentCode: 'production:schedule' },
    { name: '创建排程', code: 'production:schedule:create', type: 'button', path: '', sort: 2, parentCode: 'production:schedule' },
    { name: '调整排程', code: 'production:schedule:edit', type: 'button', path: '', sort: 3, parentCode: 'production:schedule' },
    { name: '删除排程', code: 'production:schedule:delete', type: 'button', path: '', sort: 4, parentCode: 'production:schedule' },

    // ==================== 设备管理 ====================
    { name: '设备管理', code: 'equipment', type: 'menu', path: '/equipment/list', sort: 3, parentId: null },
    { name: '设备台账', code: 'equipment:list', type: 'menu', path: '/equipment/list', sort: 1, parentCode: 'equipment' },
    { name: '查看设备', code: 'equipment:list:view', type: 'button', path: '', sort: 1, parentCode: 'equipment:list' },
    { name: '创建设备', code: 'equipment:list:create', type: 'button', path: '', sort: 2, parentCode: 'equipment:list' },
    { name: '编辑设备', code: 'equipment:list:edit', type: 'button', path: '', sort: 3, parentCode: 'equipment:list' },
    { name: '删除设备', code: 'equipment:list:delete', type: 'button', path: '', sort: 4, parentCode: 'equipment:list' },
    { name: '切换状态', code: 'equipment:list:status', type: 'button', path: '', sort: 5, parentCode: 'equipment:list' },

    // ---- P1-02 设备维保（6 项：1 菜单 + 5 按钮）----
    { name: '设备维保', code: 'equipment:maintenance', type: 'menu', path: '/equipment/maintenance', sort: 2, parentCode: 'equipment' },
    { name: '查看维保', code: 'equipment:maintenance:view', type: 'button', path: '', sort: 1, parentCode: 'equipment:maintenance' },
    { name: '创建维保计划', code: 'equipment:maintenance:create', type: 'button', path: '', sort: 2, parentCode: 'equipment:maintenance' },
    { name: '编辑维保计划', code: 'equipment:maintenance:edit', type: 'button', path: '', sort: 3, parentCode: 'equipment:maintenance' },
    { name: '登记维保记录', code: 'equipment:maintenance:complete', type: 'button', path: '', sort: 4, parentCode: 'equipment:maintenance' },
    { name: '删除维保计划', code: 'equipment:maintenance:delete', type: 'button', path: '', sort: 5, parentCode: 'equipment:maintenance' },

    // ---- P1-03 故障维修（5 项：1 菜单 + 4 按钮）----
    { name: '故障维修', code: 'equipment:breakdown', type: 'menu', path: '/equipment/breakdown', sort: 3, parentCode: 'equipment' },
    { name: '查看故障', code: 'equipment:breakdown:view', type: 'button', path: '', sort: 1, parentCode: 'equipment:breakdown' },
    { name: '故障报修', code: 'equipment:breakdown:create', type: 'button', path: '', sort: 2, parentCode: 'equipment:breakdown' },
    { name: '维修处理', code: 'equipment:breakdown:repair', type: 'button', path: '', sort: 3, parentCode: 'equipment:breakdown' },
    { name: '删除故障', code: 'equipment:breakdown:delete', type: 'button', path: '', sort: 4, parentCode: 'equipment:breakdown' },

    // ==================== 质量管理 ====================
    { name: '质量管理', code: 'quality', type: 'menu', path: '/quality/inspection', sort: 4, parentId: null },
    { name: '质量检验', code: 'quality:inspection', type: 'menu', path: '/quality/inspection', sort: 1, parentCode: 'quality' },
    { name: '查看检验', code: 'quality:inspection:view', type: 'button', path: '', sort: 1, parentCode: 'quality:inspection' },
    { name: '创建检验', code: 'quality:inspection:create', type: 'button', path: '', sort: 2, parentCode: 'quality:inspection' },
    { name: '编辑检验', code: 'quality:inspection:edit', type: 'button', path: '', sort: 3, parentCode: 'quality:inspection' },
    { name: '删除检验', code: 'quality:inspection:delete', type: 'button', path: '', sort: 4, parentCode: 'quality:inspection' },
    { name: '不良品管理', code: 'quality:defect', type: 'menu', path: '/quality/defects', sort: 2, parentCode: 'quality' },
    { name: '查看不良品', code: 'quality:defect:view', type: 'button', path: '', sort: 1, parentCode: 'quality:defect' },
    { name: '登记不良品', code: 'quality:defect:create', type: 'button', path: '', sort: 2, parentCode: 'quality:defect' },
    { name: '处理不良品', code: 'quality:defect:handle', type: 'button', path: '', sort: 3, parentCode: 'quality:defect' },
    { name: '删除不良品', code: 'quality:defect:delete', type: 'button', path: '', sort: 4, parentCode: 'quality:defect' },

    // ---- P1-04 质量追溯（2 项：1 菜单 + 1 按钮，只读聚合仅需 view）----
    { name: '质量追溯', code: 'quality:traceability', type: 'menu', path: '/quality/traceability', sort: 3, parentCode: 'quality' },
    { name: '查看追溯', code: 'quality:traceability:view', type: 'button', path: '', sort: 1, parentCode: 'quality:traceability' },

    // ==================== 物料管理 ====================
    { name: '物料管理', code: 'material', type: 'menu', path: '/material/items', sort: 5, parentId: null },
    { name: '物料主数据', code: 'material:items', type: 'menu', path: '/material/items', sort: 1, parentCode: 'material' },
    { name: '查看物料', code: 'material:items:view', type: 'button', path: '', sort: 1, parentCode: 'material:items' },
    { name: '创建物料', code: 'material:items:create', type: 'button', path: '', sort: 2, parentCode: 'material:items' },
    { name: '编辑物料', code: 'material:items:edit', type: 'button', path: '', sort: 3, parentCode: 'material:items' },
    { name: '删除物料', code: 'material:items:delete', type: 'button', path: '', sort: 4, parentCode: 'material:items' },
    { name: 'BOM管理', code: 'material:bom', type: 'menu', path: '/material/bom', sort: 2, parentCode: 'material' },
    { name: '查看BOM', code: 'material:bom:view', type: 'button', path: '', sort: 1, parentCode: 'material:bom' },
    { name: '创建BOM', code: 'material:bom:create', type: 'button', path: '', sort: 2, parentCode: 'material:bom' },
    { name: '编辑BOM', code: 'material:bom:edit', type: 'button', path: '', sort: 3, parentCode: 'material:bom' },
    { name: '删除BOM', code: 'material:bom:delete', type: 'button', path: '', sort: 4, parentCode: 'material:bom' },
    { name: '库存管理', code: 'material:inventory', type: 'menu', path: '/material/inventory', sort: 3, parentCode: 'material' },
    { name: '查看库存', code: 'material:inventory:view', type: 'button', path: '', sort: 1, parentCode: 'material:inventory' },
    { name: '编辑库存', code: 'material:inventory:edit', type: 'button', path: '', sort: 2, parentCode: 'material:inventory' },
    { name: '出入库操作', code: 'material:inventory:transact', type: 'button', path: '', sort: 3, parentCode: 'material:inventory' },

    // ---- P1-07 物料批次 / 物料追溯（7 项：2 菜单 + 5 按钮）----
    { name: '物料批次', code: 'material:batch', type: 'menu', path: '/material/batches', sort: 4, parentCode: 'material' },
    { name: '查看批次', code: 'material:batch:view', type: 'button', path: '', sort: 1, parentCode: 'material:batch' },
    { name: '创建批次', code: 'material:batch:create', type: 'button', path: '', sort: 2, parentCode: 'material:batch' },
    { name: '编辑批次', code: 'material:batch:edit', type: 'button', path: '', sort: 3, parentCode: 'material:batch' },
    { name: '删除批次', code: 'material:batch:delete', type: 'button', path: '', sort: 4, parentCode: 'material:batch' },
    { name: '物料追溯', code: 'material:trace', type: 'menu', path: '/material/trace', sort: 5, parentCode: 'material' },
    { name: '查看物料追溯', code: 'material:trace:view', type: 'button', path: '', sort: 1, parentCode: 'material:trace' },

    // ---- P1-08 库存预警（2 项：1 菜单 + 1 按钮）----
    { name: '库存预警', code: 'material:warning', type: 'menu', path: '/material/inventory-warning', sort: 6, parentCode: 'material' },
    { name: '查看库存预警', code: 'material:warning:view', type: 'button', path: '', sort: 1, parentCode: 'material:warning' },

    // ==================== 系统设置 ====================
    { name: '系统设置', code: 'system', type: 'menu', path: '/system/users', sort: 6, parentId: null },
    { name: '用户管理', code: 'system:users', type: 'menu', path: '/system/users', sort: 1, parentCode: 'system' },
    { name: '查看用户', code: 'system:users:view', type: 'button', path: '', sort: 1, parentCode: 'system:users' },
    { name: '创建用户', code: 'system:users:create', type: 'button', path: '', sort: 2, parentCode: 'system:users' },
    { name: '编辑用户', code: 'system:users:edit', type: 'button', path: '', sort: 3, parentCode: 'system:users' },
    { name: '删除用户', code: 'system:users:delete', type: 'button', path: '', sort: 4, parentCode: 'system:users' },
    { name: '启停用户', code: 'system:users:status', type: 'button', path: '', sort: 5, parentCode: 'system:users' },
    { name: '角色权限', code: 'system:roles', type: 'menu', path: '/system/roles', sort: 2, parentCode: 'system' },
    { name: '查看角色', code: 'system:roles:view', type: 'button', path: '', sort: 1, parentCode: 'system:roles' },
    { name: '创建角色', code: 'system:roles:create', type: 'button', path: '', sort: 2, parentCode: 'system:roles' },
    { name: '编辑角色', code: 'system:roles:edit', type: 'button', path: '', sort: 3, parentCode: 'system:roles' },
    { name: '删除角色', code: 'system:roles:delete', type: 'button', path: '', sort: 4, parentCode: 'system:roles' },
    { name: '分配权限', code: 'system:roles:assign', type: 'button', path: '', sort: 5, parentCode: 'system:roles' },
    { name: '系统配置', code: 'system:settings', type: 'menu', path: '/system/settings', sort: 3, parentCode: 'system' },
    { name: '查看配置', code: 'system:settings:view', type: 'button', path: '', sort: 1, parentCode: 'system:settings' },
    { name: '修改配置', code: 'system:settings:edit', type: 'button', path: '', sort: 2, parentCode: 'system:settings' },

    // ==================== 报表中心（P1 新增顶级菜单，7 项：1 顶级 + 2 二级菜单 + 4 按钮）====================
    { name: '报表中心', code: 'reports', type: 'menu', path: '/reports/oee', sort: 7, parentId: null },
    // ---- P1-05 OEE 分析 ----
    { name: 'OEE 分析', code: 'reports:oee', type: 'menu', path: '/reports/oee', sort: 1, parentCode: 'reports' },
    { name: '查看 OEE', code: 'reports:oee:view', type: 'button', path: '', sort: 1, parentCode: 'reports:oee' },
    { name: '导出 OEE', code: 'reports:oee:export', type: 'button', path: '', sort: 2, parentCode: 'reports:oee' },
    // ---- P1-06 生产报表 ----
    { name: '生产报表', code: 'reports:production', type: 'menu', path: '/reports/production', sort: 2, parentCode: 'reports' },
    { name: '查看生产报表', code: 'reports:production:view', type: 'button', path: '', sort: 1, parentCode: 'reports:production' },
    { name: '导出生产报表', code: 'reports:production:export', type: 'button', path: '', sort: 2, parentCode: 'reports:production' },

    // ==================== 人员管理（P1 新增顶级菜单，16 项：1 顶级 + 3 二级菜单 + 12 按钮）====================
    { name: '人员管理', code: 'personnel', type: 'menu', path: '/personnel/schedule', sort: 8, parentId: null },
    // ---- P1-09 班次管理 ----
    { name: '班次管理', code: 'personnel:shift', type: 'menu', path: '/personnel/shifts', sort: 1, parentCode: 'personnel' },
    { name: '查看班次', code: 'personnel:shift:view', type: 'button', path: '', sort: 1, parentCode: 'personnel:shift' },
    { name: '创建班次', code: 'personnel:shift:create', type: 'button', path: '', sort: 2, parentCode: 'personnel:shift' },
    { name: '编辑班次', code: 'personnel:shift:edit', type: 'button', path: '', sort: 3, parentCode: 'personnel:shift' },
    { name: '删除班次', code: 'personnel:shift:delete', type: 'button', path: '', sort: 4, parentCode: 'personnel:shift' },
    // ---- P1-09 人员排班 ----
    { name: '人员排班', code: 'personnel:schedule', type: 'menu', path: '/personnel/schedule', sort: 2, parentCode: 'personnel' },
    { name: '查看排班', code: 'personnel:schedule:view', type: 'button', path: '', sort: 1, parentCode: 'personnel:schedule' },
    { name: '新建排班', code: 'personnel:schedule:create', type: 'button', path: '', sort: 2, parentCode: 'personnel:schedule' },
    { name: '调整排班', code: 'personnel:schedule:edit', type: 'button', path: '', sort: 3, parentCode: 'personnel:schedule' },
    { name: '删除排班', code: 'personnel:schedule:delete', type: 'button', path: '', sort: 4, parentCode: 'personnel:schedule' },
    // ---- P1-10 工时统计 ----
    { name: '工时统计', code: 'personnel:workhours', type: 'menu', path: '/personnel/work-hours', sort: 3, parentCode: 'personnel' },
    { name: '查看工时', code: 'personnel:workhours:view', type: 'button', path: '', sort: 1, parentCode: 'personnel:workhours' },
    { name: '录入工时', code: 'personnel:workhours:create', type: 'button', path: '', sort: 2, parentCode: 'personnel:workhours' },
    { name: '编辑工时', code: 'personnel:workhours:edit', type: 'button', path: '', sort: 3, parentCode: 'personnel:workhours' },
    { name: '导出工时', code: 'personnel:workhours:export', type: 'button', path: '', sort: 4, parentCode: 'personnel:workhours' },
  ];
}

/**
 * 主种子函数
 */
async function main() {
  console.log('========== MES 系统数据种子开始 ==========\n');

  // 1. 创建权限
  console.log('[1/6] 创建权限数据...');
  const permissionDefs = getPermissionDefinitions();
  const permissionMap = {};

  // 先创建顶级权限（parentId 为 null）
  const topLevel = permissionDefs.filter((p) => p.parentId === null);
  for (const def of topLevel) {
    const permission = await prisma.permission.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        type: def.type,
        path: def.path,
        sort: def.sort,
      },
      create: {
        name: def.name,
        code: def.code,
        type: def.type,
        parentId: null,
        path: def.path,
        sort: def.sort,
      },
    });
    permissionMap[def.code] = permission.id;
    console.log(`  - 权限: ${def.code} (ID: ${permission.id})`);
  }

  // 再创建子级权限（parentId 需要引用已创建的父级）
  const childLevel = permissionDefs.filter((p) => p.parentId !== null);
  for (const def of childLevel) {
    const parentId = permissionMap[def.parentCode];

    // 防御：父级必须已创建，否则权限树会断链（parentId 为空会导致菜单不显示）
    if (!parentId) {
      throw new Error(
        `权限定义错误: ${def.code} 的父级 ${def.parentCode} 不存在或未先创建`,
      );
    }

    const permission = await prisma.permission.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        type: def.type,
        parentId: parentId,
        path: def.path,
        sort: def.sort,
      },
      create: {
        name: def.name,
        code: def.code,
        type: def.type,
        parentId: parentId,
        path: def.path,
        sort: def.sort,
      },
    });
    permissionMap[def.code] = permission.id;
  }

  // P1 新增权限统计（便于验收核对 50 项）
  const P1_PERMISSION_CODES = [
    'production:schedule', 'production:schedule:view', 'production:schedule:create',
    'production:schedule:edit', 'production:schedule:delete',
    'equipment:maintenance', 'equipment:maintenance:view', 'equipment:maintenance:create',
    'equipment:maintenance:edit', 'equipment:maintenance:complete', 'equipment:maintenance:delete',
    'equipment:breakdown', 'equipment:breakdown:view', 'equipment:breakdown:create',
    'equipment:breakdown:repair', 'equipment:breakdown:delete',
    'quality:traceability', 'quality:traceability:view',
    'material:batch', 'material:batch:view', 'material:batch:create',
    'material:batch:edit', 'material:batch:delete',
    'material:trace', 'material:trace:view',
    'material:warning', 'material:warning:view',
    'reports', 'reports:oee', 'reports:oee:view', 'reports:oee:export',
    'reports:production', 'reports:production:view', 'reports:production:export',
    'personnel', 'personnel:shift', 'personnel:shift:view', 'personnel:shift:create',
    'personnel:shift:edit', 'personnel:shift:delete',
    'personnel:schedule', 'personnel:schedule:view', 'personnel:schedule:create',
    'personnel:schedule:edit', 'personnel:schedule:delete',
    'personnel:workhours', 'personnel:workhours:view', 'personnel:workhours:create',
    'personnel:workhours:edit', 'personnel:workhours:export',
  ];
  const p1MenuCount = P1_PERMISSION_CODES.filter(
    (code) => permissionDefs.find((p) => p.code === code)?.type === 'menu',
  ).length;
  const p1ButtonCount = P1_PERMISSION_CODES.length - p1MenuCount;
  const missingP1Codes = P1_PERMISSION_CODES.filter((code) => !permissionMap[code]);

  console.log(`  权限总数: ${permissionDefs.length}`);
  console.log(
    `  P1 新增权限: ${P1_PERMISSION_CODES.length} 项（${p1MenuCount} 菜单 + ${p1ButtonCount} 按钮）`,
  );
  if (missingP1Codes.length > 0) {
    throw new Error(`以下 P1 权限未成功入库: ${missingP1Codes.join(', ')}`);
  }

  // 2. 创建角色
  console.log('\n[2/6] 创建角色数据...');
  const adminRole = await prisma.role.upsert({
    where: { code: 'system:admin' },
    update: {
      name: '系统管理员',
      description: '拥有全部权限，可管理所有模块',
      status: true,
    },
    create: {
      name: '系统管理员',
      code: 'system:admin',
      description: '拥有全部权限，可管理所有模块',
      status: true,
    },
  });
  console.log(`  - 角色: ${adminRole.code} (ID: ${adminRole.id})`);

  const operatorRole = await prisma.role.upsert({
    where: { code: 'production:operator' },
    update: {
      name: '生产操作员',
      description: '可查看工单和提交报工',
      status: true,
    },
    create: {
      name: '生产操作员',
      code: 'production:operator',
      description: '可查看工单和提交报工',
      status: true,
    },
  });
  console.log(`  - 角色: ${operatorRole.code} (ID: ${operatorRole.id})`);

  const viewerRole = await prisma.role.upsert({
    where: { code: 'viewer' },
    update: {
      name: '只读用户',
      description: '仅查看权限，不可操作',
      status: true,
    },
    create: {
      name: '只读用户',
      code: 'viewer',
      description: '仅查看权限，不可操作',
      status: true,
    },
  });
  console.log(`  - 角色: ${viewerRole.code} (ID: ${viewerRole.id})\n`);

  // 3. 分配角色权限
  console.log('[3/6] 分配角色权限...');
  const allPermissionIds = Object.values(permissionMap);

  // 系统管理员：全部权限
  for (const permissionId of allPermissionIds) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId,
      },
    });
  }
  console.log(`  - 系统管理员: ${allPermissionIds.length} 个权限`);

  // 生产操作员：看板 + 生产查看/报工 + P1 排程/维保/故障/追溯/排班/工时（PRD §5.9）
  const operatorPermissionCodes = [
    // P0 原有
    'dashboard', 'dashboard:view',
    'production', 'production:order', 'production:order:view', 'production:order:report',
    'equipment', 'equipment:list', 'equipment:list:view',
    // P1 新增（PRD §5.9：排程/维保查看、故障报修与查看、追溯、排班查看、工时录入与查看）
    'production:schedule:view',
    'equipment:maintenance:view',
    'equipment:breakdown:create',
    'equipment:breakdown:view',
    'quality:traceability',
    'quality:traceability:view',
    'personnel:schedule:view',
    'personnel:workhours:create',
    'personnel:workhours:view',
  ];
  for (const code of operatorPermissionCodes) {
    const permissionId = permissionMap[code];
    if (permissionId) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: operatorRole.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: operatorRole.id,
          permissionId,
        },
      });
    }
  }
  console.log(`  - 生产操作员: ${operatorPermissionCodes.length} 个权限`);

  // 只读用户：全部 `*:view` 权限（P0 11 项 + P1 12 项 = 23 项），不含任何 create/edit/delete/export
  // 注：PRD §5.9 文字表述为「19 项」，但按「全部 *:view」口径实际为 23 项，
  //     此处以「全部 *:view」这一可核验口径为准（自动派生，后续新增 view 权限无需改本脚本）。
  const viewerPermissionCodes = permissionDefs
    .filter((p) => p.code.endsWith(':view'))
    .map((p) => p.code);
  const viewerP1Codes = viewerPermissionCodes.filter((code) =>
    P1_PERMISSION_CODES.includes(code),
  );
  for (const code of viewerPermissionCodes) {
    const permissionId = permissionMap[code];
    if (permissionId) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: viewerRole.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: viewerRole.id,
          permissionId,
        },
      });
    }
  }
  console.log(
    `  - 只读用户: ${viewerPermissionCodes.length} 个权限（全部 *:view，其中 P1 新增 ${viewerP1Codes.length} 项）\n`,
  );

  // 4. 创建管理员账号
  console.log('[4/6] 创建管理员账号...');
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash: adminPasswordHash,
      name: '系统管理员',
      department: '信息中心',
      status: true,
    },
    create: {
      username: 'admin',
      passwordHash: adminPasswordHash,
      name: '系统管理员',
      department: '信息中心',
      status: true,
    },
  });
  console.log(`  - 管理员账号: admin / admin123 (ID: ${adminUser.id})`);

  // 创建示例操作员账号
  const operatorPasswordHash = bcrypt.hashSync('operator123', 10);
  const operatorUser = await prisma.user.upsert({
    where: { username: 'operator' },
    update: {
      passwordHash: operatorPasswordHash,
      name: '张操作',
      department: '生产一车间',
      status: true,
    },
    create: {
      username: 'operator',
      passwordHash: operatorPasswordHash,
      name: '张操作',
      department: '生产一车间',
      status: true,
    },
  });
  console.log(`  - 操作员账号: operator / operator123 (ID: ${operatorUser.id})\n`);

  // 5. 关联用户角色
  console.log('[5/6] 关联用户角色...');
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });
  console.log(`  - admin → 系统管理员`);

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: operatorUser.id,
        roleId: operatorRole.id,
      },
    },
    update: {},
    create: {
      userId: operatorUser.id,
      roleId: operatorRole.id,
    },
  });
  console.log(`  - operator → 生产操作员\n`);

  // 6. 创建车间和示例设备
  console.log('[6/6] 创建车间和示例设备...');
  const workshop = await prisma.workshop.upsert({
    where: { code: 'WS-001' },
    update: {
      name: '一号车间',
      description: '主要生产车间，包含机加工和装配产线',
    },
    create: {
      name: '一号车间',
      code: 'WS-001',
      description: '主要生产车间，包含机加工和装配产线',
    },
  });
  console.log(`  - 车间: ${workshop.code} - ${workshop.name} (ID: ${workshop.id})`);

  // 示例设备数据
  const equipmentData = [
    {
      code: 'EQ-001',
      name: '数控车床 A',
      type: '车床',
      location: 'A区-01工位',
      status: 'running',
      manufacturer: '沈阳机床',
      model: 'CK6140',
    },
    {
      code: 'EQ-002',
      name: '立式铣床 B',
      type: '铣床',
      location: 'A区-02工位',
      status: 'idle',
      manufacturer: '济南二机床',
      model: 'X5032',
    },
    {
      code: 'EQ-003',
      name: '注塑机 C',
      type: '注塑机',
      location: 'B区-01工位',
      status: 'running',
      manufacturer: '海天塑机',
      model: 'HTF160X',
    },
    {
      code: 'EQ-004',
      name: '数控加工中心 D',
      type: '加工中心',
      location: 'A区-03工位',
      status: 'stopped',
      manufacturer: '大连机床',
      model: 'VDM-800',
    },
    {
      code: 'EQ-005',
      name: '装配线 E',
      type: '装配线',
      location: 'C区-01工位',
      status: 'running',
      manufacturer: '自研',
      model: 'ASSY-01',
    },
  ];

  for (const eq of equipmentData) {
    const equipment = await prisma.equipment.upsert({
      where: { code: eq.code },
      update: {
        name: eq.name,
        type: eq.type,
        location: eq.location,
        status: eq.status,
        workshopId: workshop.id,
        manufacturer: eq.manufacturer,
        model: eq.model,
      },
      create: {
        code: eq.code,
        name: eq.name,
        type: eq.type,
        location: eq.location,
        status: eq.status,
        workshopId: workshop.id,
        manufacturer: eq.manufacturer,
        model: eq.model,
        purchaseDate: new Date('2024-01-15'),
        remark: '',
      },
    });
    console.log(`  - 设备: ${equipment.code} - ${equipment.name} (${equipment.status})`);
  }

  console.log('\n========== MES 系统数据种子完成 ==========');
  console.log('\n默认账号:');
  console.log('  管理员: admin / admin123');
  console.log('  操作员: operator / operator123');
  console.log('\n请及时修改默认密码！');
}

main()
  .catch((error) => {
    console.error('种子数据执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

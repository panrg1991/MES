/**
 * MES MySQL 初始化脚本静态自检工具
 * ---------------------------------------------------------------------------
 * 用途：在无法直连 MySQL 服务端时，对 database/mes-mysql-init.sql 做静态校验，
 *       确保脚本「可直接导入 MySQL」：
 *   1. 与 backend/prisma/schema.prisma 逐表比对：表数量、表名、字段名、字段数量
 *   2. 全字段比对：类型语义族（允许刻意存在的宽度差异）+ 可空性（严格）
 *   3. 外键校验：被引用的表/列必须存在，且必须在本表之前创建（依赖顺序正确）
 *   4. 约束校验：@unique / @@unique / @@index / @@id 是否在 DDL 中有对应定义
 *   5. INSERT 校验：列必须存在、VALUES 元组的列数必须与列清单数量一致
 *   6. 语法体检：反引号/单引号/括号配对、语句以分号结尾
 *   7. 种子数据数量校验（与 backend/prisma/seed.js 口径一致）
 *   8. 【可选】若环境中存在 node-sql-parser，则对每条语句做 MySQL 方言语法解析
 *
 * 执行：node database/verify-mysql-init.js
 * 退出码：0 = 全部通过；1 = 存在校验失败项
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SQL_PATH = path.join(__dirname, 'mes-mysql-init.sql');
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'backend', 'prisma', 'schema.prisma');
const SEED_PATH = path.join(PROJECT_ROOT, 'backend', 'prisma', 'seed.js');

const results = [];
let failedCount = 0;
let passedCount = 0;

/**
 * 记录一条校验结果
 * @param {boolean} ok 是否通过
 * @param {string} category 校验分类
 * @param {string} message 结果描述
 */
function check(ok, category, message) {
  results.push({ ok, category, message });
  if (ok) {
    passedCount += 1;
  } else {
    failedCount += 1;
  }
}

/**
 * 断言相等
 * @param {number|string} actual 实际值
 * @param {number|string} expected 期望值
 * @param {string} category 校验分类
 * @param {string} label 校验项名称
 */
function assertEqual(actual, expected, category, label) {
  check(
    actual === expected,
    category,
    `${label}：实际 ${actual}，期望 ${expected}`,
  );
}

// ---------------------------------------------------------------------------
// 基础工具：剥离 SQL 注释（不破坏字符串字面量中的 -- ）
// ---------------------------------------------------------------------------

/**
 * 去掉 SQL 中的行注释（-- 开头），保留字符串字面量内容
 * @param {string} sql 原始 SQL 文本
 * @returns {string} 去注释后的 SQL
 */
function stripLineComments(sql) {
  const out = [];
  let inSingle = false;
  let inDouble = false;
  let inBack = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inSingle) {
      out.push(ch);
      if (ch === '\\') {
        out.push(next || '');
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      out.push(ch);
      if (ch === '"' && next !== '"') {
        inDouble = false;
      }
      continue;
    }
    if (inBack) {
      out.push(ch);
      if (ch === '`') {
        inBack = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      out.push(ch);
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out.push(ch);
      continue;
    }
    if (ch === '`') {
      inBack = true;
      out.push(ch);
      continue;
    }
    if (ch === '-' && next === '-') {
      // 跳过该行剩余内容（注释）
      while (i < sql.length && sql[i] !== '\n') {
        i += 1;
      }
      out.push('\n');
      continue;
    }
    out.push(ch);
  }
  return out.join('');
}

/**
 * 按顶层（括号深度 0）逗号切分文本
 * @param {string} text 待切分文本
 * @returns {string[]} 切分后的片段
 */
function splitTopLevel(text, separator = ',') {
  const parts = [];
  let depth = 0;
  let inSingle = false;
  let inBack = false;
  let buf = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inSingle) {
      buf.push(ch);
      if (ch === '\\') {
        buf.push(text[i + 1] || '');
        i += 1;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inBack) {
      buf.push(ch);
      if (ch === '`') {
        inBack = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf.push(ch);
      continue;
    }
    if (ch === '`') {
      inBack = true;
      buf.push(ch);
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(buf.join(''));
      buf = [];
      continue;
    }
    buf.push(ch);
  }
  if (buf.join('').trim().length > 0) {
    parts.push(buf.join(''));
  }
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// 读取输入文件
// ---------------------------------------------------------------------------

const rawSql = fs.readFileSync(SQL_PATH, 'utf8');
const sql = stripLineComments(rawSql);
const schemaText = fs.readFileSync(SCHEMA_PATH, 'utf8');
const seedText = fs.readFileSync(SEED_PATH, 'utf8');

// ---------------------------------------------------------------------------
// 1. 解析 schema.prisma：模型名 → { table, scalars, uniques, indexes, idFields }
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set(['String', 'Int', 'BigInt', 'Boolean', 'DateTime', 'Float', 'Decimal', 'Json', 'Bytes']);

/**
 * 解析 Prisma schema，抽取每个 model 的物理表名与标量字段
 * @param {string} text schema.prisma 全文
 * @returns {Object} { models: {ModelName: {table, scalars:[], ...}}, modelNames: [] }
 */
function parsePrismaSchema(text) {
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  const models = {};
  const modelNames = [];
  let match = modelRegex.exec(text);
  while (match !== null) {
    const modelName = match[1];
    const body = match[2];
    modelNames.push(modelName);
    const mapMatch = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    const table = mapMatch ? mapMatch[1] : modelName;

    const scalars = [];
    const uniqueFields = [];
    const idFields = [];
    const uniqueBlocks = [];
    const indexBlocks = [];

    body.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('///')) return;
      const fieldMatch = trimmed.match(/^(\w+)\s+([A-Za-z]+)(\[\])?(\?)?/);
      if (!fieldMatch) return;
      const [, fieldName, fieldType, isList, isOptional] = fieldMatch;
      if (!SCALAR_TYPES.has(fieldType)) return; // 关系字段（模型类型）不计入列
      if (isList) return; // 列表关系字段不计入列
      // 原生类型注解（如 @db.Decimal(12, 2)）：用于校验 MySQL 侧的类型是否与 schema 对齐
      const nativeMatch = line.match(/@db\.(\w+)(?:\(([^)]*)\))?/);
      scalars.push({
        name: fieldName,
        type: fieldType,
        optional: Boolean(isOptional),
        nativeType: nativeMatch ? nativeMatch[1] : null,
        nativeArgs: nativeMatch && nativeMatch[2] ? nativeMatch[2].replace(/\s/g, '') : null,
      });
      if (line.includes('@unique')) uniqueFields.push(fieldName);
      if (line.includes('@id')) idFields.push(fieldName);
    });

    const uniqBlockRegex = /@@unique\(\[([^\]]+)\]\)/g;
    let ub = uniqBlockRegex.exec(body);
    while (ub !== null) {
      uniqueBlocks.push(ub[1].split(',').map((s) => s.trim()));
      ub = uniqBlockRegex.exec(body);
    }
    const idxBlockRegex = /@@index\(\[([^\]]+)\]\)/g;
    let ib = idxBlockRegex.exec(body);
    while (ib !== null) {
      indexBlocks.push(ib[1].split(',').map((s) => s.trim()));
      ib = idxBlockRegex.exec(body);
    }
    const idBlockMatch = body.match(/@@id\(\[([^\]]+)\]\)/);
    if (idBlockMatch) {
      idBlockMatch[1].split(',').map((s) => s.trim()).forEach((f) => idFields.push(f));
    }

    models[modelName] = { table, scalars, uniqueFields, uniqueBlocks, indexBlocks, idFields };
    match = modelRegex.exec(text);
  }
  return { models, modelNames };
}

const { models: prismaModels, modelNames } = parsePrismaSchema(schemaText);

check(modelNames.length === 27, 'Prisma Schema', `model 数量：${modelNames.length}（期望 27）`);

// ---------------------------------------------------------------------------
// 2. 解析 SQL：CREATE TABLE / 外键 / INSERT
// ---------------------------------------------------------------------------

const createTableRegex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`(\w+)`\s*\(([\s\S]*?)\n\)\s*ENGINE=/g;
const ddlTables = {};
const ddlOrder = [];
let ctMatch = createTableRegex.exec(sql);
while (ctMatch !== null) {
  const tableName = ctMatch[1];
  const body = ctMatch[2];
  ddlOrder.push(tableName);

  const columns = [];
  const foreignKeys = [];
  const uniques = [];
  const keys = [];
  let primaryKey = [];

  splitTopLevel(body).forEach((item) => {
    const upper = item.toUpperCase();
    if (upper.startsWith('PRIMARY KEY')) {
      const inner = item.match(/\(([^)]+)\)/);
      if (inner) {
        primaryKey = inner[1].split(',').map((c) => c.trim().replace(/`/g, ''));
      }
      return;
    }
    if (upper.startsWith('CONSTRAINT') && upper.includes('FOREIGN KEY')) {
      const fkMatch = item.match(
        /CONSTRAINT\s+`(\w+)`\s+FOREIGN\s+KEY\s*\(\s*`(\w+)`\s*\)\s*REFERENCES\s+`(\w+)`\s*\(\s*`(\w+)`\s*\)([\s\S]*)$/i,
      );
      if (fkMatch) {
        foreignKeys.push({
          name: fkMatch[1],
          column: fkMatch[2],
          refTable: fkMatch[3],
          refColumn: fkMatch[4],
          action: (fkMatch[5] || '').replace(/\s+/g, ' ').trim().toUpperCase(),
        });
      }
      return;
    }
    if (upper.startsWith('UNIQUE KEY')) {
      const inner = item.match(/\(([^)]+)\)/);
      if (inner) {
        uniques.push(inner[1].split(',').map((c) => c.trim().replace(/`/g, '')));
      }
      return;
    }
    if (upper.startsWith('KEY')) {
      const inner = item.match(/\(([^)]+)\)/);
      if (inner) {
        keys.push(inner[1].split(',').map((c) => c.trim().replace(/`/g, '')));
      }
      return;
    }
    const colMatch = item.match(/^`(\w+)`\s+([A-Za-z]+(?:\s*\([^)]*\))?)/);
    if (colMatch) {
      columns.push({ name: colMatch[1], definition: item });
      return;
    }
  });

  ddlTables[tableName] = { columns, foreignKeys, uniques, keys, primaryKey };
  ctMatch = createTableRegex.exec(sql);
}

assertEqual(ddlOrder.length, 27, 'DDL 结构', 'CREATE TABLE 数量');

// 2.1 表名与 Prisma @@map 一一对应
const prismaTableNames = Object.values(prismaModels).map((m) => m.table);
prismaTableNames.forEach((t) => {
  check(ddlOrder.includes(t), 'DDL 结构', `Prisma 表 ${t} 在 SQL 中存在`);
});
ddlOrder.forEach((t) => {
  check(prismaTableNames.includes(t), 'DDL 结构', `SQL 表 ${t} 在 Prisma schema 中存在`);
});

// 2.2 逐表字段数量与字段名比对
Object.entries(prismaModels).forEach(([modelName, model]) => {
  const ddl = ddlTables[model.table];
  if (!ddl) return;
  const prismaCols = model.scalars.map((s) => s.name);
  const ddlCols = ddl.columns.map((c) => c.name);
  assertEqual(ddlCols.length, prismaCols.length, '字段比对', `${model.table} 字段数量`);
  const missing = prismaCols.filter((c) => !ddlCols.includes(c));
  const extra = ddlCols.filter((c) => !prismaCols.includes(c));
  check(missing.length === 0, '字段比对', `${model.table} 缺失字段：${missing.join(',') || '无'}`);
  check(extra.length === 0, '字段比对', `${model.table} 多余字段：${extra.join(',') || '无'}`);
});

// 2.3 类型映射抽查
const typeExpectations = [
  ['users', 'status', 'TINYINT(1)'],
  ['users', 'createdAt', 'DATETIME'],
  ['users', 'id', 'BIGINT'],
  ['bom_items', 'quantity', 'DECIMAL(12,2)'],
  ['work_hours_records', 'hours', 'DECIMAL(12,2)'],
  ['inventory', 'safetyStock', 'DECIMAL(12,2)'],
];
typeExpectations.forEach(([table, column, expectedType]) => {
  const ddl = ddlTables[table];
  const col = ddl ? ddl.columns.find((c) => c.name === column) : null;
  const normalized = col ? col.definition.replace(/\s+/g, ' ').trim().toUpperCase() : '';
  const prefix = `\`${column}\` ${expectedType}`.toUpperCase();
  check(
    normalized.startsWith(prefix),
    '类型映射',
    `${table}.${column} 类型为 ${expectedType}（实际：${normalized.slice(0, 40)}）`,
  );
});

// ---------------------------------------------------------------------------
// 2.3.1 全字段「类型语义族 + 可空性」比对（覆盖全部字段，避免抽样盲区）
//
// 背景：早期版本只抽查 6 个字段的类型、且完全不校验可空性，
//       曾导致「schema 为 NOT NULL、SQL 建成 NULL」的 5 处偏差长期未被发现。
// 口径：类型只比语义族（整数/字符串/小数/时间/布尔/JSON），
//       允许刻意存在的宽度差异（BIGINT vs INT、VARCHAR(100) vs VARCHAR(191)）；
//       可空性则严格比对。
// ---------------------------------------------------------------------------

/**
 * 判定 SQL 类型的语义族（宽度差异视为等价）
 * @param {string} sqlType 类型文本
 * @returns {string} 语义族标识
 */
function sqlTypeFamily(sqlType) {
  const t = String(sqlType || '').toUpperCase();
  if (/^TINYINT\(1\)$/.test(t)) return 'BOOLEAN';
  if (/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)/.test(t)) return 'INTEGER';
  if (/^(VARCHAR|CHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT)/.test(t)) return 'STRING';
  if (/^(DECIMAL|NUMERIC)/.test(t)) return 'DECIMAL';
  if (/^(FLOAT|DOUBLE|REAL)/.test(t)) return 'FLOAT';
  if (/^(DATETIME|TIMESTAMP|DATE|TIME)/.test(t)) return 'DATETIME';
  if (/^(JSON|BLOB)/.test(t)) return 'JSON';
  return `OTHER(${t})`;
}

/**
 * 由 Prisma 标量推导其期待的 SQL 语义族（优先采用 @db 原生注解）
 * @param {object} scalar Prisma 标量字段
 * @returns {string} 语义族标识
 */
function prismaFieldFamily(scalar) {
  if (scalar.nativeType) {
    return sqlTypeFamily(scalar.nativeType.toUpperCase());
  }
  const byPrismaType = {
    Int: 'INTEGER',
    BigInt: 'INTEGER',
    String: 'STRING',
    Boolean: 'BOOLEAN',
    DateTime: 'DATETIME',
    Float: 'FLOAT',
    Decimal: 'DECIMAL',
    Json: 'JSON',
  };
  return byPrismaType[scalar.type] || `UNKNOWN(${scalar.type})`;
}

Object.entries(prismaModels).forEach(([modelName, model]) => {
  const ddl = ddlTables[model.table];
  if (!ddl) return;

  model.scalars.forEach((scalar) => {
    const col = ddl.columns.find((c) => c.name === scalar.name);
    if (!col) return;

    const def = col.definition.replace(/\s+/g, ' ').trim().toUpperCase();
    const typeMatch = def.match(/^`[^`]+`\s+([A-Za-z]+(?:\([^)]*\))?)/);
    const actualType = typeMatch ? typeMatch[1] : '';

    const expectedFamily = prismaFieldFamily(scalar);
    const actualFamily = sqlTypeFamily(actualType);
    check(
      expectedFamily === actualFamily,
      '类型比对',
      `${model.table}.${scalar.name} 语义族 ${expectedFamily}（SQL：${actualType || '未识别'} → ${actualFamily}）`,
    );

    const ddlNullable = !/NOT NULL/.test(def);
    check(
      ddlNullable === Boolean(scalar.optional),
      '可空性比对',
      `${model.table}.${scalar.name} 可空性 schema=${scalar.optional ? 'NULL' : 'NOT NULL'} / SQL=${ddlNullable ? 'NULL' : 'NOT NULL'}`,
    );
  });
});

// 2.4 唯一约束 / 复合索引比对
Object.entries(prismaModels).forEach(([modelName, model]) => {
  const ddl = ddlTables[model.table];
  if (!ddl) return;
  model.uniqueFields.forEach((f) => {
    const hit = ddl.uniques.some((u) => u.length === 1 && u[0] === f);
    check(hit, '约束比对', `${model.table} 单列唯一约束 ${f}`);
  });
  model.uniqueBlocks.forEach((fields) => {
    const hit = ddl.uniques.some(
      (u) => u.length === fields.length && fields.every((f) => u.includes(f)),
    );
    check(hit, '约束比对', `${model.table} 复合唯一约束 (${fields.join(',')})`);
  });
  model.indexBlocks.forEach((fields) => {
    const hit = ddl.keys.some(
      (k) => k.length === fields.length && fields.every((f) => k.includes(f)),
    );
    check(hit, '约束比对', `${model.table} 复合索引 (${fields.join(',')})`);
  });
  if (model.idFields.length > 0) {
    const hit =
      model.idFields.every((f) => ddl.primaryKey.includes(f)) &&
      ddl.primaryKey.length === model.idFields.length;
    check(hit, '约束比对', `${model.table} 主键 (${model.idFields.join(',')})`);
  }
});

// 2.5 外键：被引用表/列存在 + 依赖顺序 + 级联策略
const CASCADE_ON_DELETE = {
  'fk_production_reports_workOrderId': 'CASCADE',
  'fk_wosl_workOrderId': 'CASCADE',
  'fk_production_schedules_workOrderId': 'CASCADE',
  'fk_production_schedules_equipmentId': 'SET NULL',
  'fk_esl_equipmentId': 'CASCADE',
  'fk_esl_changedById': 'SET NULL',
  'fk_maintenance_plans_equipmentId': 'CASCADE',
  'fk_maintenance_records_planId': 'SET NULL',
  'fk_maintenance_records_equipmentId': 'CASCADE',
  'fk_maintenance_records_maintainerId': 'SET NULL',
  'fk_breakdown_records_equipmentId': 'CASCADE',
  'fk_breakdown_records_repairerId': 'SET NULL',
  'fk_quality_inspections_workOrderId': 'CASCADE',
  'fk_quality_inspections_inspectorId': 'SET NULL',
  'fk_inspection_items_inspectionId': 'CASCADE',
  'fk_defect_records_workOrderId': 'CASCADE',
  'fk_defect_records_equipmentId': 'SET NULL',
  'fk_defect_records_handledBy': 'SET NULL',
  'fk_bom_items_bomId': 'CASCADE',
  'fk_bom_items_materialId': 'CASCADE',
  'fk_inventory_materialId': 'CASCADE',
  'fk_inventory_transactions_materialId': 'CASCADE',
  'fk_inventory_transactions_operatorId': 'SET NULL',
  'fk_material_batches_materialId': 'CASCADE',
  'fk_personnel_schedules_userId': 'CASCADE',
  'fk_personnel_schedules_shiftId': 'CASCADE',
  'fk_work_hours_records_userId': 'SET NULL',
  'fk_work_hours_records_workOrderId': 'CASCADE',
  'fk_work_hours_records_shiftId': 'SET NULL',
  'fk_user_roles_userId': 'CASCADE',
  'fk_user_roles_roleId': 'CASCADE',
  'fk_role_permissions_roleId': 'CASCADE',
  'fk_role_permissions_permissionId': 'CASCADE',
  'fk_work_orders_workshopId': 'SET NULL',
  'fk_equipment_workshopId': 'SET NULL',
  'fk_production_reports_operatorId': 'SET NULL',
  'fk_permissions_parentId': 'SET NULL',
};

let fkTotal = 0;
Object.entries(ddlTables).forEach(([tableName, ddl]) => {
  ddl.foreignKeys.forEach((fk) => {
    fkTotal += 1;
    const refTable = ddlTables[fk.refTable];
    check(Boolean(refTable), '外键校验', `${tableName}.${fk.column} → ${fk.refTable} 被引用表存在`);
    if (refTable) {
      check(
        refTable.columns.some((c) => c.name === fk.refColumn),
        '外键校验',
        `${tableName}.${fk.column} → ${fk.refTable}.${fk.refColumn} 被引用列存在`,
      );
    }
    check(
      ddl.columns.some((c) => c.name === fk.column),
      '外键校验',
      `${tableName} 外键列 ${fk.column} 在本表中存在`,
    );
    // 依赖顺序：被引用的表必须先创建（自引用除外）
    if (fk.refTable !== tableName) {
      check(
        ddlOrder.indexOf(fk.refTable) < ddlOrder.indexOf(tableName),
        '外键校验',
        `${fk.refTable} 先于 ${tableName} 创建（依赖顺序）`,
      );
    }
    const expectedAction = CASCADE_ON_DELETE[fk.name];
    if (expectedAction) {
      check(
        fk.action.includes(`ON DELETE ${expectedAction}`),
        '外键校验',
        `${fk.name} ON DELETE ${expectedAction}`,
      );
    }
  });
});
check(fkTotal > 0, '外键校验', `外键总数：${fkTotal} 条`);
Object.keys(CASCADE_ON_DELETE).forEach((name) => {
  const exists = Object.values(ddlTables).some((t) => t.foreignKeys.some((f) => f.name === name));
  check(exists, '外键校验', `外键 ${name} 已覆盖`);
});

// ---------------------------------------------------------------------------
// 3. INSERT 语句校验
// ---------------------------------------------------------------------------

const insertValuesRegex = /INSERT\s+IGNORE\s+INTO\s+`(\w+)`\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi;
const insertStats = {};
let insMatch = insertValuesRegex.exec(sql);
while (insMatch !== null) {
  const table = insMatch[1];
  const colList = insMatch[2].split(',').map((c) => c.trim().replace(/`/g, ''));
  const valuesBody = insMatch[3];
  const ddl = ddlTables[table];
  check(Boolean(ddl), 'INSERT 校验', `${table} 插入目标表存在`);
  if (ddl) {
    colList.forEach((c) => {
      check(
        ddl.columns.some((col) => col.name === c),
        'INSERT 校验',
        `${table} 插入列 ${c} 在表定义中存在`,
      );
    });
  }
  const tuples = [];
  let depth = 0;
  let buf = [];
  let inSingle = false;
  for (let i = 0; i < valuesBody.length; i += 1) {
    const ch = valuesBody[i];
    if (inSingle) {
      buf.push(ch);
      if (ch === '\\') {
        buf.push(valuesBody[i + 1] || '');
        i += 1;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf.push(ch);
      continue;
    }
    if (ch === '(') {
      depth += 1;
      if (depth === 1) {
        buf = [];
        continue;
      }
    }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        tuples.push(buf.join(''));
        buf = [];
        continue;
      }
    }
    if (depth > 0) buf.push(ch);
  }
  let badTuple = 0;
  tuples.forEach((t, idx) => {
    const count = splitTopLevel(t).length;
    if (count !== colList.length) {
      badTuple += 1;
      check(false, 'INSERT 校验', `${table} 第 ${idx + 1} 行值数量 ${count} != 列数 ${colList.length}`);
    }
  });
  check(badTuple === 0, 'INSERT 校验', `${table} 共 ${tuples.length} 行，列数全部匹配（${colList.length} 列）`);
  insertStats[table] = (insertStats[table] || 0) + tuples.length;
  insMatch = insertValuesRegex.exec(sql);
}

assertEqual(insertStats['permissions'] || 0, 109, '种子数据', 'permissions 插入行数');
assertEqual(insertStats['roles'] || 0, 3, '种子数据', 'roles 插入行数');
assertEqual(insertStats['users'] || 0, 2, '种子数据', 'users 插入行数');
assertEqual(insertStats['workshops'] || 0, 1, '种子数据', 'workshops 插入行数');
assertEqual(insertStats['equipment'] || 0, 5, '种子数据', 'equipment 插入行数');

// INSERT ... SELECT 语句存在性
['role_permissions', 'user_roles'].forEach((table) => {
  const re = new RegExp(`INSERT\\s+IGNORE\\s+INTO\\s+\`${table}\`\\s*\\([^)]*\\)\\s*SELECT`, 'i');
  check(re.test(sql), 'INSERT 校验', `${table} 使用 INSERT ... SELECT 关联插入`);
});

// ---------------------------------------------------------------------------
// 4. 与 seed.js 交叉核对
// ---------------------------------------------------------------------------

// 仅取 getPermissionDefinitions() 函数体内的权限编码，避免把角色/车间/设备编码算进来
const defStart = seedText.indexOf('function getPermissionDefinitions()');
const defEnd = seedText.indexOf('async function main()');
const permissionDefBody = defStart >= 0 && defEnd > defStart ? seedText.slice(defStart, defEnd) : '';
const seedPermissionCodes = [...permissionDefBody.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]);
const sqlPermissionCodes = [...rawSql.matchAll(/^\s+\('([^']+)',\s*'([a-z:]+)',\s*'(menu|button)'/gm)].map((m) => m[2]);
assertEqual(sqlPermissionCodes.length, 109, '种子数据', 'SQL 中解析出的权限条目数');
assertEqual(seedPermissionCodes.length, sqlPermissionCodes.length, '种子数据', 'seed.js 权限数与 SQL 权限数一致');
const seedSet = new Set(seedPermissionCodes);
const sqlSet = new Set(sqlPermissionCodes);
const onlyInSeed = seedPermissionCodes.filter((c) => !sqlSet.has(c));
const onlyInSql = sqlPermissionCodes.filter((c) => !seedSet.has(c));
check(onlyInSeed.length === 0, '种子数据', `仅存在于 seed.js 的权限：${onlyInSeed.join(',') || '无'}`);
check(onlyInSql.length === 0, '种子数据', `仅存在于 SQL 的权限：${onlyInSql.join(',') || '无'}`);

// 父子关系映射条目数 = 101（109 - 8 个顶级）：只统计 UPDATE 映射块内的 SELECT
const mappingStart = rawSql.indexOf('UPDATE `permissions` AS `p`');
const mappingEnd = rawSql.indexOf('SET `p`.`parentId`');
const mappingBody = mappingStart >= 0 && mappingEnd > mappingStart ? rawSql.slice(mappingStart, mappingEnd) : '';
const mappingCount = (mappingBody.match(/SELECT\s+'/g) || []).length;
assertEqual(mappingCount, 101, '种子数据', '权限父子映射条目数');

// 角色 / 用户 / 车间 / 设备编码
['system:admin', 'production:operator', 'viewer'].forEach((code) => {
  check(rawSql.includes(`'${code}'`), '种子数据', `角色 ${code} 已写入`);
});
['admin', 'operator'].forEach((u) => {
  check(new RegExp(`\\('${u}',\\s*'\\$2[aby]\\$`).test(rawSql), '种子数据', `用户 ${u} 使用 bcrypt 哈希`);
});
['WS-001', 'EQ-001', 'EQ-002', 'EQ-003', 'EQ-004', 'EQ-005'].forEach((code) => {
  check(rawSql.includes(`'${code}'`), '种子数据', `编码 ${code} 已写入`);
});

// bcrypt 哈希可校验（若本地存在 bcryptjs）
try {
  const bcrypt = require(path.join(PROJECT_ROOT, 'backend', 'node_modules', 'bcryptjs'));
  const adminHash = (rawSql.match(/\('admin',\s*'(\$2[aby]\$\d\d\$[^']+)'/) || [])[1];
  const operatorHash = (rawSql.match(/\('operator',\s*'(\$2[aby]\$\d\d\$[^']+)'/) || [])[1];
  check(Boolean(adminHash) && bcrypt.compareSync('admin123', adminHash), '密码校验', 'admin / admin123 哈希可校验通过');
  check(
    Boolean(operatorHash) && bcrypt.compareSync('operator123', operatorHash),
    '密码校验',
    'operator / operator123 哈希可校验通过',
  );
} catch (error) {
  check(false, '密码校验', `跳过（未找到 bcryptjs）：${error.message}`);
}

// ---------------------------------------------------------------------------
// 5. 语法体检：引号 / 括号 / 分号
// ---------------------------------------------------------------------------

const backtickCount = (sql.match(/`/g) || []).length;
check(backtickCount % 2 === 0, '语法体检', `反引号成对（共 ${backtickCount} 个）`);
const parenBalance = sql.split('').reduce((acc, ch) => acc + (ch === '(' ? 1 : ch === ')' ? -1 : 0), 0);
assertEqual(parenBalance, 0, '语法体检', '括号配对平衡值');
const singleQuoteCount = (sql.match(/'/g) || []).length;
check(singleQuoteCount % 2 === 0, '语法体检', `单引号成对（共 ${singleQuoteCount} 个）`);

// 语句切分：每个以分号结尾的语句非空
const statements = splitTopLevel(sql, ';').filter((s) => s.trim().length > 0);
check(statements.length > 0, '语法体检', `可切分语句数：${statements.length}`);
const suspicious = statements.filter((s) => !/^\s*(SET|CREATE|USE|INSERT|UPDATE|SELECT|DROP|--)/i.test(s));
check(suspicious.length === 0, '语法体检', `无异常语句开头：${suspicious.length}`);

// 末尾校验段存在
check(/9\.\s*导入校验/.test(rawSql), '语法体检', '文末包含导入校验 SQL');
check(/空表说明/.test(rawSql), '语法体检', '文末包含空表说明');

// ---------------------------------------------------------------------------
// 6. 可选：node-sql-parser 语法解析（如环境已安装）
// ---------------------------------------------------------------------------

let parser = undefined;
let parserSummary = '未执行';
const parserCandidates = [
  path.join('C:', 'Users', 'panrg', '.tmp-sqlcheck', 'node_modules', 'node-sql-parser'),
  'node-sql-parser',
];
for (const candidate of parserCandidates) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    parser = require(candidate);
    break;
  } catch (error) {
    parser = undefined;
  }
}

if (parser) {
  const Parser = parser.Parser;
  const sqlParser = new Parser();
  let parseOk = 0;
  const parseErrors = [];
  statements.forEach((stmt) => {
    const text = stmt.trim();
    if (/^SET\s+/i.test(text) && !/SELECT/i.test(text)) {
      parseOk += 1;
      return; // node-sql-parser 对 SET SESSION 支持有限，跳过
    }
    try {
      sqlParser.astify(`${text};`, { database: 'MySQL' });
      parseOk += 1;
    } catch (error) {
      parseErrors.push(`${text.slice(0, 60).replace(/\n/g, ' ')}... → ${error.message.split('\n')[0]}`);
    }
  });
  check(
    parseErrors.length === 0,
    'SQL 语法解析',
    `node-sql-parser 解析通过 ${parseOk}/${statements.length} 条语句${parseErrors.length ? `；失败：${parseErrors.slice(0, 5).join(' | ')}` : ''}`,
  );
  parserSummary = `node-sql-parser（MySQL 方言）解析通过 ${parseOk}/${statements.length} 条语句`;
} else {
  check(true, 'SQL 语法解析', '未安装 node-sql-parser，已跳过 AST 解析（其余静态校验仍然执行）');
  parserSummary = '未安装 node-sql-parser，未执行 AST 解析（已跳过）';
}

// ---------------------------------------------------------------------------
// 输出报告
// ---------------------------------------------------------------------------

const reportLines = [];
reportLines.push('========== MySQL 初始化脚本静态自检报告 ==========');
reportLines.push(`SQL 文件：${SQL_PATH}`);
reportLines.push(`行数：${rawSql.split('\n').length} 行，字符数：${rawSql.length}`);
reportLines.push(`DDL 表数量：${ddlOrder.length}`);
reportLines.push(`外键数量：${fkTotal}`);
reportLines.push(`INSERT 行数统计：${JSON.stringify(insertStats)}`);
reportLines.push(`SQL 解析器：${parserSummary}`);
reportLines.push('');

const grouped = {};
results.forEach((r) => {
  if (!grouped[r.category]) grouped[r.category] = [];
  grouped[r.category].push(r);
});
Object.entries(grouped).forEach(([category, items]) => {
  const failed = items.filter((i) => !i.ok);
  reportLines.push(`【${category}】共 ${items.length} 项，失败 ${failed.length} 项`);
  items.forEach((i) => {
    if (!i.ok) reportLines.push(`  [FAIL] ${i.message}`);
  });
  reportLines.push('');
});

reportLines.push(`总计：${passedCount + failedCount} 项断言，通过 ${passedCount} 项，失败 ${failedCount} 项`);
reportLines.push(`VALIDATION_IS_PASS: ${failedCount === 0 ? 'YES' : 'NO'}`);

const reportText = reportLines.join('\n');
fs.writeFileSync(path.join(__dirname, '.verify-mysql-init-report.txt'), reportText, 'utf8');
process.stdout.write(`${reportText}\n`);
process.exit(failedCount === 0 ? 0 : 1);

/**
 * MES 系统 - Zod 校验空值兼容工具【P1 BugFix 新增】
 *
 * 背景：前端筛选栏清空时会发出空串参数（如 `?equipmentId=&status=`），
 * 部分接口还会显式传 null 表示「未指定」。直接用 z.coerce / z.enum 会把
 * 空串 / null 当作非法值返回 400，导致页面普遍报「参数校验失败」。
 *
 * 统一口径：**空串 '' / null / 'null' / 'undefined' 一律视为「未传」**，
 * 由各 optional 工具在预处理阶段短路，可选字段直接按 undefined 处理。
 * 全部 validator 的可选 query 字段与可空 body 外键应复用本文件工具。
 */

const { z } = require('zod');

/**
 * 空值预处理：'' / null / 'null' / 'undefined' → undefined（视为未传）
 * 导出供 validator 内联组合使用（如带 default 的数字查询参数）
 * @param {unknown} value - 原始值
 * @returns {unknown} 规整后的值
 */
function emptyToUndefined(value) {
  if (value === '' || value === null || value === 'null' || value === 'undefined') {
    return undefined;
  }
  return value;
}

/**
 * 可选数字 ID 查询参数：支持空串/null，'123' → 123
 * @returns {z.ZodSchema} z.coerce.number().int().positive().optional() 的空值安全版
 */
function optionalQueryId() {
  return z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  );
}

/**
 * 可选枚举查询参数：支持空串/null
 * @param {readonly string[]} values - 枚举值列表
 * @returns {z.ZodSchema} z.enum(values).optional() 的空值安全版
 */
function optionalQueryEnum(values) {
  return z.preprocess(emptyToUndefined, z.enum(values).optional());
}

/**
 * 可选字符串查询参数：支持空串/null（注意：空串视为未传，而非合法空值）
 * @returns {z.ZodSchema} z.string().optional() 的空值安全版
 */
function optionalQueryString() {
  return z.preprocess(emptyToUndefined, z.string().optional());
}

/**
 * 可选日期查询参数：支持空串/null（z.coerce.date() 会把 null 转成 epoch，必须先行短路）
 * @returns {z.ZodSchema} z.coerce.date().optional() 的空值安全版
 */
function optionalQueryDate() {
  return z.preprocess(emptyToUndefined, z.coerce.date().optional());
}

/**
 * 可选布尔查询参数：仅接受 'true'/'false'（true/false），避免 z.coerce.boolean 把 'false' 变 true
 * @returns {z.ZodSchema} z.boolean().optional() 的空值安全版
 */
function optionalQueryBoolean() {
  return z.preprocess((value) => {
    const normalized = emptyToUndefined(value);
    if (normalized === 'true' || normalized === true) {
      return true;
    }
    if (normalized === 'false' || normalized === false) {
      return false;
    }
    return normalized;
  }, z.boolean().optional());
}

/**
 * 分页查询参数片段（展开进 z.object）：
 * page 默认 1、pageSize 默认 defaultPageSize，均支持空串/null 视为未传
 * @param {object} [options]
 * @param {number} [options.defaultPageSize=20] - pageSize 默认值
 * @param {number} [options.maxPageSize=500] - pageSize 上限（P1 BugFix 由 100 放宽到 500，
 *   兼容前端下拉选项查询 pageSize=200）
 * @returns {{page: z.ZodSchema, pageSize: z.ZodSchema}} 展开到 z.object 的字段片段
 */
function paginationQuery({ defaultPageSize = 20, maxPageSize = 500 } = {}) {
  return {
    page: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).default(1),
    ),
    pageSize: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
    ),
  };
}

module.exports = {
  emptyToUndefined,
  optionalQueryId,
  optionalQueryEnum,
  optionalQueryString,
  optionalQueryDate,
  optionalQueryBoolean,
  paginationQuery,
};

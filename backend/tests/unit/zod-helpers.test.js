/**
 * 单元测试：src/utils/zod-helpers.js
 * ---------------------------------------------------------------------------
 * 这是全站查询参数校验的公共底座，历史 Bug 都出在「空串/null 被当作非法值」上，
 * 因此重点覆盖空值兼容性与边界值。
 */

const { z } = require('zod');
const {
  emptyToUndefined,
  optionalQueryId,
  optionalQueryEnum,
  optionalQueryString,
  optionalQueryDate,
  optionalQueryBoolean,
  paginationQuery,
} = require('../../src/utils/zod-helpers');

/** 校验单个 schema 的解析结果 */
const parse = (schema, value) => schema.safeParse(value);

describe('emptyToUndefined - 空值归一化', () => {
  test.each([
    ['空串', ''],
    ['null', null],
    ['字符串 null', 'null'],
    ['字符串 undefined', 'undefined'],
  ])('%s 视为未传（undefined）', (_label, input) => {
    expect(emptyToUndefined(input)).toBeUndefined();
  });

  test.each([
    ['数字 0', 0],
    ['字符串 0', '0'],
    ['false', false],
    ['普通字符串', 'abc'],
  ])('%s 保留原值', (_label, input) => {
    expect(emptyToUndefined(input)).toBe(input);
  });

  test('undefined 保持 undefined', () => {
    expect(emptyToUndefined(undefined)).toBeUndefined();
  });
});

describe('optionalQueryId - 可选数字 ID', () => {
  test('空串与 null 视为未传', () => {
    expect(parse(optionalQueryId(), '').data).toBeUndefined();
    expect(parse(optionalQueryId(), null).data).toBeUndefined();
  });

  test('数字字符串转为数字', () => {
    expect(parse(optionalQueryId(), '123').data).toBe(123);
    expect(parse(optionalQueryId(), 45).data).toBe(45);
  });

  test('非正整数被拒绝', () => {
    expect(parse(optionalQueryId(), '0').success).toBe(false);
    expect(parse(optionalQueryId(), '-5').success).toBe(false);
    expect(parse(optionalQueryId(), 'abc').success).toBe(false);
    expect(parse(optionalQueryId(), '1.5').success).toBe(false);
  });
});

describe('optionalQueryEnum - 可选枚举', () => {
  const schema = () => optionalQueryEnum(['pending', 'completed']);

  test('空串视为未传', () => {
    expect(parse(schema(), '').data).toBeUndefined();
  });

  test('合法枚举值通过', () => {
    expect(parse(schema(), 'pending').data).toBe('pending');
  });

  test('非法枚举值被拒绝', () => {
    expect(parse(schema(), 'unknown').success).toBe(false);
  });
});

describe('optionalQueryString - 可选字符串', () => {
  test('空串视为未传而非空字符串', () => {
    expect(parse(optionalQueryString(), '').data).toBeUndefined();
  });

  test('正常字符串保留', () => {
    expect(parse(optionalQueryString(), '关键词').data).toBe('关键词');
  });
});

describe('optionalQueryDate - 可选日期', () => {
  test('空串视为未传（不产生 epoch 时间）', () => {
    expect(parse(optionalQueryDate(), '').data).toBeUndefined();
    expect(parse(optionalQueryDate(), null).data).toBeUndefined();
  });

  test('日期字符串解析为 Date', () => {
    const result = parse(optionalQueryDate(), '2026-09-17');
    expect(result.success).toBe(true);
    expect(result.data).toBeInstanceOf(Date);
  });

  test('非法日期被拒绝', () => {
    expect(parse(optionalQueryDate(), 'not-a-date').success).toBe(false);
  });
});

describe('optionalQueryBoolean - 可选布尔', () => {
  test("'true' / 'false' 正确转换（不被 coerce 误判）", () => {
    expect(parse(optionalQueryBoolean(), 'true').data).toBe(true);
    expect(parse(optionalQueryBoolean(), 'false').data).toBe(false);
  });

  test('空值视为未传', () => {
    expect(parse(optionalQueryBoolean(), '').data).toBeUndefined();
    expect(parse(optionalQueryBoolean(), null).data).toBeUndefined();
  });

  test('其他字符串被拒绝（避免 "yes"/"1" 之类歧义输入）', () => {
    expect(parse(optionalQueryBoolean(), 'yes').success).toBe(false);
    expect(parse(optionalQueryBoolean(), '1').success).toBe(false);
  });
});

describe('paginationQuery - 分页参数', () => {
  const pageSchema = () => z.object(paginationQuery());

  test('未传时使用默认值 page=1 / pageSize=20', () => {
    const result = parse(pageSchema(), {});
    expect(result.data.page).toBe(1);
    expect(result.data.pageSize).toBe(20);
  });

  test('空串视同未传并使用默认值（前端筛选栏清空的典型场景）', () => {
    const result = parse(pageSchema(), { page: '', pageSize: '' });
    expect(result.data.page).toBe(1);
    expect(result.data.pageSize).toBe(20);
  });

  test('传入数字字符串正确转换', () => {
    const result = parse(pageSchema(), { page: '3', pageSize: '50' });
    expect(result.data.page).toBe(3);
    expect(result.data.pageSize).toBe(50);
  });

  test('pageSize 支持到上限 500（兼容下拉选项查询）', () => {
    expect(parse(pageSchema(), { pageSize: '500' }).success).toBe(true);
    expect(parse(pageSchema(), { pageSize: '501' }).success).toBe(false);
  });

  test('page 与 pageSize 必须为正整数', () => {
    expect(parse(pageSchema(), { page: '0' }).success).toBe(false);
    expect(parse(pageSchema(), { pageSize: '0' }).success).toBe(false);
    expect(parse(pageSchema(), { page: 'abc' }).success).toBe(false);
  });

  test('可自定义默认每页条数与上限', () => {
    const custom = z.object(paginationQuery({ defaultPageSize: 10, maxPageSize: 100 }));
    expect(parse(custom, {}).data.pageSize).toBe(10);
    expect(parse(custom, { pageSize: '100' }).success).toBe(true);
    expect(parse(custom, { pageSize: '101' }).success).toBe(false);
  });
});

/**
 * MES 系统 - Excel 导出工具封装（基于 exceljs）
 *
 * 设计目标（架构文档 §8.4 导出接口约定）：
 *  ① 表头中文、首行冻结、数值列右对齐、日期列 'YYYY-MM-DD HH:mm'
 *  ② 单次导出 ≤ 10000 行，超限抛出 400（通过 errorHandler 统一返回 JSON）
 *  ③ 成功响应直接写二进制流，不套 { code, data, message } 包装
 *  ④ 中文文件名统一使用 `filename*=UTF-8''<encodeURIComponent(name)>`，避免乱码
 *
 * 使用示例（report.controller.js）：
 *   const { setDownloadHeaders } = require('../utils/excel');
 *   const buffer = await reportService.buildWorkbookBuffer(sheets);
 *   setDownloadHeaders(res, '生产日报_20260819.xlsx');
 *   res.status(200).send(buffer);
 */

const ExcelJS = require('exceljs');
const { PassThrough } = require('stream');

/** 单次导出最大行数（超出返回 400，防止内存溢出） */
const MAX_EXPORT_ROWS = 10000;

/** xlsx MIME 类型 */
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 默认日期格式（Excel numFmt） */
const DEFAULT_DATE_FORMAT = 'yyyy-mm-dd hh:mm';

/** 默认表头样式 */
const HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1677FF' } },
  alignment: { vertical: 'middle', horizontal: 'center' },
};

/**
 * 构造业务异常（供 errorHandler 统一处理）
 * @param {string} message - 错误信息
 * @param {number} statusCode - HTTP 状态码
 * @returns {Error} 带 statusCode 的 Error 实例
 */
function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * 校验导出行数上限
 * @param {number} rowCount - 实际行数
 * @param {number} [limit] - 上限（默认 10000）
 * @throws {Error} 超出上限时抛出 400 错误
 */
function assertRowLimit(rowCount, limit = MAX_EXPORT_ROWS) {
  if (rowCount > limit) {
    throw createHttpError(
      `导出数据量 ${rowCount} 行超出单次上限 ${limit} 行，请收窄查询时间范围后重试`,
      400,
    );
  }
}

/**
 * 标准化列定义
 * @param {Array<object>} columns - 列定义数组
 * @param {string} columns[].header - 表头（中文）
 * @param {string} columns[].key - 数据字段名
 * @param {number} [columns[].width] - 列宽（默认 16）
 * @param {'text'|'number'|'date'} [columns[].type] - 值类型（默认 text）
 * @param {'left'|'center'|'right'} [columns[].align] - 对齐方式（number 默认 right，其余 center 之外默认 left）
 * @returns {Array<object>} exceljs 列配置数组
 */
function normalizeColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw createHttpError('导出列定义不能为空', 400);
  }

  return columns.map((column) => {
    const type = column.type || 'text';
    const defaultAlign = type === 'number' ? 'right' : 'left';

    return {
      header: column.header,
      key: column.key,
      width: column.width || 16,
      type,
      align: column.align || defaultAlign,
    };
  });
}

/**
 * 将原始值归一化为单元格可写入的值
 * @param {unknown} value - 原始值
 * @param {object} column - 标准化后的列定义
 * @returns {string|number|Date} 单元格值
 */
function normalizeCellValue(value, column) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (column.type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? num : '';
  }

  if (column.type === 'date') {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date;
  }

  return String(value);
}

/**
 * 创建流式工作簿写入器
 * 【设计说明】exceljs 的 WorkbookWriter 以流式方式写出，内存占用与行数无关；
 * 这里将输出接入 PassThrough 并在结束时聚合成 Buffer，兼顾「流式写入」与
 * 「统一 Buffer 响应」两种消费方式（report.service 需要先算行数再决定响应）。
 * @returns {{ workbook: object, toBuffer: () => Promise<Buffer> }} 工作簿与取 Buffer 方法
 */
function createWorkbookWriter() {
  const chunks = [];
  const passthrough = new PassThrough();

  passthrough.on('data', (chunk) => chunks.push(chunk));

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: passthrough,
    useStyles: true,
    // 共享字符串表在流式写入下不被支持，关闭以避免告警
    useSharedStrings: false,
  });

  const toBuffer = new Promise((resolve, reject) => {
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
  });

  return {
    workbook,
    toBuffer: () => toBuffer,
  };
}

/**
 * 向工作簿写入一个数据表（Sheet）
 *
 * 【实现说明】exceljs 在 `sheet.columns = [{ header }]` 时会**自动把表头写在第 1 行**，
 * 与「可选标题行」冲突；因此这里只使用 columns 的 key/width，表头行由本函数显式写出，
 * 保证「标题行 + 表头行 + 数据行」的行号确定可控。
 *
 * 样式落点说明：xlsx 格式不支持「列级对齐/格式」，只支持单元格级样式，
 * 因此数值右对齐与日期格式均按**单元格**写入，导出后打开 Excel 即为所见效果。
 *
 * @param {object} workbook - exceljs 工作簿（流式或普通）
 * @param {object} options - 表单配置
 * @param {string} options.sheetName - 表单名称（默认 Sheet1）
 * @param {Array<object>} options.columns - 列定义（见 normalizeColumns）
 * @param {Array<object>} options.rows - 数据行
 * @param {string} [options.title] - 可选标题行（合并首行，居中加粗）
 * @param {boolean} [options.freezeHeader] - 是否冻结表头（默认 true，有标题时冻结前两行）
 * @param {boolean} [options.autoFilter] - 是否对表头开启自动筛选（默认 true）
 * @returns {object} exceljs Worksheet
 */
function writeSheet(workbook, options) {
  const {
    sheetName = 'Sheet1',
    columns,
    rows = [],
    title,
    freezeHeader = true,
    autoFilter = true,
  } = options || {};

  const normalizedColumns = normalizeColumns(columns);
  const headerRowNumber = title ? 2 : 1;

  // 冻结表头（有标题时同时冻结标题行）
  const sheet = workbook.addWorksheet(sheetName, {
    views: freezeHeader
      ? [{ state: 'frozen', ySplit: headerRowNumber }]
      : [],
  });

  // 仅声明列宽与 key（不声明 header，避免 exceljs 自动生成表头行）
  sheet.columns = normalizedColumns.map((column) => ({
    key: column.key,
    width: column.width,
  }));

  // 可选标题行
  if (title) {
    const titleRow = sheet.addRow([title]);
    titleRow.height = 24;
    titleRow.font = { bold: true, size: 14 };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.mergeCells(titleRow.number, 1, titleRow.number, normalizedColumns.length);
    titleRow.commit();
  }

  // 表头行
  const headerRow = sheet.addRow(normalizedColumns.map((column) => column.header));
  normalizedColumns.forEach((_column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.font = HEADER_STYLE.font;
    cell.fill = HEADER_STYLE.fill;
    cell.alignment = HEADER_STYLE.alignment;
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
  });
  headerRow.height = 20;
  headerRow.commit();

  // 数据行（逐单元格写入对齐方式与日期/数值格式）
  for (const row of rows) {
    const values = normalizedColumns.map((column) =>
      normalizeCellValue(row[column.key], column),
    );
    const dataRow = sheet.addRow(values);

    normalizedColumns.forEach((column, index) => {
      const cell = dataRow.getCell(index + 1);
      cell.alignment = { vertical: 'middle', horizontal: column.align };
      if (column.type === 'date') {
        cell.numFmt = DEFAULT_DATE_FORMAT;
      }
    });

    dataRow.commit();
  }

  // 表头自动筛选
  if (autoFilter) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: normalizedColumns.length },
    };
  }

  if (typeof sheet.commit === 'function') {
    sheet.commit();
  }

  return sheet;
}

/**
 * 设置 Excel 下载响应头（中文文件名不乱码）
 * @param {object} res - Express Response 对象
 * @param {string} filename - 文件名（可含中文）
 * @returns {void}
 */
function setDownloadHeaders(res, filename) {
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  // 允许前端拦截器读取文件名
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
}

module.exports = {
  MAX_EXPORT_ROWS,
  XLSX_CONTENT_TYPE,
  DEFAULT_DATE_FORMAT,
  createHttpError,
  assertRowLimit,
  createWorkbookWriter,
  writeSheet,
  setDownloadHeaders,
};

/**
 * MES 系统 - 请求参数校验中间件
 * 基于 Zod Schema 校验 body / query / params
 */

/**
 * 创建校验中间件
 * @param {object} schemas - Zod Schema 对象
 * @param {object} schemas.body - 请求体校验 Schema
 * @param {object} schemas.query - 查询参数校验 Schema
 * @param {object} schemas.params - 路由参数校验 Schema
 * @returns {function} Express 中间件
 */
function validate({ body, query, params }) {
  return (req, res, next) => {
    try {
      // 校验请求体
      if (body) {
        const result = body.safeParse(req.body);
        if (!result.success) {
          const errors = result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          }));
          return res.status(400).json({
            code: 400,
            data: null,
            message: '参数校验失败',
            errors,
          });
        }
        req.body = result.data;
      }

      // 校验查询参数
      if (query) {
        const result = query.safeParse(req.query);
        if (!result.success) {
          const errors = result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          }));
          return res.status(400).json({
            code: 400,
            data: null,
            message: '参数校验失败',
            errors,
          });
        }
        req.query = result.data;
      }

      // 校验路由参数
      if (params) {
        const result = params.safeParse(req.params);
        if (!result.success) {
          const errors = result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          }));
          return res.status(400).json({
            code: 400,
            data: null,
            message: '参数校验失败',
            errors,
          });
        }
        req.params = result.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { validate };

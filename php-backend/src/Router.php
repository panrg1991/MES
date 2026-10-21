<?php
/**
 * MES 系统 - 路由分发
 * 支持 /api/xxx/{id} 形式的路径参数，权限码与 Node 后端保持完全一致。
 */

class Router
{
    /** @var array<int,array<string,mixed>> */
    private static $routes = array();

    /**
     * 注册路由
     * @param string $method HTTP 方法
     * @param string $pattern 路径（可含 {id}）
     * @param string|null $permission 权限码（null 表示仅需登录或公开）
     * @param callable $handler 处理器
     * @return void
     */
    public static function add($method, $pattern, $permission, $handler)
    {
        self::$routes[] = array(
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'permission' => $permission,
            'handler' => $handler,
        );
    }

    /**
     * 注册公开路由
     * @param string $method 方法
     * @param string $pattern 路径
     * @param callable $handler 处理器
     * @return void
     */
    public static function open($method, $pattern, $handler)
    {
        self::add($method, $pattern, null, $handler);
    }

    /**
     * 分发当前请求
     * @return void
     */
    public static function dispatch()
    {
        $method = Http::method();
        $path = Http::path();

        foreach (self::$routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            $regex = self::compile($route['pattern']);
            if (!preg_match($regex, $path, $matches)) {
                continue;
            }

            $params = array();
            foreach ($matches as $key => $value) {
                if (!is_int($key)) {
                    $params[$key] = $value;
                }
            }
            if (isset($params['id'])) {
                if (!preg_match('/^[1-9]\d*$/', $params['id'])) {
                    Http::fail('参数校验失败', 400, array(
                        array('field' => 'id', 'message' => 'ID 必须为正整数'),
                    ));
                }
                $params['id'] = (int) $params['id'];
            }

            try {
                if ($route['permission'] === '@auth') {
                    Auth::user();
                } elseif ($route['permission'] !== null) {
                    Auth::requirePermission($route['permission']);
                }

                call_user_func($route['handler'], $params);
            } catch (HttpException $error) {
                // 排程冲突：与 Node 端一致，冲突明细放在 data.conflicts
                if ($error->statusCode === 409 && is_array($error->conflicts) && count($error->conflicts) > 0) {
                    Http::json(409, array('conflicts' => $error->conflicts), $error->getMessage());
                }
                Http::fail(
                    $error->getMessage(),
                    $error->statusCode,
                    $error->errors,
                    $error->conflicts
                );
            } catch (PDOException $error) {
                Http::log('database_error', array(
                    'method' => $method,
                    'path' => $path,
                    'message' => $error->getMessage(),
                ));
                $sqlState = $error->getCode();
                if ($sqlState === '23000') {
                    Http::fail('数据已存在，请勿重复提交', 409);
                }
                if ($sqlState === '40001' || $sqlState === '40P01') {
                    Http::fail('数据已被其他操作修改，请刷新后重试', 409);
                }
                Http::fail(Config::isDev() ? $error->getMessage() : '服务器内部错误', 500);
            } catch (Throwable $error) {
                Http::log('unhandled_error', array(
                    'method' => $method,
                    'path' => $path,
                    'message' => $error->getMessage(),
                    'file' => $error->getFile(),
                    'line' => $error->getLine(),
                ));
                Http::fail(Config::isDev() ? $error->getMessage() : '服务器内部错误', 500);
            }
            return;
        }

        Http::fail('路由不存在: ' . $method . ' ' . $path, 404);
    }

    /**
     * 将路径模式编译为正则
     * @param string $pattern 模式
     * @return string
     */
    private static function compile($pattern)
    {
        $regex = preg_replace('/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/', '(?P<$1>[^/]+)', $pattern);
        return '#^' . $regex . '$#';
    }
}

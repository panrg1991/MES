<?php
/**
 * MES 系统 - HTTP 请求/响应封装
 */

/**
 * 业务异常（由 Router 统一转换为统一响应结构）
 */
class HttpException extends Exception
{
    /** @var int */
    public $statusCode;

    /** @var array<int,array<string,string>>|null */
    public $errors;

    /** @var array<int,mixed>|null */
    public $conflicts;

    /**
     * @param string $message 错误信息
     * @param int $statusCode HTTP 状态码
     * @param array<int,array<string,string>>|null $errors 字段级明细
     * @param array<int,mixed>|null $conflicts 冲突明细
     */
    public function __construct($message, $statusCode = 400, $errors = null, $conflicts = null)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
        $this->errors = $errors;
        $this->conflicts = $conflicts;
    }
}

class Http
{
    /** @var string */
    private static $requestId = '';

    /** @var array<string,mixed>|null */
    private static $body = null;

    /** @var bool */
    private static $bodyParsed = false;

    /**
     * 生成 requestId 并输出安全/CORS 头
     * @return void
     */
    public static function boot()
    {
        self::$requestId = bin2hex(random_bytes(8));
        header('X-Request-Id: ' . self::$requestId);
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: no-referrer');
        header('X-Powered-By:');

        self::applyCors();

        if (self::method() === 'OPTIONS') {
            http_response_code(204);
            exit;
        }

        $length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
        if ($length > Config::bodyLimitBytes()) {
            self::fail('请求体过大，请减少提交内容', 413);
        }
    }

    /**
     * CORS 头
     * @return void
     */
    private static function applyCors()
    {
        $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
        $origins = Config::corsOrigins();
        if ($origin !== '') {
            if (in_array('*', $origins, true) || in_array($origin, $origins, true)) {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
                header('Access-Control-Allow-Credentials: true');
            }
        }
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        header('Access-Control-Expose-Headers: Content-Disposition, X-Request-Id');
        header('Access-Control-Max-Age: 600');
    }

    /**
     * 请求方法
     * @return string
     */
    public static function method()
    {
        return isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';
    }

    /**
     * 请求路径（统一取 /api 起的部分，兼容子目录部署）
     * @return string
     */
    public static function path()
    {
        $uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
        $path = parse_url($uri, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            $path = '/';
        }
        $pos = strpos($path, '/api');
        if ($pos !== false) {
            $path = substr($path, $pos);
        }
        return rtrim($path, '/') === '' ? '/' : rtrim($path, '/');
    }

    /**
     * 原始请求体文本
     * @return string
     */
    public static function rawBody()
    {
        $raw = file_get_contents('php://input');
        return $raw === false ? '' : $raw;
    }

    /**
     * 解析请求体（JSON 优先，兼容 urlencoded）
     * @return array<string,mixed>
     */
    public static function body()
    {
        if (self::$bodyParsed) {
            return self::$body === null ? array() : self::$body;
        }
        self::$bodyParsed = true;

        $raw = self::rawBody();
        if (trim($raw) === '') {
            self::$body = array();
            return self::$body;
        }

        $contentType = isset($_SERVER['CONTENT_TYPE']) ? strtolower($_SERVER['CONTENT_TYPE']) : '';
        if (strpos($contentType, 'application/x-www-form-urlencoded') !== false) {
            $data = array();
            parse_str($raw, $data);
            self::$body = is_array($data) ? $data : array();
            return self::$body;
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new HttpException('请求体格式错误（非法 JSON）', 400);
        }
        self::$body = $data;
        return self::$body;
    }

    /**
     * 查询参数（空串视为未传）
     * @param string $key 键名
     * @param mixed $default 默认值
     * @return mixed
     */
    public static function query($key, $default = null)
    {
        if (!isset($_GET[$key])) {
            return $default;
        }
        $value = $_GET[$key];
        if ($value === '' || $value === 'null' || $value === 'undefined') {
            return $default;
        }
        return $value;
    }

    /**
     * 查询参数转为 int（非法/未传返回 null）
     * @param string $key 键名
     * @return int|null
     */
    public static function queryInt($key)
    {
        $value = self::query($key);
        if ($value === null) {
            return null;
        }
        return (int) $value;
    }

    /**
     * 查询分页参数
     * @param int $defaultPageSize 默认每页条数
     * @return array{0:int,1:int}
     */
    public static function pagination($defaultPageSize = 20)
    {
        $page = self::queryInt('page');
        $pageSize = self::queryInt('pageSize');
        if ($page === null || $page < 1) {
            $page = 1;
        }
        if ($pageSize === null || $pageSize < 1) {
            $pageSize = $defaultPageSize;
        }
        if ($pageSize > 500) {
            $pageSize = 500;
        }
        return array($page, $pageSize);
    }

    /**
     * requestId
     * @return string
     */
    public static function requestId()
    {
        return self::$requestId;
    }

    /**
     * 客户端 IP
     * @return string
     */
    public static function clientIp()
    {
        $trust = strtolower((string) Config::get('TRUST_PROXY', 'false'));
        if ($trust !== '' && $trust !== 'false' && $trust !== '0'
            && isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            return trim($parts[0]);
        }
        return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
    }

    /**
     * 输出 JSON
     * @param int $status HTTP 状态码
     * @param mixed $data 业务数据
     * @param string $message 提示
     * @param array<string,mixed> $extra 额外字段
     * @return void
     */
    public static function json($status, $data, $message, $extra = array())
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $body = array(
            'code' => $status,
            'data' => $data,
            'message' => $message,
        );
        foreach ($extra as $key => $value) {
            $body[$key] = $value;
        }
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * 成功响应
     * @param mixed $data 数据
     * @param string $message 提示
     * @param int $status 状态码
     * @return void
     */
    public static function ok($data = null, $message = '操作成功', $status = 200)
    {
        self::json($status, $data, $message);
    }

    /**
     * 创建成功
     * @param mixed $data 数据
     * @param string $message 提示
     * @return void
     */
    public static function created($data = null, $message = '创建成功')
    {
        self::ok($data, $message, 201);
    }

    /**
     * 分页响应
     * @param array<int,mixed> $list 列表
     * @param int $total 总数
     * @param int $page 页码
     * @param int $pageSize 每页条数
     * @param string $message 提示
     * @return void
     */
    public static function paginated($list, $total, $page, $pageSize, $message = '查询成功')
    {
        self::json(200, array(
            'list' => $list,
            'total' => (int) $total,
            'page' => (int) $page,
            'pageSize' => (int) $pageSize,
        ), $message);
    }

    /**
     * 错误响应
     * @param string $message 信息
     * @param int $status 状态码
     * @param array<int,array<string,string>>|null $errors 字段明细
     * @param array<int,mixed>|null $conflicts 冲突明细
     * @return void
     */
    public static function fail($message, $status = 400, $errors = null, $conflicts = null)
    {
        $extra = array('requestId' => self::$requestId);
        if (is_array($errors) && count($errors) > 0) {
            $extra['errors'] = $errors;
        }
        if (is_array($conflicts) && count($conflicts) > 0) {
            $extra['conflicts'] = $conflicts;
        }
        self::json($status, null, $message, $extra);
    }

    /**
     * 参数校验失败
     * @param array<int,array<string,string>> $errors 字段明细
     * @return void
     */
    public static function validationFailed($errors)
    {
        self::fail('参数校验失败', 400, $errors);
    }

    /**
     * 结构化日志（写入 runtime/app.log）
     * @param string $event 事件
     * @param array<string,mixed> $context 上下文（禁止写入密码/Token）
     * @return void
     */
    public static function log($event, $context = array())
    {
        $dir = Config::$baseDir . '/runtime';
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        $line = array(
            'time' => gmdate('Y-m-d\TH:i:s\Z'),
            'level' => 'info',
            'event' => $event,
            'requestId' => self::$requestId,
        );
        foreach ($context as $key => $value) {
            $line[$key] = $value;
        }
        @file_put_contents(
            $dir . '/app.log',
            json_encode($line, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
            FILE_APPEND | LOCK_EX
        );
    }
}

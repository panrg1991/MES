<?php
/**
 * MES 系统 - PHP 后端配置加载
 * ---------------------------------------------------------------------------
 * 与 Node 后端共用同一份 .env（优先 php-backend/.env，其次 backend/.env），
 * 保证两套接口连同一个数据库、使用同一组 JWT 密钥，可无缝切换。
 */

class Config
{
    /** @var array<string,string> */
    public static $data = array();

    /** @var string */
    public static $baseDir = '';

    /** @var array<int,string> 实际加载的配置文件 */
    public static $envFiles = array();

    /** @var bool 是否成功加载到配置文件 */
    private static $envFileFound = false;

    /**
     * 加载配置
     * @param string $baseDir php-backend 根目录
     * @return void
     */
    public static function load($baseDir)
    {
        self::$baseDir = rtrim($baseDir, '/\\');

        // 选文件口径与 Node 端（backend/src/config/env.js）完全一致：
        //   NODE_ENV=production → .env.production；其他 → .env
        // 优先级：真实环境变量 > php-backend/<env> > backend/<env>
        $envName = self::isProductionRuntime() ? '.env.production' : '.env';
        $files = array(
            self::$baseDir . '/' . $envName,
            dirname(self::$baseDir) . '/backend/' . $envName,
        );
        foreach ($files as $file) {
            if (is_file($file)) {
                self::parseFile($file);
                self::$envFiles[] = $file;
                self::$envFileFound = true;
            }
        }

        date_default_timezone_set(self::get('APP_TIMEZONE', 'Asia/Shanghai'));
    }

    /**
     * 解析 .env 文件（不覆盖已存在的键）
     * @param string $file 文件路径
     * @return void
     */
    private static function parseFile($file)
    {
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $pos));
            $value = trim(substr($line, $pos + 1));
            if ($key === '') {
                continue;
            }
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = substr($value, -1);
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }
            if (!array_key_exists($key, self::$data)) {
                self::$data[$key] = $value;
            }
        }
    }

    /**
     * 读取配置（真实环境变量优先）
     * @param string $key 键名
     * @param string|null $default 默认值
     * @return string|null
     */
    public static function get($key, $default = null)
    {
        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        return array_key_exists($key, self::$data) ? self::$data[$key] : $default;
    }

    /**
     * 解析数据库类型
     * @return string sqlite|mysql
     */
    public static function dbType()
    {
        $declared = strtolower(trim((string) self::get('DB_TYPE', '')));
        if ($declared === 'mariadb') {
            return 'mysql';
        }
        if ($declared === 'sqlite' || $declared === 'mysql') {
            return $declared;
        }
        $url = trim((string) self::get('DATABASE_URL', ''));
        if (strpos($url, 'mysql:') === 0) {
            return 'mysql';
        }
        return 'sqlite';
    }

    /**
     * 解析 SQLite 文件绝对路径（相对路径基准与 Node 一致：backend/prisma）
     * @return string
     */
    public static function sqlitePath()
    {
        $url = trim((string) self::get('DATABASE_URL', ''));
        $path = '';
        if (strpos($url, 'file:') === 0 && self::dbType() === 'sqlite') {
            $path = substr($url, 5);
        } else {
            $path = trim((string) self::get('DB_PATH', './dev.db'));
        }
        if ($path === '') {
            $path = './dev.db';
        }
        if (!self::isAbsolutePath($path)) {
            $path = dirname(self::$baseDir) . '/backend/prisma/' . ltrim($path, './\\');
        }
        return $path;
    }

    /**
     * 解析 MySQL 连接参数
     * @return array<string,mixed>
     */
    public static function mysqlParams()
    {
        $url = trim((string) self::get('DATABASE_URL', ''));
        if (strpos($url, 'mysql:') === 0) {
            $parts = parse_url($url);
            if ($parts !== false) {
                return array(
                    'host' => isset($parts['host']) ? $parts['host'] : '127.0.0.1',
                    'port' => isset($parts['port']) ? $parts['port'] : 3306,
                    'user' => isset($parts['user']) ? urldecode($parts['user']) : 'root',
                    'password' => isset($parts['pass']) ? urldecode($parts['pass']) : '',
                    'dbname' => isset($parts['path']) ? ltrim($parts['path'], '/') : 'mes_workshop',
                );
            }
        }
        return array(
            'host' => self::get('DB_HOST', '127.0.0.1'),
            'port' => (int) self::get('DB_PORT', '3306'),
            'user' => self::get('DB_USER', 'root'),
            'password' => self::get('DB_PASSWORD', ''),
            'dbname' => self::get('DB_NAME', 'mes_workshop'),
        );
    }

    /**
     * 是否绝对路径（兼容 Windows / Linux）
     * @param string $path 路径
     * @return bool
     */
    private static function isAbsolutePath($path)
    {
        if ($path === '') {
            return false;
        }
        if ($path[0] === '/' || $path[0] === '\\') {
            return true;
        }
        return (bool) preg_match('/^[A-Za-z]:[\\\\\\/]/', $path);
    }

    /**
     * 运行环境（默认 development，与 Node 端一致）
     * @return string
     */
    public static function nodeEnv()
    {
        return (string) self::get('NODE_ENV', 'development');
    }

    /**
     * 是否生产运行（仅看真实环境变量，与 Node 端选择配置文件的口径一致）
     * @return bool
     */
    public static function isProductionRuntime()
    {
        return strtolower(trim((string) getenv('NODE_ENV'))) === 'production';
    }

    /**
     * 是否加载到配置文件
     * @return bool
     */
    public static function envFileFound()
    {
        return self::$envFileFound;
    }

    /**
     * 键是否被显式配置（真实环境变量或 .env 文件）
     * @param string $key 键名
     * @return bool
     */
    public static function has($key)
    {
        return getenv($key) !== false || array_key_exists($key, self::$data);
    }

    /**
     * 是否向前端返回异常详情
     * 默认关闭（生产不泄露 SQL / 路径 / 主机等信息）；
     * 仅在显式设置 APP_DEBUG=true，或显式声明 NODE_ENV=development 时开启。
     * @return bool
     */
    public static function debug()
    {
        $flag = strtolower(trim((string) self::get('APP_DEBUG', '')));
        if ($flag === 'true' || $flag === '1' || $flag === 'on') {
            return true;
        }
        if ($flag === 'false' || $flag === '0' || $flag === 'off') {
            return false;
        }
        return self::has('NODE_ENV') && self::nodeEnv() === 'development';
    }

    /**
     * 是否开发环境（等价于 debug()，保留旧方法名）
     * @return bool
     */
    public static function isDev()
    {
        return self::debug();
    }

    /**
     * 请求体大小上限（字节）
     * @return int
     */
    public static function bodyLimitBytes()
    {
        $mb = (int) self::get('BODY_LIMIT', '10');
        if ($mb <= 0) {
            $mb = 10;
        }
        return $mb * 1024 * 1024;
    }

    /**
     * 解析 CORS 来源列表
     * @return array<int,string>
     */
    public static function corsOrigins()
    {
        $raw = (string) self::get('CORS_ORIGIN', 'http://localhost:5173');
        $list = array();
        foreach (explode(',', $raw) as $item) {
            $item = trim($item);
            if ($item !== '') {
                $list[] = $item;
            }
        }
        return count($list) > 0 ? $list : array('http://localhost:5173');
    }

    /**
     * 版本号（读取 backend/package.json）
     * @return string
     */
    public static function version()
    {
        $file = dirname(self::$baseDir) . '/backend/package.json';
        if (is_file($file)) {
            $json = json_decode(file_get_contents($file), true);
            if (is_array($json) && isset($json['version'])) {
                return $json['version'];
            }
        }
        return '2.0.0-php';
    }

    /**
     * 判断 JWT 密钥是否不安全
     * 判定口径：缺失 / 内置默认值 / 示例占位值（含 CHANGE_ME）/ 长度 < 32 / 两把密钥相同
     * @return bool
     */
    public static function hasInsecureSecrets()
    {
        $access = trim((string) self::get('JWT_SECRET', ''));
        $refresh = trim((string) self::get('JWT_REFRESH_SECRET', ''));

        if ($access === '' || $refresh === '') {
            return true;
        }
        if ($access === 'default-jwt-secret' || $refresh === 'default-refresh-secret') {
            return true;
        }
        if ($access === $refresh) {
            return true;
        }
        foreach (array($access, $refresh) as $secret) {
            if (stripos($secret, 'CHANGE_ME') !== false || strlen($secret) < 32) {
                return true;
            }
        }
        return false;
    }

    /**
     * 配置安全问题清单（空数组表示无问题）
     * 说明：生产环境出现清单项时应拒绝启动，避免连错库 / 使用弱密钥。
     * @return array<int,string>
     */
    public static function securityIssues()
    {
        $issues = array();
        if (!self::$envFileFound) {
            $issues[] = '未找到配置文件（' . (self::isProductionRuntime() ? '.env.production' : '.env') . '）';
        }
        if (!self::isProductionRuntime()) {
            return $issues;
        }
        if (self::nodeEnv() !== 'production') {
            $issues[] = 'NODE_ENV 未明确设为 production';
        }
        if (self::hasInsecureSecrets()) {
            $issues[] = 'JWT_SECRET / JWT_REFRESH_SECRET 仍为默认值、占位值、长度不足 32 位或两把密钥相同';
        }
        return $issues;
    }
}

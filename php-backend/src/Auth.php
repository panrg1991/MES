<?php
/**
 * MES 系统 - 认证与权限（JWT + RBAC + 登录锁定）
 */

class Auth
{
    /** @var array<string,mixed>|null */
    private static $currentUser = null;

    /** 连续失败上限 */
    const MAX_LOGIN_FAILURES = 5;

    /** 失败统计窗口（秒） */
    const FAILURE_WINDOW = 900;

    /** 锁定时长（秒） */
    const LOCK_SECONDS = 900;

    /**
     * 读取 Authorization 头
     * @return string
     */
    private static function authorizationHeader()
    {
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            return $_SERVER['HTTP_AUTHORIZATION'];
        }
        if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        if (function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            if (is_array($headers)) {
                foreach ($headers as $key => $value) {
                    if (strtolower($key) === 'authorization') {
                        return $value;
                    }
                }
            }
        }
        return '';
    }

    /**
     * 认证当前请求，返回用户信息
     * @return array<string,mixed>
     * @throws HttpException 401
     */
    public static function user()
    {
        if (self::$currentUser !== null) {
            return self::$currentUser;
        }

        $header = self::authorizationHeader();
        if ($header === '') {
            Http::log('auth_missing_token', array('method' => Http::method(), 'path' => Http::path()));
            throw new HttpException('未提供认证令牌', 401);
        }
        $parts = explode(' ', $header);
        if (count($parts) !== 2 || $parts[0] !== 'Bearer') {
            Http::log('auth_bad_format', array('method' => Http::method(), 'path' => Http::path()));
            throw new HttpException('认证令牌格式错误', 401);
        }

        $decoded = Jwt::verify($parts[1], (string) Config::get('JWT_SECRET', 'default-jwt-secret'));
        if ($decoded === null) {
            Http::log('auth_invalid_token', array('method' => Http::method(), 'path' => Http::path()));
            throw new HttpException('认证令牌已过期或无效', 401);
        }

        self::$currentUser = array(
            'userId' => isset($decoded['userId']) ? (int) $decoded['userId'] : 0,
            'username' => isset($decoded['username']) ? $decoded['username'] : '',
            'permissions' => isset($decoded['permissions']) && is_array($decoded['permissions'])
                ? $decoded['permissions']
                : array(),
        );
        return self::$currentUser;
    }

    /**
     * 权限校验
     * @param string $code 权限编码
     * @return void
     * @throws HttpException 403
     */
    public static function requirePermission($code)
    {
        $user = self::user();
        if (!in_array($code, $user['permissions'], true)) {
            Http::log('permission_denied', array(
                'userId' => $user['userId'],
                'username' => $user['username'],
                'permission' => $code,
                'method' => Http::method(),
                'path' => Http::path(),
            ));
            throw new HttpException('无权限：需要 ' . $code . ' 权限', 403);
        }
    }

    /**
     * 读取用户权限编码（仅启用角色）
     * @param int $userId 用户 ID
     * @return array<int,string>
     */
    public static function permissionsFor($userId)
    {
        $rows = Db::all(
            'SELECT DISTINCT p.code AS code FROM permissions p'
            . ' INNER JOIN role_permissions rp ON rp.permissionId = p.id'
            . ' INNER JOIN roles r ON r.id = rp.roleId'
            . ' INNER JOIN user_roles ur ON ur.roleId = r.id'
            . ' WHERE ur.userId = ? AND r.status = 1 ORDER BY p.code ASC',
            array($userId)
        );
        $list = array();
        foreach ($rows as $row) {
            $list[] = $row['code'];
        }
        return $list;
    }

    /**
     * 读取用户角色名
     * @param int $userId 用户 ID
     * @return array<int,string>
     */
    public static function rolesFor($userId)
    {
        $rows = Db::all(
            'SELECT r.name AS name FROM roles r'
            . ' INNER JOIN user_roles ur ON ur.roleId = r.id'
            . ' WHERE ur.userId = ? ORDER BY r.id ASC',
            array($userId)
        );
        $list = array();
        foreach ($rows as $row) {
            $list[] = $row['name'];
        }
        return $list;
    }

    /**
     * 查询用户（含已归一化字段）
     * @param int $userId 用户 ID
     * @return array<string,mixed>|null
     */
    public static function findUser($userId)
    {
        return Db::one(
            'SELECT id, username, passwordHash, name, department, status, createdAt, updatedAt'
            . ' FROM users WHERE id = ?',
            array($userId),
            'users'
        );
    }

    /**
     * 读取登录锁定状态
     * @param string $username 用户名
     * @return array<string,mixed>|null
     */
    private static function failureState($username)
    {
        $state = Store::mutate(function (&$data) use ($username) {
            return isset($data['login'][$username]) ? $data['login'][$username] : null;
        });
        if (!is_array($state)) {
            return null;
        }
        $now = time();
        if (isset($state['lockedUntil']) && $state['lockedUntil'] > $now) {
            return $state;
        }
        if (!isset($state['firstAt']) || $now - $state['firstAt'] > self::FAILURE_WINDOW) {
            return null;
        }
        return $state;
    }

    /**
     * 记录一次登录失败
     * @param string $username 用户名
     * @return void
     */
    public static function recordLoginFailure($username)
    {
        $now = time();
        Store::mutate(function (&$data) use ($username, $now) {
            $state = isset($data['login'][$username]) ? $data['login'][$username] : null;
            if (!is_array($state) || !isset($state['firstAt'])
                || ($state['lockedUntil'] <= $now && $now - $state['firstAt'] > self::FAILURE_WINDOW)) {
                $state = array('count' => 0, 'firstAt' => $now, 'lockedUntil' => 0);
            }
            $state['count'] += 1;
            if ($state['count'] >= self::MAX_LOGIN_FAILURES) {
                $state['lockedUntil'] = $now + self::LOCK_SECONDS;
            }
            $data['login'][$username] = $state;
            return null;
        });
    }

    /**
     * 清除登录失败计数
     * @param string $username 用户名
     * @return void
     */
    public static function clearLoginFailures($username)
    {
        Store::mutate(function (&$data) use ($username) {
            if (isset($data['login'][$username])) {
                unset($data['login'][$username]);
            }
            return null;
        });
    }

    /**
     * 计算用户权限并签发 Token（登录）
     * @param string $username 用户名
     * @param string $password 密码
     * @return array<string,mixed>
     * @throws HttpException 401/403/429
     */
    public static function login($username, $password)
    {
        $state = self::failureState($username);
        if ($state !== null && isset($state['lockedUntil']) && $state['lockedUntil'] > time()) {
            $minutes = (int) ceil(($state['lockedUntil'] - time()) / 60);
            Http::log('login_locked', array('username' => $username));
            throw new HttpException(
                '登录失败次数过多，账号已临时锁定，请 ' . $minutes . ' 分钟后再试',
                429
            );
        }

        $user = Db::one(
            'SELECT id, username, passwordHash, name, department, status, createdAt, updatedAt'
            . ' FROM users WHERE username = ?',
            array($username),
            'users'
        );

        // 不存在的用户也做一次 bcrypt 校验，避免响应耗时泄露用户名是否存在
        $dummyHash = '$2a$10$1DM/L0eYS7wcQCaGUELl4umXmdUmWA9owEowiDHyviPmUtW9NHMkq';
        if ($user === null) {
            password_verify($password, $dummyHash);
            self::recordLoginFailure($username);
            Http::log('login_failed', array('username' => $username, 'reason' => 'user_not_found'));
            throw new HttpException('用户名或密码错误', 401);
        }

        if (!$user['status']) {
            Http::log('login_failed', array(
                'username' => $username,
                'userId' => $user['id'],
                'reason' => 'user_disabled',
            ));
            throw new HttpException('账号已停用，请联系管理员', 403);
        }

        if (!password_verify($password, $user['passwordHash'])) {
            self::recordLoginFailure($username);
            Http::log('login_failed', array(
                'username' => $username,
                'userId' => $user['id'],
                'reason' => 'bad_password',
            ));
            throw new HttpException('用户名或密码错误', 401);
        }

        self::clearLoginFailures($username);
        Http::log('login_success', array('username' => $username, 'userId' => $user['id']));

        $permissions = self::permissionsFor((int) $user['id']);
        $tokens = Jwt::tokenPair($user, $permissions);

        unset($user['passwordHash']);
        return array(
            'token' => $tokens['token'],
            'refreshToken' => $tokens['refreshToken'],
            'user' => $user,
            'permissions' => $permissions,
        );
    }

    /**
     * 哈希密码（bcrypt，cost=10，与 Node bcryptjs 互通）
     * @param string $password 原始密码
     * @return string
     */
    public static function hashPassword($password)
    {
        return password_hash($password, PASSWORD_BCRYPT, array('cost' => 10));
    }
}

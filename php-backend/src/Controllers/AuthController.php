<?php
/**
 * MES 系统 - 认证接口
 */

class AuthController
{
    /**
     * POST /api/auth/login
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function login($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'username' => 'required|string|min:2|max:50',
            'password' => 'required|string|min:6|max:100',
        ));

        $ipKey = 'login:' . Http::clientIp();
        if (!RateLimit::allow($ipKey, 20, 900, false)) {
            Http::fail('登录尝试过于频繁，请稍后再试', 429);
        }

        try {
            $result = Auth::login(trim((string) $body['username']), (string) $body['password']);
        } catch (HttpException $error) {
            RateLimit::hit($ipKey, 900);
            throw $error;
        }

        Http::ok($result, '登录成功');
    }

    /**
     * POST /api/auth/refresh
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function refresh($params)
    {
        $body = Http::body();
        Validate::run($body, array('refreshToken' => 'required|string'));

        $secret = (string) Config::get('JWT_REFRESH_SECRET', 'default-refresh-secret');
        $decoded = Jwt::verify((string) $body['refreshToken'], $secret);
        if ($decoded === null || !isset($decoded['userId'])) {
            throw new HttpException('刷新令牌已过期或无效', 401);
        }

        $user = Auth::findUser((int) $decoded['userId']);
        if ($user === null || !$user['status']) {
            throw new HttpException('用户不存在或已停用', 401);
        }

        $permissions = Auth::permissionsFor((int) $user['id']);
        $token = Jwt::sign(array(
            'userId' => (int) $user['id'],
            'username' => $user['username'],
            'permissions' => $permissions,
        ), (string) Config::get('JWT_SECRET', 'default-jwt-secret'), Jwt::ttl(
            (string) Config::get('JWT_EXPIRES_IN', '2h'),
            7200
        ));

        Http::ok(array('token' => $token), '令牌刷新成功');
    }

    /**
     * POST /api/auth/logout
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function logout($params)
    {
        Http::ok(null, '已退出登录');
    }

    /**
     * GET /api/auth/profile
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function profile($params)
    {
        $current = Auth::user();
        $user = Auth::findUser((int) $current['userId']);
        if ($user === null) {
            throw new HttpException('用户不存在', 404);
        }
        unset($user['passwordHash']);

        Http::ok(array(
            'user' => $user,
            'roles' => Auth::rolesFor((int) $user['id']),
            'permissions' => Auth::permissionsFor((int) $user['id']),
        ), '获取用户信息成功');
    }

    /**
     * POST /api/auth/change-password
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function changePassword($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'oldPassword' => 'required|string',
            'newPassword' => 'required|string|min:6|max:100',
            'confirmPassword' => 'required|string',
        ));
        if ((string) $body['newPassword'] !== (string) $body['confirmPassword']) {
            throw new HttpException('参数校验失败', 400, array(
                array('field' => 'confirmPassword', 'message' => '两次输入的密码不一致'),
            ));
        }

        $current = Auth::user();
        $user = Auth::findUser((int) $current['userId']);
        if ($user === null) {
            throw new HttpException('用户不存在', 404);
        }
        if (!password_verify((string) $body['oldPassword'], $user['passwordHash'])) {
            throw new HttpException('旧密码错误', 400);
        }
        if ((string) $body['oldPassword'] === (string) $body['newPassword']) {
            throw new HttpException('新密码不能与旧密码相同', 400);
        }

        Db::update(
            'users',
            array(
                'passwordHash' => Auth::hashPassword((string) $body['newPassword']),
                'updatedAt' => Db::nowParam(),
            ),
            'id = ?',
            array((int) $user['id'])
        );

        Http::log('password_changed', array('userId' => (int) $user['id']));
        Http::ok(null, '密码修改成功，请重新登录');
    }
}

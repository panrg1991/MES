<?php
/**
 * MES 系统 - JWT 工具（HS256，与 Node jsonwebtoken 结果互通）
 * Payload 约定：Access = { userId, username, permissions, iat, exp }
 *              Refresh = { userId, username, iat, exp }
 */

class Jwt
{
    /**
     * base64url 编码
     * @param string $text 原文
     * @return string
     */
    private static function b64u($text)
    {
        return rtrim(strtr(base64_encode($text), '+/', '-_'), '=');
    }

    /**
     * base64url 解码
     * @param string $text 编码文本
     * @return string
     */
    private static function b64uDecode($text)
    {
        $padding = strlen($text) % 4;
        if ($padding > 0) {
            $text .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($text, '-_', '+/'));
    }

    /**
     * 签发 Token
     * @param array<string,mixed> $payload 载荷
     * @param string $secret 密钥
     * @param int $ttlSeconds 有效期（秒）
     * @return string
     */
    public static function sign($payload, $secret, $ttlSeconds)
    {
        $now = time();
        $payload['iat'] = $now;
        $payload['exp'] = $now + $ttlSeconds;

        $header = self::b64u(json_encode(array('alg' => 'HS256', 'typ' => 'JWT')));
        $body = self::b64u(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $signature = self::b64u(hash_hmac('sha256', $header . '.' . $body, $secret, true));
        return $header . '.' . $body . '.' . $signature;
    }

    /**
     * 验证 Token
     * @param string $token Token
     * @param string $secret 密钥
     * @return array<string,mixed>|null
     */
    public static function verify($token, $secret)
    {
        if (!is_string($token) || $token === '') {
            return null;
        }
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        $expected = self::b64u(hash_hmac('sha256', $parts[0] . '.' . $parts[1], $secret, true));
        if (!hash_equals($expected, $parts[2])) {
            return null;
        }
        $payload = json_decode(self::b64uDecode($parts[1]), true);
        if (!is_array($payload)) {
            return null;
        }
        if (isset($payload['exp']) && time() >= (int) $payload['exp']) {
            return null;
        }
        return $payload;
    }

    /**
     * 签发 Access + Refresh
     * @param array{id:int,username:string} $user 用户
     * @param array<int,string> $permissions 权限编码
     * @return array{token:string,refreshToken:string}
     */
    public static function tokenPair($user, $permissions)
    {
        $accessSecret = (string) Config::get('JWT_SECRET', 'default-jwt-secret');
        $refreshSecret = (string) Config::get('JWT_REFRESH_SECRET', 'default-refresh-secret');

        $token = self::sign(array(
            'userId' => (int) $user['id'],
            'username' => $user['username'],
            'permissions' => $permissions,
            // jti：登出时据此加入吊销名单（Node 端不校验该字段，互通无影响）
            'jti' => bin2hex(random_bytes(16)),
        ), $accessSecret, self::ttl((string) Config::get('JWT_EXPIRES_IN', '2h'), 7200));

        $refreshToken = self::sign(array(
            'userId' => (int) $user['id'],
            'username' => $user['username'],
        ), $refreshSecret, self::ttl((string) Config::get('JWT_REFRESH_EXPIRES_IN', '7d'), 604800));

        return array('token' => $token, 'refreshToken' => $refreshToken);
    }

    /**
     * 解析有效期表达式（支持 30s/15m/2h/7d 与纯数字秒）
     * @param string $text 表达式
     * @param int $default 默认秒数
     * @return int
     */
    public static function ttl($text, $default)
    {
        $text = trim($text);
        if ($text === '') {
            return $default;
        }
        if (preg_match('/^(\d+)$/', $text, $match)) {
            return (int) $match[1];
        }
        if (preg_match('/^(\d+)\s*([smhd])$/i', $text, $match)) {
            $value = (int) $match[1];
            $unit = strtolower($match[2]);
            if ($unit === 's') {
                return $value;
            }
            if ($unit === 'm') {
                return $value * 60;
            }
            if ($unit === 'h') {
                return $value * 3600;
            }
            return $value * 86400;
        }
        return $default;
    }
}

<?php
/**
 * MES 系统 - Access Token 吊销名单（jti）
 * ---------------------------------------------------------------------------
 * JWT 本身无状态，登出/强制下线通过 jti 黑名单实现：
 *   · 只保存未过期的条目，写入时顺带清理到期项（exp 到期自动失效）；
 *   · 采用「临时文件 + 原子改名」写入，读路径无需加锁，不会读到半截内容；
 *   · 单机部署用文件，多实例/多机部署请替换为 Redis 等集中存储。
 */

class TokenDenylist
{
    /** 名单上限（超出后按到期时间保留最近的一批） */
    const MAX_ITEMS = 5000;

    /**
     * 名单文件路径
     * @return string
     */
    private static function file()
    {
        return Config::$baseDir . '/runtime/denylist.json';
    }

    /**
     * 读取名单
     * @return array<string,int>
     */
    private static function read()
    {
        $file = self::file();
        if (!is_file($file)) {
            return array();
        }
        $raw = @file_get_contents($file);
        if ($raw === false || $raw === '') {
            return array();
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : array();
    }

    /**
     * Token 是否已被吊销
     * @param string $jti Token 唯一标识
     * @return bool
     */
    public static function has($jti)
    {
        if (!is_string($jti) || $jti === '') {
            return false;
        }
        $data = self::read();
        if (!isset($data[$jti])) {
            return false;
        }
        return (int) $data[$jti] > time();
    }

    /**
     * 吊销一个 Token（按到期时间自动淘汰）
     * @param string $jti Token 唯一标识
     * @param int $exp 到期时间戳
     * @return bool
     */
    public static function add($jti, $exp)
    {
        $now = time();
        if (!is_string($jti) || $jti === '' || (int) $exp <= $now) {
            return false;
        }

        $data = self::read();
        foreach ($data as $key => $value) {
            if ((int) $value <= $now) {
                unset($data[$key]);
            }
        }
        $data[$jti] = (int) $exp;
        if (count($data) > self::MAX_ITEMS) {
            asort($data);
            $data = array_slice($data, -self::MAX_ITEMS, null, true);
        }

        $file = self::file();
        $dir = dirname($file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $json = json_encode($data);
        if ($json === false) {
            return false;
        }

        $temp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($temp, $json, LOCK_EX) === false) {
            return false;
        }
        if (!@rename($temp, $file)) {
            @unlink($temp);
            return false;
        }
        return true;
    }
}

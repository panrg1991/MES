<?php
/**
 * MES 系统 - 文件状态存储（限流 / 登录锁定）
 * 说明：单机部署下以文件 + flock 实现跨进程共享；多实例部署请改用 Redis。
 */

class Store
{
    /**
     * 对状态文件做一次原子读改写
     * @param callable $callback 形如 function (array &$data) { ... return $result; }
     * @return mixed
     */
    public static function mutate($callback)
    {
        $dir = Config::$baseDir . '/runtime';
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        $file = $dir . '/state.json';
        $handle = @fopen($file, 'c+');
        if ($handle === false) {
            return null;
        }
        flock($handle, LOCK_EX);
        $raw = stream_get_contents($handle);
        $data = json_decode((string) $raw, true);
        if (!is_array($data)) {
            $data = array();
        }
        $result = call_user_func_array($callback, array(&$data));
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($data));
        fflush($handle);
        flock($handle, LOCK_UN);
        fclose($handle);
        return $result;
    }
}

class RateLimit
{
    /**
     * 是否允许本次请求（并可选自增）
     * @param string $key 计数键
     * @param int $max 窗口内上限
     * @param int $windowSeconds 窗口秒数
     * @param bool $increment 是否自增
     * @return bool
     */
    public static function allow($key, $max, $windowSeconds, $increment = true)
    {
        $now = time();
        return (bool) Store::mutate(function (&$data) use ($key, $max, $windowSeconds, $increment, $now) {
            $entry = isset($data['rate'][$key]) ? $data['rate'][$key] : null;
            if (!is_array($entry) || !isset($entry['reset']) || $entry['reset'] <= $now) {
                $entry = array('count' => 0, 'reset' => $now + $windowSeconds);
            }
            if ($entry['count'] >= $max) {
                $data['rate'][$key] = $entry;
                return false;
            }
            if ($increment) {
                $entry['count'] += 1;
            }
            $data['rate'][$key] = $entry;
            return true;
        });
    }

    /**
     * 记录一次失败
     * @param string $key 计数键
     * @param int $windowSeconds 窗口秒数
     * @return void
     */
    public static function hit($key, $windowSeconds)
    {
        $now = time();
        Store::mutate(function (&$data) use ($key, $windowSeconds, $now) {
            $entry = isset($data['rate'][$key]) ? $data['rate'][$key] : null;
            if (!is_array($entry) || !isset($entry['reset']) || $entry['reset'] <= $now) {
                $entry = array('count' => 0, 'reset' => $now + $windowSeconds);
            }
            $entry['count'] += 1;
            $data['rate'][$key] = $entry;
            return null;
        });
    }
}

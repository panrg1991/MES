<?php
/**
 * MES 系统 - 数据库访问层（PDO）
 * ---------------------------------------------------------------------------
 * 同时支持 SQLite / MySQL，读写与 Node(Prisma) 共用的库：
 *   - SQLite 的 DATETIME 由 Prisma 存为「毫秒时间戳」，本层负责与 ISO 字符串互转；
 *   - MySQL 的 DATETIME 以 UTC 文本存储；
 *   - Decimal 统一输出为 number，布尔统一输出为 bool，与 Node 端响应契约一致。
 */

class Db
{
    /** @var PDO|null */
    private static $pdo = null;

    /** @var string sqlite|mysql */
    private static $driver = 'sqlite';

    /** @var array<string,array<int,string>> 各表日期字段 */
    private static $dateColumns = array(
        'users' => array('createdAt', 'updatedAt'),
        'roles' => array('createdAt', 'updatedAt'),
        'work_orders' => array('planStart', 'planEnd', 'actualStart', 'actualEnd', 'createdAt', 'updatedAt'),
        'production_reports' => array('reportTime'),
        'work_order_status_logs' => array('changedAt'),
        'production_schedules' => array('plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'createdAt', 'updatedAt'),
        'equipment' => array('purchaseDate', 'createdAt', 'updatedAt'),
        'equipment_status_logs' => array('changedAt'),
        'maintenance_plans' => array('nextDate', 'createdAt', 'updatedAt'),
        'maintenance_records' => array('startTime', 'endTime', 'createdAt', 'updatedAt'),
        'breakdown_records' => array('occurredAt', 'repairedAt', 'createdAt', 'updatedAt'),
        'quality_inspections' => array('inspectionTime', 'createdAt', 'updatedAt'),
        'defect_records' => array('handledAt', 'createdAt', 'updatedAt'),
        'materials' => array('createdAt', 'updatedAt'),
        'boms' => array('createdAt', 'updatedAt'),
        'inventory' => array('updatedAt'),
        'inventory_transactions' => array('transactionTime'),
        'material_batches' => array('receivedDate', 'createdAt', 'updatedAt'),
        'shifts' => array('createdAt', 'updatedAt'),
        'personnel_schedules' => array('scheduleDate', 'createdAt', 'updatedAt'),
        'work_hours_records' => array('workDate', 'startTime', 'endTime', 'createdAt', 'updatedAt'),
    );

    /** @var array<string,array<int,string>> 布尔字段 */
    private static $boolColumns = array(
        'users' => array('status'),
        'roles' => array('status'),
        'boms' => array('status'),
    );

    /** @var array<string,array<int,string>> Decimal 字段 */
    private static $decimalColumns = array(
        'bom_items' => array('quantity'),
        'inventory' => array('quantity', 'safetyStock', 'maxStock'),
        'inventory_transactions' => array('quantity'),
        'material_batches' => array('quantity'),
        'work_hours_records' => array('hours'),
    );

    /**
     * 获取 PDO 连接（懒加载）
     * @return PDO
     */
    public static function pdo()
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        self::$driver = Config::dbType();
        $options = array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        );

        if (self::$driver === 'mysql') {
            $params = Config::mysqlParams();
            $dsn = 'mysql:host=' . $params['host'] . ';port=' . $params['port']
                . ';dbname=' . $params['dbname'] . ';charset=utf8mb4';
            $options[PDO::ATTR_EMULATE_PREPARES] = false;
            self::$pdo = new PDO($dsn, $params['user'], $params['password'], $options);
        } else {
            $path = Config::sqlitePath();
            if (!is_file($path)) {
                throw new RuntimeException('SQLite 数据库不存在：' . $path);
            }
            self::$pdo = new PDO('sqlite:' . $path, null, null, $options);
            self::$pdo->exec('PRAGMA foreign_keys = ON');
            self::$pdo->exec('PRAGMA busy_timeout = 5000');
        }

        return self::$pdo;
    }

    /**
     * 当前数据库类型
     * @return string
     */
    public static function driver()
    {
        self::pdo();
        return self::$driver;
    }

    /**
     * 执行查询
     * @param string $sql SQL
     * @param array<int,mixed> $params 参数
     * @return PDOStatement
     */
    public static function q($sql, $params = array())
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /**
     * 查询多行
     * @param string $sql SQL
     * @param array<int,mixed> $params 参数
     * @param string|null $table 表名（用于日期/布尔/Decimal 归一化）
     * @return array<int,array<string,mixed>>
     */
    public static function all($sql, $params = array(), $table = null)
    {
        $rows = self::q($sql, $params)->fetchAll();
        if ($table !== null) {
            foreach ($rows as $index => $row) {
                $rows[$index] = self::normalize($table, $row);
            }
        }
        return $rows;
    }

    /**
     * 查询单行
     * @param string $sql SQL
     * @param array<int,mixed> $params 参数
     * @param string|null $table 表名
     * @return array<string,mixed>|null
     */
    public static function one($sql, $params = array(), $table = null)
    {
        $row = self::q($sql, $params)->fetch();
        if ($row === false) {
            return null;
        }
        return $table !== null ? self::normalize($table, $row) : $row;
    }

    /**
     * 查询单值
     * @param string $sql SQL
     * @param array<int,mixed> $params 参数
     * @return mixed
     */
    public static function val($sql, $params = array())
    {
        $value = self::q($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    /**
     * 执行写操作，返回受影响行数
     * @param string $sql SQL
     * @param array<int,mixed> $params 参数
     * @return int
     */
    public static function exec($sql, $params = array())
    {
        return self::q($sql, $params)->rowCount();
    }

    /**
     * 插入一行并返回自增 ID
     * @param string $table 表名
     * @param array<string,mixed> $data 数据
     * @return int
     */
    public static function insert($table, $data)
    {
        $columns = array();
        $holders = array();
        $params = array();
        foreach ($data as $column => $value) {
            $columns[] = self::quoteIdent($column);
            $holders[] = '?';
            $params[] = $value;
        }
        $sql = 'INSERT INTO ' . self::quoteIdent($table)
            . ' (' . implode(', ', $columns) . ') VALUES (' . implode(', ', $holders) . ')';
        self::q($sql, $params);
        return (int) self::pdo()->lastInsertId();
    }

    /**
     * 更新数据
     * @param string $table 表名
     * @param array<string,mixed> $data 更新字段
     * @param string $where WHERE 子句（含占位符）
     * @param array<int,mixed> $params WHERE 参数
     * @return int
     */
    public static function update($table, $data, $where, $params = array())
    {
        $sets = array();
        $values = array();
        foreach ($data as $column => $value) {
            $sets[] = self::quoteIdent($column) . ' = ?';
            $values[] = $value;
        }
        $sql = 'UPDATE ' . self::quoteIdent($table) . ' SET ' . implode(', ', $sets)
            . ' WHERE ' . $where;
        return self::exec($sql, array_merge($values, $params));
    }

    /**
     * 事务包装
     * @param callable $callback 事务内逻辑
     * @return mixed
     */
    public static function tx($callback)
    {
        $pdo = self::pdo();
        $owns = !$pdo->inTransaction();
        if ($owns) {
            $pdo->beginTransaction();
        }
        try {
            $result = call_user_func($callback);
            if ($owns) {
                $pdo->commit();
            }
            return $result;
        } catch (Exception $error) {
            if ($owns && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        } catch (Throwable $error) {
            if ($owns && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }

    /**
     * 表名/列名转义
     * @param string $name 名称
     * @return string
     */
    public static function quoteIdent($name)
    {
        return '`' . str_replace('`', '', $name) . '`';
    }

    /**
     * 归一化一行数据
     * @param string $table 表名
     * @param array<string,mixed> $row 原始行
     * @return array<string,mixed>
     */
    public static function normalize($table, $row)
    {
        if (!is_array($row)) {
            return $row;
        }
        if (isset(self::$dateColumns[$table])) {
            foreach (self::$dateColumns[$table] as $column) {
                if (array_key_exists($column, $row)) {
                    $row[$column] = self::toIso($row[$column]);
                }
            }
        }
        if (isset(self::$boolColumns[$table])) {
            foreach (self::$boolColumns[$table] as $column) {
                if (array_key_exists($column, $row)) {
                    $row[$column] = (bool) $row[$column];
                }
            }
        }
        if (isset(self::$decimalColumns[$table])) {
            foreach (self::$decimalColumns[$table] as $column) {
                if (array_key_exists($column, $row) && $row[$column] !== null) {
                    $row[$column] = (float) $row[$column];
                }
            }
        }
        return $row;
    }

    /**
     * 原始日期值 → ISO8601（UTC，带毫秒），与 Prisma JSON 输出一致
     * @param mixed $raw 原始值
     * @return string|null
     */
    public static function toIso($raw)
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (self::driver() === 'sqlite') {
            $ms = (float) $raw;
            $seconds = (int) floor($ms / 1000);
            $millis = (int) round($ms - $seconds * 1000);
            if ($millis >= 1000) {
                $seconds += 1;
                $millis -= 1000;
            }
            return gmdate('Y-m-d\TH:i:s', $seconds) . sprintf('.%03dZ', $millis);
        }
        $dt = new DateTime((string) $raw, new DateTimeZone('UTC'));
        return $dt->format('Y-m-d\TH:i:s') . '.000Z';
    }

    /**
     * 原始日期值 → DateTime（UTC）
     * @param mixed $raw 原始值
     * @return DateTime|null
     */
    public static function rawToDate($raw)
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (self::driver() === 'sqlite') {
            $ms = (float) $raw;
            $seconds = (int) floor($ms / 1000);
            $dt = new DateTime('@' . $seconds);
            $dt->setTimezone(new DateTimeZone('UTC'));
            return $dt;
        }
        return new DateTime((string) $raw, new DateTimeZone('UTC'));
    }

    /**
     * 业务时间入参 → 数据库可写值
     * @param mixed $value 时间（DateTime / 字符串 / null）
     * @return mixed
     */
    public static function dateParam($value)
    {
        if ($value === null || $value === '') {
            return null;
        }
        $dt = self::parseDate($value);
        if (self::driver() === 'sqlite') {
            return (int) round(((float) $dt->format('U.u')) * 1000);
        }
        return $dt->format('Y-m-d H:i:s');
    }

    /**
     * 当前时间入参
     * @return mixed
     */
    public static function nowParam()
    {
        $now = new DateTime('now', new DateTimeZone('UTC'));
        if (self::driver() === 'sqlite') {
            return (int) round(((float) $now->format('U.u')) * 1000);
        }
        return $now->format('Y-m-d H:i:s');
    }

    /**
     * 解析业务时间为 UTC DateTime
     * 规则：仅日期 → 当地零点；无时区的时间串 → 当地时区；带 Z/偏移 → 原样解析
     * @param mixed $value 时间值
     * @return DateTime
     */
    public static function parseDate($value)
    {
        if ($value instanceof DateTime) {
            $copy = clone $value;
            $copy->setTimezone(new DateTimeZone('UTC'));
            return $copy;
        }
        $text = trim((string) $value);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $text)) {
            $dt = new DateTime($text . ' 00:00:00', new DateTimeZone(date_default_timezone_get()));
        } elseif (preg_match('/(Z|[+-]\d{2}:?\d{2})$/i', $text)) {
            $dt = new DateTime($text);
        } else {
            $dt = new DateTime(str_replace('T', ' ', $text), new DateTimeZone(date_default_timezone_get()));
        }
        $dt->setTimezone(new DateTimeZone('UTC'));
        return $dt;
    }

    /**
     * 当地日期字符串（YYYY-MM-DD）
     * @param mixed $raw 原始日期值
     * @return string
     */
    public static function localDateKey($raw)
    {
        $dt = self::rawToDate($raw);
        if ($dt === null) {
            return '';
        }
        $dt->setTimezone(new DateTimeZone(date_default_timezone_get()));
        return $dt->format('Y-m-d');
    }

    /**
     * 当地日期区间 [当天零点, 次天零点) 对应的数据库参数
     * @param string $date YYYY-MM-DD
     * @return array{0:mixed,1:mixed}
     */
    public static function localDateRange($date)
    {
        $tz = new DateTimeZone(date_default_timezone_get());
        $start = new DateTime($date . ' 00:00:00', $tz);
        $end = clone $start;
        $end->modify('+1 day');
        $start->setTimezone(new DateTimeZone('UTC'));
        $end->setTimezone(new DateTimeZone('UTC'));
        return array(self::dateTimeParam($start), self::dateTimeParam($end));
    }

    /**
     * DateTime → 数据库可写值
     * @param DateTime $dt 时间
     * @return mixed
     */
    public static function dateTimeParam($dt)
    {
        if (self::driver() === 'sqlite') {
            return (int) round(((float) $dt->format('U.u')) * 1000);
        }
        return $dt->format('Y-m-d H:i:s');
    }

    /**
     * 当天 [00:00, 次日 00:00) 的数据库参数
     * @return array{0:mixed,1:mixed}
     */
    public static function todayRange()
    {
        return self::localDateRange(date('Y-m-d'));
    }

    /**
     * 对原始日期值增加天数
     * @param mixed $raw 原始值
     * @param int $days 天数
     * @return mixed 数据库可写值
     */
    public static function addDays($raw, $days)
    {
        $dt = self::rawToDate($raw);
        if ($dt === null) {
            return null;
        }
        $dt->modify(($days >= 0 ? '+' : '') . $days . ' days');
        return self::dateTimeParam($dt);
    }

    /**
     * 健康检查
     * @return array{connected:bool,latencyMs:int,error:string|null}
     */
    public static function health()
    {
        $start = microtime(true);
        try {
            self::pdo()->query('SELECT 1');
            return array(
                'connected' => true,
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'error' => null,
            );
        } catch (Exception $error) {
            return array(
                'connected' => false,
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'error' => $error->getMessage(),
            );
        }
    }
}

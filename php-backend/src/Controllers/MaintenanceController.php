<?php
/**
 * MES 系统 - 设备维保接口（计划 / 到期提醒 / 记录与周期顺延）
 */

class MaintenanceController
{
    /** @var array<string,int> 周期类型 → 天数 */
    private static $cycleDays = array(
        'daily' => 1,
        'weekly' => 7,
        'monthly' => 30,
        'quarterly' => 90,
        'yearly' => 365,
    );

    /** 一天秒数 */
    const DAY_SECONDS = 86400;

    /**
     * 计划行 → 输出
     * @param array<string,mixed> $row 行（含设备别名）
     * @return array<string,mixed>
     */
    private static function formatPlan($row)
    {
        $equipment = null;
        if (isset($row['equipmentCode']) && $row['equipmentCode'] !== null) {
            $equipment = array(
                'id' => (int) $row['equipmentId'],
                'code' => $row['equipmentCode'],
                'name' => $row['equipmentName'],
            );
        }
        unset($row['equipmentCode'], $row['equipmentName']);
        $row['id'] = (int) $row['id'];
        $row['equipmentId'] = (int) $row['equipmentId'];
        $row['cycleDays'] = (int) $row['cycleDays'];
        $row['equipment'] = $equipment;
        return $row;
    }

    /**
     * 查询计划
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $order 排序
     * @param string $limit LIMIT 片段
     * @return array<int,array<string,mixed>>
     */
    private static function queryPlans($where, $bind, $order = 'mp.nextDate ASC', $limit = '')
    {
        $sql = 'SELECT mp.*, e.code AS equipmentCode, e.name AS equipmentName'
            . ' FROM maintenance_plans mp LEFT JOIN equipment e ON e.id = mp.equipmentId'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY ' . $order . ($limit !== '' ? ' ' . $limit : '');
        $rows = Db::all($sql, $bind, 'maintenance_plans');
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatPlan($row);
        }
        return $list;
    }

    /**
     * 记录行 → 输出
     * @param array<string,mixed> $row 行
     * @return array<string,mixed>
     */
    private static function formatRecord($row)
    {
        $plan = null;
        if (isset($row['planName']) && $row['planName'] !== null) {
            $plan = array(
                'id' => (int) $row['planId'],
                'planName' => $row['planName'],
                'cycleType' => $row['cycleType'],
            );
        }
        $equipment = null;
        if (isset($row['equipmentCode']) && $row['equipmentCode'] !== null) {
            $equipment = array(
                'id' => (int) $row['equipmentId'],
                'code' => $row['equipmentCode'],
                'name' => $row['equipmentName'],
            );
        }
        $maintainer = null;
        if (isset($row['maintainerName']) && $row['maintainerName'] !== null) {
            $maintainer = array(
                'id' => (int) $row['maintainerId'],
                'name' => $row['maintainerName'],
                'department' => $row['maintainerDepartment'],
            );
        }
        unset(
            $row['planName'],
            $row['cycleType'],
            $row['equipmentCode'],
            $row['equipmentName'],
            $row['maintainerName'],
            $row['maintainerDepartment']
        );
        $row['id'] = (int) $row['id'];
        $row['planId'] = $row['planId'] === null ? null : (int) $row['planId'];
        $row['equipmentId'] = (int) $row['equipmentId'];
        $row['maintainerId'] = $row['maintainerId'] === null ? null : (int) $row['maintainerId'];
        $row['plan'] = $plan;
        $row['equipment'] = $equipment;
        $row['maintainer'] = $maintainer;
        return $row;
    }

    /**
     * 查询记录
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $limit LIMIT 片段
     * @return array<int,array<string,mixed>>
     */
    private static function queryRecords($where, $bind, $limit = '')
    {
        $sql = 'SELECT mr.*, mp.planName AS planName, mp.cycleType AS cycleType,'
            . ' e.code AS equipmentCode, e.name AS equipmentName,'
            . ' u.name AS maintainerName, u.department AS maintainerDepartment'
            . ' FROM maintenance_records mr'
            . ' LEFT JOIN maintenance_plans mp ON mp.id = mr.planId'
            . ' LEFT JOIN equipment e ON e.id = mr.equipmentId'
            . ' LEFT JOIN users u ON u.id = mr.maintainerId'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY mr.startTime DESC' . ($limit !== '' ? ' ' . $limit : '');
        $rows = Db::all($sql, $bind, 'maintenance_records');
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatRecord($row);
        }
        return $list;
    }

    /**
     * GET /api/equipment/maintenance/plans
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function plans($params)
    {
        list($page, $pageSize) = Http::pagination();
        $where = array();
        $bind = array();
        $equipmentId = Http::queryInt('equipmentId');
        $status = Http::query('status');
        $cycleType = Http::query('cycleType');
        if ($equipmentId !== null) {
            $where[] = 'mp.equipmentId = ?';
            $bind[] = $equipmentId;
        }
        if ($status !== null) {
            $where[] = 'mp.status = ?';
            $bind[] = $status;
        }
        if ($cycleType !== null) {
            $where[] = 'mp.cycleType = ?';
            $bind[] = $cycleType;
        }
        $whereSql = implode(' AND ', $where);

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM maintenance_plans mp' . ($whereSql !== '' ? ' WHERE ' . $whereSql : ''),
            $bind
        );
        $list = self::queryPlans(
            $whereSql,
            $bind,
            'mp.nextDate ASC',
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );

        $now = time();
        $deadline = $now + 7 * self::DAY_SECONDS;
        foreach ($list as $index => $plan) {
            $next = strtotime($plan['nextDate']);
            $list[$index]['isDue'] = $next <= $now;
            $list[$index]['dueSoon'] = $next <= $deadline;
        }

        Http::paginated($list, $total, $page, $pageSize, '查询维保计划列表成功');
    }

    /**
     * GET /api/equipment/maintenance/due
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function due($params)
    {
        $days = Http::queryInt('days');
        if ($days === null || $days < 1) {
            $days = 7;
        }
        if ($days > 365) {
            $days = 365;
        }
        $now = time();
        $deadline = $now + $days * self::DAY_SECONDS;
        list($deadlineStart) = Db::localDateRange(date('Y-m-d'));

        $list = self::queryPlans(
            'mp.status = ? AND mp.nextDate <= ?',
            array('active', Db::dateTimeParam(new DateTime('@' . $deadline))),
            'mp.nextDate ASC'
        );

        foreach ($list as $index => $plan) {
            $next = strtotime($plan['nextDate']);
            $overdueDays = $next < $now
                ? max(1, (int) ceil(($now - $next) / self::DAY_SECONDS))
                : 0;
            $list[$index]['isDue'] = $next <= $now;
            $list[$index]['dueSoon'] = true;
            $list[$index]['overdueDays'] = $overdueDays;
        }

        Http::ok(array('list' => $list), '查询维保到期提醒成功');
    }

    /**
     * POST /api/equipment/maintenance/plans
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createPlan($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'equipmentId' => 'required|int|positive',
            'planName' => 'required|string|min:1|max:100',
            'cycleType' => 'required|in:daily,weekly,monthly,quarterly,yearly',
            'nextDate' => 'required',
            'cycleDays' => 'int|positive',
            'status' => 'in:active,inactive',
        ));

        $equipmentId = (int) $body['equipmentId'];
        if (Db::val('SELECT COUNT(*) FROM equipment WHERE id = ?', array($equipmentId)) == 0) {
            throw new HttpException('设备不存在', 404);
        }

        $cycleType = (string) $body['cycleType'];
        $cycleDays = !empty($body['cycleDays'])
            ? (int) $body['cycleDays']
            : (isset(self::$cycleDays[$cycleType]) ? self::$cycleDays[$cycleType] : 0);

        $now = Db::nowParam();
        $id = Db::insert('maintenance_plans', array(
            'equipmentId' => $equipmentId,
            'planName' => $body['planName'],
            'cycleType' => $cycleType,
            'cycleDays' => $cycleDays,
            'nextDate' => Db::dateParam($body['nextDate']),
            'status' => isset($body['status']) && $body['status'] !== ''
                ? $body['status'] : 'active',
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        $list = self::queryPlans('mp.id = ?', array($id));
        Http::created($list[0], '创建维保计划成功');
    }

    /**
     * PUT /api/equipment/maintenance/plans/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updatePlan($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'planName' => 'string|min:1|max:100',
            'cycleType' => 'in:weekly,monthly,quarterly,yearly,daily',
            'cycleDays' => 'int|positive',
            'status' => 'in:active,inactive',
        ));

        $existing = Db::one('SELECT * FROM maintenance_plans WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('维保计划不存在', 404);
        }

        $data = array('updatedAt' => Db::nowParam());
        foreach (array('planName', 'cycleType', 'status') as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('nextDate', $body)) {
            $data['nextDate'] = Db::dateParam($body['nextDate']);
        }
        if (array_key_exists('cycleDays', $body)) {
            $data['cycleDays'] = (int) $body['cycleDays'];
        } elseif (array_key_exists('cycleType', $body)) {
            $default = isset(self::$cycleDays[$body['cycleType']])
                ? self::$cycleDays[$body['cycleType']] : 0;
            $data['cycleDays'] = $default > 0 ? $default : (int) $existing['cycleDays'];
        }

        Db::update('maintenance_plans', $data, 'id = ?', array($id));
        $list = self::queryPlans('mp.id = ?', array($id));
        Http::ok($list[0], '更新维保计划成功');
    }

    /**
     * DELETE /api/equipment/maintenance/plans/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deletePlan($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM maintenance_plans WHERE id = ?', array($id)) === 0) {
            throw new HttpException('维保计划不存在', 404);
        }
        Db::exec('DELETE FROM maintenance_plans WHERE id = ?', array($id));
        Http::ok(null, '删除维保计划成功（历史维保记录已保留）');
    }

    /**
     * GET /api/equipment/maintenance/records
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function records($params)
    {
        list($page, $pageSize) = Http::pagination();
        $where = array();
        $bind = array();
        $equipmentId = Http::queryInt('equipmentId');
        $planId = Http::queryInt('planId');
        $maintenanceType = Http::query('maintenanceType');
        if ($equipmentId !== null) {
            $where[] = 'mr.equipmentId = ?';
            $bind[] = $equipmentId;
        }
        if ($planId !== null) {
            $where[] = 'mr.planId = ?';
            $bind[] = $planId;
        }
        if ($maintenanceType !== null) {
            $where[] = 'mr.maintenanceType = ?';
            $bind[] = $maintenanceType;
        }
        $whereSql = implode(' AND ', $where);

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM maintenance_records mr'
            . ($whereSql !== '' ? ' WHERE ' . $whereSql : ''),
            $bind
        );
        $list = self::queryRecords(
            $whereSql,
            $bind,
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );

        Http::paginated($list, $total, $page, $pageSize, '查询维保记录列表成功');
    }

    /**
     * POST /api/equipment/maintenance/records
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createRecord($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'equipmentId' => 'required|int|positive',
            'maintenanceType' => 'required|in:preventive,corrective,emergency',
            'startTime' => 'required',
        ));

        $equipmentId = (int) $body['equipmentId'];
        $planId = !empty($body['planId']) ? (int) $body['planId'] : null;
        $maintainerId = !empty($body['maintainerId']) ? (int) $body['maintainerId'] : null;

        if (Db::val('SELECT COUNT(*) FROM equipment WHERE id = ?', array($equipmentId)) == 0) {
            throw new HttpException('设备不存在', 404);
        }
        if ($planId !== null && Db::val('SELECT COUNT(*) FROM maintenance_plans WHERE id = ?', array($planId)) == 0) {
            throw new HttpException('关联的维保计划不存在', 404);
        }
        if ($maintainerId !== null && Db::val('SELECT COUNT(*) FROM users WHERE id = ?', array($maintainerId)) == 0) {
            throw new HttpException('维保人员不存在', 404);
        }

        $result = Db::tx(function () use ($body, $equipmentId, $planId, $maintainerId) {
            $now = Db::nowParam();
            $recordId = Db::insert('maintenance_records', array(
                'planId' => $planId,
                'equipmentId' => $equipmentId,
                'maintenanceType' => $body['maintenanceType'],
                'maintainerId' => $maintainerId,
                'startTime' => Db::dateParam($body['startTime']),
                'endTime' => !empty($body['endTime']) ? Db::dateParam($body['endTime']) : null,
                'content' => isset($body['content']) ? (string) $body['content'] : '',
                'createdAt' => $now,
                'updatedAt' => $now,
            ));

            $planUpdated = null;
            if ($planId !== null) {
                $plan = Db::one('SELECT * FROM maintenance_plans WHERE id = ?', array($planId));
                if ($plan !== null) {
                    $cycle = (int) $plan['cycleDays'] > 0
                        ? (int) $plan['cycleDays']
                        : (isset(self::$cycleDays[$plan['cycleType']])
                            ? self::$cycleDays[$plan['cycleType']] : 0);
                    $nextDate = Db::addDays($plan['nextDate'], $cycle);
                    Db::update('maintenance_plans', array(
                        'nextDate' => $nextDate,
                        'updatedAt' => $now,
                    ), 'id = ?', array($planId));
                    $planList = self::queryPlans('mp.id = ?', array($planId));
                    $planUpdated = count($planList) > 0 ? $planList[0] : null;
                }
            }

            $records = self::queryRecords('mr.id = ?', array($recordId));
            return array('record' => $records[0], 'plan' => $planUpdated);
        });

        $message = $result['plan'] !== null
            ? '维保记录登记成功，下次维保日期已顺延至 ' . date('Y-m-d', strtotime($result['plan']['nextDate']))
            : '临时保养记录登记成功（未关联计划，不顺延）';
        Http::created($result, $message);
    }

    /**
     * PUT /api/equipment/maintenance/records/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateRecord($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'maintenanceType' => 'in:preventive,corrective,emergency',
            'content' => 'string|max:1000',
        ));

        if ((int) Db::val('SELECT COUNT(*) FROM maintenance_records WHERE id = ?', array($id)) === 0) {
            throw new HttpException('维保记录不存在', 404);
        }

        $data = array('updatedAt' => Db::nowParam());
        foreach (array('maintenanceType', 'content') as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('maintainerId', $body)) {
            $data['maintainerId'] = $body['maintainerId'] === null ? null : (int) $body['maintainerId'];
        }
        if (array_key_exists('startTime', $body)) {
            $data['startTime'] = Db::dateParam($body['startTime']);
        }
        if (array_key_exists('endTime', $body)) {
            $data['endTime'] = $body['endTime'] === null ? null : Db::dateParam($body['endTime']);
        }

        Db::update('maintenance_records', $data, 'id = ?', array($id));
        $list = self::queryRecords('mr.id = ?', array($id));
        Http::ok($list[0], '更新维保记录成功');
    }

    /**
     * DELETE /api/equipment/maintenance/records/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deleteRecord($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM maintenance_records WHERE id = ?', array($id)) === 0) {
            throw new HttpException('维保记录不存在', 404);
        }
        Db::exec('DELETE FROM maintenance_records WHERE id = ?', array($id));
        Http::ok(null, '删除维保记录成功');
    }
}

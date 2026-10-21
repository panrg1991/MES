<?php
/**
 * MES 系统 - 人员管理接口（班次 / 排班 / 工时）
 */

class PersonnelController
{
    /**
     * 四舍五入保留 2 位
     * @param float $value 值
     * @return float
     */
    private static function round2($value)
    {
        return round($value * 100) / 100;
    }

    /**
     * 计算工时（小时）：结束 <= 开始视为跨夜 +24h
     * @param DateTime $start 开始
     * @param DateTime|null $end 结束
     * @return float
     */
    private static function computeHours($start, $end)
    {
        if ($end === null) {
            return 0;
        }
        $diff = $end->getTimestamp() - $start->getTimestamp();
        if ($diff <= 0) {
            $diff += 86400;
        }
        return self::round2($diff / 3600);
    }

    /**
     * 读取用户关联信息
     * @param int|null $userId 用户 ID
     * @return array<string,mixed>|null
     */
    private static function userInfo($userId)
    {
        if ($userId === null) {
            return null;
        }
        $row = Db::one('SELECT id, name, department FROM users WHERE id = ?', array($userId));
        if ($row === null) {
            return null;
        }
        return array('id' => (int) $row['id'], 'name' => $row['name'], 'department' => $row['department']);
    }

    /**
     * 读取班次信息
     * @param int|null $shiftId 班次 ID
     * @return array<string,mixed>|null
     */
    private static function shiftInfo($shiftId)
    {
        if ($shiftId === null) {
            return null;
        }
        $row = Db::one('SELECT id, name, startTime, endTime FROM shifts WHERE id = ?', array($shiftId));
        if ($row === null) {
            return null;
        }
        return array(
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'startTime' => $row['startTime'],
            'endTime' => $row['endTime'],
        );
    }

    /**
     * GET /api/personnel/shifts
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function shifts($params)
    {
        $rows = Db::all('SELECT * FROM shifts ORDER BY startTime ASC', array(), 'shifts');
        foreach ($rows as $index => $row) {
            $rows[$index]['id'] = (int) $row['id'];
        }
        Http::ok(array('list' => $rows), '查询班次列表成功');
    }

    /**
     * POST /api/personnel/shifts
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createShift($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'name' => 'required|string|min:1|max:50',
            'startTime' => 'required|string',
            'endTime' => 'required|string',
        ));
        if ($body['startTime'] === $body['endTime']) {
            throw new HttpException('班次开始时间与结束时间不能相同', 400);
        }

        $now = Db::nowParam();
        $id = Db::insert('shifts', array(
            'name' => $body['name'],
            'startTime' => $body['startTime'],
            'endTime' => $body['endTime'],
            'description' => isset($body['description']) ? (string) $body['description'] : '',
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        $row = Db::one('SELECT * FROM shifts WHERE id = ?', array($id), 'shifts');
        $row['id'] = (int) $row['id'];
        Http::created($row, '创建班次成功');
    }

    /**
     * PUT /api/personnel/shifts/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateShift($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'name' => 'string|min:1|max:50',
        ));

        $existing = Db::one('SELECT * FROM shifts WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('班次不存在', 404);
        }

        $startTime = !empty($body['startTime']) ? $body['startTime'] : $existing['startTime'];
        $endTime = !empty($body['endTime']) ? $body['endTime'] : $existing['endTime'];
        if ($startTime === $endTime) {
            throw new HttpException('班次开始时间与结束时间不能相同', 400);
        }

        $data = array(
            'startTime' => $startTime,
            'endTime' => $endTime,
            'updatedAt' => Db::nowParam(),
        );
        foreach (array('name', 'description') as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        Db::update('shifts', $data, 'id = ?', array($id));
        $row = Db::one('SELECT * FROM shifts WHERE id = ?', array($id), 'shifts');
        $row['id'] = (int) $row['id'];
        Http::ok($row, '更新班次成功');
    }

    /**
     * DELETE /api/personnel/shifts/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deleteShift($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM shifts WHERE id = ?', array($id)) === 0) {
            throw new HttpException('班次不存在', 404);
        }
        Db::exec('DELETE FROM shifts WHERE id = ?', array($id));
        Http::ok(null, '删除班次成功');
    }

    /**
     * 排班行 → 输出
     * @param array<string,mixed> $row 行
     * @return array<string,mixed>
     */
    private static function formatSchedule($row)
    {
        $userId = $row['userId'] === null ? null : (int) $row['userId'];
        $shiftId = $row['shiftId'] === null ? null : (int) $row['shiftId'];
        return array(
            'id' => (int) $row['id'],
            'userId' => $userId,
            'shiftId' => $shiftId,
            'workStation' => $row['workStation'],
            'scheduleDate' => $row['scheduleDate'],
            'remark' => $row['remark'],
            'createdAt' => $row['createdAt'],
            'updatedAt' => $row['updatedAt'],
            'user' => self::userInfo($userId),
            'shift' => self::shiftInfo($shiftId),
        );
    }

    /**
     * 查询排班
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $limit LIMIT
     * @return array<int,array<string,mixed>>
     */
    private static function querySchedules($where, $bind, $limit = '', $order = 'ps.scheduleDate DESC, ps.shiftId ASC')
    {
        $rows = Db::all(
            'SELECT ps.* FROM personnel_schedules ps'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY ' . $order . ($limit !== '' ? ' ' . $limit : ''),
            $bind,
            'personnel_schedules'
        );
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatSchedule($row);
        }
        return $list;
    }

    /**
     * GET /api/personnel/schedules
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function schedules($params)
    {
        list($page, $pageSize) = Http::pagination();
        list($where, $bind) = self::scheduleFilters();

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM personnel_schedules ps' . ($where !== '' ? ' WHERE ' . $where : ''),
            $bind
        );
        $list = self::querySchedules(
            $where,
            $bind,
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );

        Http::paginated($list, $total, $page, $pageSize, '查询排班列表成功');
    }

    /**
     * 排班筛选条件
     * @return array{0:string,1:array<int,mixed>}
     */
    private static function scheduleFilters()
    {
        $where = array();
        $bind = array();
        $userId = Http::queryInt('userId');
        $shiftId = Http::queryInt('shiftId');
        $startDate = Http::query('startDate');
        $endDate = Http::query('endDate');

        if ($userId !== null) {
            $where[] = 'ps.userId = ?';
            $bind[] = $userId;
        }
        if ($shiftId !== null) {
            $where[] = 'ps.shiftId = ?';
            $bind[] = $shiftId;
        }
        if ($startDate !== null) {
            list($start) = Db::localDateRange($startDate);
            $where[] = 'ps.scheduleDate >= ?';
            $bind[] = $start;
        }
        if ($endDate !== null) {
            list(, $endExclusive) = Db::localDateRange($endDate);
            $where[] = 'ps.scheduleDate < ?';
            $bind[] = $endExclusive;
        }
        return array(implode(' AND ', $where), $bind);
    }

    /**
     * GET /api/personnel/schedules/calendar
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function calendar($params)
    {
        $startDate = Http::query('startDate');
        $endDate = Http::query('endDate');
        if ($startDate === null || $endDate === null) {
            throw new HttpException('参数校验失败', 400, array(
                array('field' => 'startDate', 'message' => '开始日期不能为空'),
                array('field' => 'endDate', 'message' => '结束日期不能为空'),
            ));
        }

        list($where, $bind) = self::scheduleFilters();
        $list = self::querySchedules($where, $bind, '', 'ps.scheduleDate ASC');

        $grouped = array();
        foreach ($list as $item) {
            $dateKey = Db::localDateKey($item['scheduleDate']);
            if (!isset($grouped[$dateKey])) {
                $grouped[$dateKey] = array();
            }
            $user = $item['user'];
            $shift = $item['shift'];
            $grouped[$dateKey][] = array(
                'id' => $item['id'],
                'userId' => $item['userId'],
                'userName' => $user !== null ? $user['name'] : ('用户#' . $item['userId']),
                'shiftId' => $item['shiftId'],
                'shiftName' => $shift !== null ? $shift['name'] : ('班次#' . $item['shiftId']),
                'shiftTimeRange' => $shift !== null
                    ? ($shift['startTime'] . '-' . $shift['endTime']) : '',
                'workStation' => $item['workStation'],
            );
        }
        ksort($grouped);
        $matrix = array();
        foreach ($grouped as $date => $items) {
            $matrix[] = array('date' => $date, 'items' => $items);
        }

        Http::ok(array('matrix' => $matrix), '查询排班日历成功');
    }

    /**
     * POST /api/personnel/schedules
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createSchedule($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'userId' => 'required|int|positive',
            'shiftId' => 'required|int|positive',
            'scheduleDate' => 'required',
        ));

        $userId = (int) $body['userId'];
        $shiftId = (int) $body['shiftId'];
        if ((int) Db::val('SELECT COUNT(*) FROM users WHERE id = ?', array($userId)) === 0) {
            throw new HttpException('用户不存在', 404);
        }
        if ((int) Db::val('SELECT COUNT(*) FROM shifts WHERE id = ?', array($shiftId)) === 0) {
            throw new HttpException('班次不存在', 404);
        }

        $scheduleDate = Db::dateParam($body['scheduleDate']);
        $duplicate = (int) Db::val(
            'SELECT COUNT(*) FROM personnel_schedules WHERE userId = ? AND shiftId = ? AND scheduleDate = ?',
            array($userId, $shiftId, $scheduleDate)
        );
        if ($duplicate > 0) {
            throw new HttpException('该人员在当日同班次已存在排班，请勿重复排班', 409);
        }

        $now = Db::nowParam();
        $id = Db::insert('personnel_schedules', array(
            'userId' => $userId,
            'shiftId' => $shiftId,
            'workStation' => isset($body['workStation']) ? (string) $body['workStation'] : '',
            'scheduleDate' => $scheduleDate,
            'remark' => isset($body['remark']) ? (string) $body['remark'] : '',
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        $list = self::querySchedules('ps.id = ?', array($id));
        Http::created($list[0], '新增排班成功');
    }

    /**
     * PUT /api/personnel/schedules/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateSchedule($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array());

        $existing = Db::one('SELECT * FROM personnel_schedules WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('排班记录不存在', 404);
        }

        $userId = !empty($body['userId']) ? (int) $body['userId'] : (int) $existing['userId'];
        $shiftId = !empty($body['shiftId']) ? (int) $body['shiftId'] : (int) $existing['shiftId'];
        $scheduleDate = !empty($body['scheduleDate'])
            ? Db::dateParam($body['scheduleDate'])
            : $existing['scheduleDate'];

        if ((int) Db::val('SELECT COUNT(*) FROM users WHERE id = ?', array($userId)) === 0) {
            throw new HttpException('用户不存在', 404);
        }
        if ((int) Db::val('SELECT COUNT(*) FROM shifts WHERE id = ?', array($shiftId)) === 0) {
            throw new HttpException('班次不存在', 404);
        }

        $duplicate = (int) Db::val(
            'SELECT COUNT(*) FROM personnel_schedules WHERE userId = ? AND shiftId = ?'
            . ' AND scheduleDate = ? AND id <> ?',
            array($userId, $shiftId, $scheduleDate, $id)
        );
        if ($duplicate > 0) {
            throw new HttpException('该人员在当日同班次已存在排班，无法调整', 409);
        }

        $data = array(
            'userId' => $userId,
            'shiftId' => $shiftId,
            'scheduleDate' => $scheduleDate,
            'updatedAt' => Db::nowParam(),
        );
        if (array_key_exists('workStation', $body)) {
            $data['workStation'] = (string) $body['workStation'];
        }
        if (array_key_exists('remark', $body)) {
            $data['remark'] = (string) $body['remark'];
        }

        Db::update('personnel_schedules', $data, 'id = ?', array($id));
        $list = self::querySchedules('ps.id = ?', array($id));
        Http::ok($list[0], '调整排班成功');
    }

    /**
     * DELETE /api/personnel/schedules/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deleteSchedule($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM personnel_schedules WHERE id = ?', array($id)) === 0) {
            throw new HttpException('排班记录不存在', 404);
        }
        Db::exec('DELETE FROM personnel_schedules WHERE id = ?', array($id));
        Http::ok(null, '删除排班成功');
    }

    /**
     * 工时行 → 输出
     * @param array<string,mixed> $row 行
     * @return array<string,mixed>
     */
    private static function formatWorkHours($row)
    {
        $userId = $row['userId'] === null ? null : (int) $row['userId'];
        $shiftId = $row['shiftId'] === null ? null : (int) $row['shiftId'];
        $workOrder = null;
        if (isset($row['orderNo']) && $row['orderNo'] !== null) {
            $workOrder = array(
                'id' => (int) $row['workOrderId'],
                'orderNo' => $row['orderNo'],
                'productName' => $row['productName'],
                'completedQty' => (int) $row['completedQty'],
            );
        }
        return array(
            'id' => (int) $row['id'],
            'userId' => $userId,
            'workOrderId' => (int) $row['workOrderId'],
            'shiftId' => $shiftId,
            'workDate' => $row['workDate'],
            'startTime' => $row['startTime'],
            'endTime' => $row['endTime'],
            'hours' => (float) $row['hours'],
            'createdAt' => $row['createdAt'],
            'updatedAt' => $row['updatedAt'],
            'user' => self::userInfo($userId),
            'shift' => self::shiftInfo($shiftId),
            'workOrder' => $workOrder,
        );
    }

    /**
     * 查询工时
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $limit LIMIT
     * @return array<int,array<string,mixed>>
     */
    private static function queryWorkHours($where, $bind, $limit = '', $order = 'wh.workDate DESC, wh.id DESC')
    {
        $rows = Db::all(
            'SELECT wh.*, wo.orderNo AS orderNo, wo.productName AS productName,'
            . ' wo.completedQty AS completedQty'
            . ' FROM work_hours_records wh LEFT JOIN work_orders wo ON wo.id = wh.workOrderId'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY ' . $order . ($limit !== '' ? ' ' . $limit : ''),
            $bind,
            'work_hours_records'
        );
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatWorkHours($row);
        }
        return $list;
    }

    /**
     * GET /api/personnel/work-hours
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function workHours($params)
    {
        list($page, $pageSize) = Http::pagination();
        list($where, $bind) = self::workHoursFilters();

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM work_hours_records wh' . ($where !== '' ? ' WHERE ' . $where : ''),
            $bind
        );
        $list = self::queryWorkHours(
            $where,
            $bind,
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );

        Http::paginated($list, $total, $page, $pageSize, '查询工时列表成功');
    }

    /**
     * 工时筛选条件
     * @return array{0:string,1:array<int,mixed>}
     */
    private static function workHoursFilters()
    {
        $where = array();
        $bind = array();
        $userId = Http::queryInt('userId');
        $workOrderId = Http::queryInt('workOrderId');
        $shiftId = Http::queryInt('shiftId');
        $startDate = Http::query('startDate');
        $endDate = Http::query('endDate');

        if ($userId !== null) {
            $where[] = 'wh.userId = ?';
            $bind[] = $userId;
        }
        if ($workOrderId !== null) {
            $where[] = 'wh.workOrderId = ?';
            $bind[] = $workOrderId;
        }
        if ($shiftId !== null) {
            $where[] = 'wh.shiftId = ?';
            $bind[] = $shiftId;
        }
        if ($startDate !== null) {
            list($start) = Db::localDateRange($startDate);
            $where[] = 'wh.workDate >= ?';
            $bind[] = $start;
        }
        if ($endDate !== null) {
            list(, $endExclusive) = Db::localDateRange($endDate);
            $where[] = 'wh.workDate < ?';
            $bind[] = $endExclusive;
        }
        return array(implode(' AND ', $where), $bind);
    }

    /**
     * POST /api/personnel/work-hours
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createWorkHours($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'workOrderId' => 'required|int|positive',
            'workDate' => 'required',
            'startTime' => 'required',
        ));

        $workOrderId = (int) $body['workOrderId'];
        $userId = !empty($body['userId']) ? (int) $body['userId'] : null;
        $shiftId = !empty($body['shiftId']) ? (int) $body['shiftId'] : null;

        if ($userId !== null && (int) Db::val('SELECT COUNT(*) FROM users WHERE id = ?', array($userId)) === 0) {
            throw new HttpException('用户不存在', 404);
        }
        if ((int) Db::val('SELECT COUNT(*) FROM work_orders WHERE id = ?', array($workOrderId)) === 0) {
            throw new HttpException('工单不存在', 404);
        }
        if ($shiftId !== null && (int) Db::val('SELECT COUNT(*) FROM shifts WHERE id = ?', array($shiftId)) === 0) {
            throw new HttpException('班次不存在', 404);
        }

        $start = Db::parseDate($body['startTime']);
        $end = !empty($body['endTime']) ? Db::parseDate($body['endTime']) : null;
        $hours = self::computeHours($start, $end);
        $now = Db::nowParam();

        $id = Db::insert('work_hours_records', array(
            'userId' => $userId,
            'workOrderId' => $workOrderId,
            'shiftId' => $shiftId,
            'workDate' => Db::dateParam($body['workDate']),
            'startTime' => Db::dateTimeParam($start),
            'endTime' => $end === null ? null : Db::dateTimeParam($end),
            'hours' => $hours,
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        $list = self::queryWorkHours('wh.id = ?', array($id));
        Http::created($list[0], '录入工时成功（自动计算 ' . $hours . ' 小时）');
    }

    /**
     * PUT /api/personnel/work-hours/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateWorkHours($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array());

        $existing = Db::one('SELECT * FROM work_hours_records WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('工时记录不存在', 404);
        }

        $start = !empty($body['startTime']) ? Db::parseDate($body['startTime']) : Db::rawToDate($existing['startTime']);
        if (array_key_exists('endTime', $body)) {
            $end = !empty($body['endTime']) ? Db::parseDate($body['endTime']) : null;
        } else {
            $end = $existing['endTime'] === null ? null : Db::rawToDate($existing['endTime']);
        }
        if ($start === null) {
            throw new HttpException('开始时间不能为空', 400);
        }
        $hours = self::computeHours($start, $end);

        $data = array(
            'startTime' => Db::dateTimeParam($start),
            'endTime' => $end === null ? null : Db::dateTimeParam($end),
            'hours' => $hours,
            'updatedAt' => Db::nowParam(),
        );
        if (array_key_exists('userId', $body)) {
            $data['userId'] = !empty($body['userId']) ? (int) $body['userId'] : null;
        }
        if (array_key_exists('shiftId', $body)) {
            $data['shiftId'] = !empty($body['shiftId']) ? (int) $body['shiftId'] : null;
        }
        if (!empty($body['workOrderId'])) {
            $data['workOrderId'] = (int) $body['workOrderId'];
        }
        if (!empty($body['workDate'])) {
            $data['workDate'] = Db::dateParam($body['workDate']);
        }

        Db::update('work_hours_records', $data, 'id = ?', array($id));
        $list = self::queryWorkHours('wh.id = ?', array($id));
        Http::ok($list[0], '更新工时成功');
    }

    /**
     * DELETE /api/personnel/work-hours/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deleteWorkHours($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM work_hours_records WHERE id = ?', array($id)) === 0) {
            throw new HttpException('工时记录不存在', 404);
        }
        Db::exec('DELETE FROM work_hours_records WHERE id = ?', array($id));
        Http::ok(null, '删除工时记录成功');
    }

    /**
     * GET /api/personnel/work-hours/summary
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function workHoursSummary($params)
    {
        $dimension = Http::query('dimension');
        Validate::queryEnum('dimension', array('user', 'shift', 'date', 'workOrder'));
        if ($dimension === null) {
            $dimension = 'workOrder';
        }

        $data = self::summaryData(
            $dimension,
            Http::query('startDate'),
            Http::query('endDate')
        );
        Http::ok($data, '查询工时汇总成功');
    }

    /**
     * 工时汇总数据（供报表中心复用，避免双口径）
     * @param string $dimension 维度 user|shift|date|workOrder
     * @param string|null $startDate 开始日期
     * @param string|null $endDate 结束日期
     * @return array<string,mixed>
     */
    public static function summaryData($dimension, $startDate, $endDate)
    {
        $where = array();
        $bind = array();
        if ($startDate !== null && $startDate !== '') {
            list($start) = Db::localDateRange($startDate);
            $where[] = 'wh.workDate >= ?';
            $bind[] = $start;
        }
        if ($endDate !== null && $endDate !== '') {
            list(, $endExclusive) = Db::localDateRange($endDate);
            $where[] = 'wh.workDate < ?';
            $bind[] = $endExclusive;
        }
        $records = self::queryWorkHours(implode(' AND ', $where), $bind, '', 'wh.workDate ASC');

        $groups = array();
        foreach ($records as $record) {
            if ($dimension === 'user') {
                $key = $record['userId'] === null ? 'unspecified' : ('user-' . $record['userId']);
                $name = $record['user'] !== null ? $record['user']['name'] : '未指定人员';
            } elseif ($dimension === 'shift') {
                $key = $record['shiftId'] === null ? 'unspecified' : ('shift-' . $record['shiftId']);
                $name = $record['shift'] !== null ? $record['shift']['name'] : '未指定班次';
            } elseif ($dimension === 'date') {
                $key = Db::localDateKey($record['workDate']);
                $name = $key;
            } else {
                $key = 'wo-' . $record['workOrderId'];
                $name = $record['workOrder'] !== null
                    ? $record['workOrder']['orderNo'] : ('工单#' . $record['workOrderId']);
            }

            if (!isset($groups[$key])) {
                $groups[$key] = array(
                    'dimensionKey' => $key,
                    'dimensionName' => $name,
                    'totalHours' => 0,
                    'recordCount' => 0,
                    'userIds' => array(),
                    'workOrderIds' => array(),
                    'dates' => array(),
                    'completedQty' => 0,
                );
            }
            $groups[$key]['totalHours'] = self::round2($groups[$key]['totalHours'] + (float) $record['hours']);
            $groups[$key]['recordCount'] += 1;
            if ($record['userId'] !== null) {
                $groups[$key]['userIds'][$record['userId']] = true;
            }
            $groups[$key]['workOrderIds'][$record['workOrderId']] = true;
            $groups[$key]['dates'][Db::localDateKey($record['workDate'])] = true;

            $completed = $record['workOrder'] !== null ? (int) $record['workOrder']['completedQty'] : 0;
            if ($dimension === 'workOrder') {
                $groups[$key]['completedQty'] = $completed;
            } else {
                $groups[$key]['completedQty'] += $completed;
            }
        }

        $list = array();
        foreach ($groups as $group) {
            $row = array(
                'dimensionKey' => $group['dimensionKey'],
                'dimensionName' => $group['dimensionName'],
                'totalHours' => $group['totalHours'],
                'recordCount' => $group['recordCount'],
            );
            if ($dimension === 'user') {
                $row['workOrderCount'] = count($group['workOrderIds']);
                $row['avgHoursPerDay'] = count($group['dates']) > 0
                    ? self::round2($group['totalHours'] / count($group['dates'])) : 0;
            }
            if ($dimension === 'shift') {
                $row['avgHoursPerRecord'] = $group['recordCount'] > 0
                    ? self::round2($group['totalHours'] / $group['recordCount']) : 0;
                $row['userCount'] = count($group['userIds']);
            }
            if ($dimension === 'workOrder') {
                $row['hoursPerUnit'] = $group['completedQty'] > 0
                    ? self::round2($group['totalHours'] / $group['completedQty']) : null;
            }
            $list[] = $row;
        }

        usort($list, function ($a, $b) {
            if ($a['totalHours'] == $b['totalHours']) {
                return 0;
            }
            return $a['totalHours'] < $b['totalHours'] ? 1 : -1;
        });

        $totalHours = 0;
        foreach ($records as $record) {
            $totalHours += (float) $record['hours'];
        }

        return array(
            'list' => $list,
            'totalHours' => self::round2($totalHours),
            'recordCount' => count($records),
        );
    }
}

<?php
/**
 * MES 系统 - 生产排程接口（甘特排程 / 冲突检测）
 */

class ScheduleController
{
    /** @var array<string,array<int,string>> 排程状态机 */
    private static $transitions = array(
        'planned' => array('in_progress', 'cancelled'),
        'in_progress' => array('completed', 'cancelled'),
        'completed' => array(),
        'cancelled' => array(),
    );

    /**
     * 排程行 → 输出结构
     * @param array<string,mixed> $row 排程行（含关联别名）
     * @return array<string,mixed>
     */
    private static function format($row)
    {
        $schedule = array(
            'id' => (int) $row['id'],
            'workOrderId' => (int) $row['workOrderId'],
            'equipmentId' => $row['equipmentId'] === null ? null : (int) $row['equipmentId'],
            'plannedStart' => $row['plannedStart'],
            'plannedEnd' => $row['plannedEnd'],
            'actualStart' => $row['actualStart'],
            'actualEnd' => $row['actualEnd'],
            'status' => $row['status'],
            'createdAt' => $row['createdAt'],
            'updatedAt' => $row['updatedAt'],
            'workOrder' => $row['orderNo'] === null ? null : array(
                'id' => (int) $row['workOrderId'],
                'orderNo' => $row['orderNo'],
                'productName' => $row['productName'],
                'status' => $row['orderStatus'],
            ),
            'equipment' => $row['equipmentCode'] === null ? null : array(
                'id' => (int) $row['equipmentId'],
                'code' => $row['equipmentCode'],
                'name' => $row['equipmentName'],
            ),
        );
        return $schedule;
    }

    /**
     * 查询排程（含工单/设备信息）
     * @param string $where WHERE 子句
     * @param array<int,mixed> $bind 参数
     * @param string $order ORDER BY
     * @param int|null $limit 限制
     * @return array<int,array<string,mixed>>
     */
    private static function query($where, $bind, $order = 'ps.plannedStart ASC', $limit = null)
    {
        $sql = 'SELECT ps.*, wo.orderNo AS orderNo, wo.productName AS productName,'
            . ' wo.status AS orderStatus, e.code AS equipmentCode, e.name AS equipmentName'
            . ' FROM production_schedules ps'
            . ' LEFT JOIN work_orders wo ON wo.id = ps.workOrderId'
            . ' LEFT JOIN equipment e ON e.id = ps.equipmentId'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY ' . $order;
        if ($limit !== null) {
            $sql .= ' LIMIT ' . (int) $limit;
        }
        $rows = Db::all($sql, $bind, 'production_schedules');
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::format($row);
        }
        return $list;
    }

    /**
     * 查询同设备时段重叠排程
     * @param int $equipmentId 设备 ID
     * @param mixed $start 新开始（数据库参数）
     * @param mixed $end 新结束（数据库参数）
     * @param int|null $excludeId 排除排程
     * @return array<int,array<string,mixed>>
     */
    private static function overlaps($equipmentId, $start, $end, $excludeId = null)
    {
        $sql = 'ps.equipmentId = ? AND ps.status <> ? AND ps.plannedStart < ? AND ps.plannedEnd > ?';
        $bind = array($equipmentId, 'cancelled', $end, $start);
        if ($excludeId !== null) {
            $sql .= ' AND ps.id <> ?';
            $bind[] = $excludeId;
        }
        return self::query($sql, $bind);
    }

    /**
     * GET /api/production/schedules
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function index($params)
    {
        $startDate = Http::query('startDate');
        $endDate = Http::query('endDate');
        $equipmentId = Http::queryInt('equipmentId');
        $status = Http::query('status');
        $workOrderId = Http::queryInt('workOrderId');
        Validate::queryEnum('status', array('planned', 'in_progress', 'completed', 'cancelled'));

        $where = array();
        $bind = array();
        $hasWindow = $startDate !== null || $endDate !== null;
        if ($hasWindow || $workOrderId === null) {
            $windowStart = $startDate !== null
                ? Db::dateParam($startDate)
                : Db::dateParam(date('Y-m-d'));
            if ($endDate !== null) {
                $windowEnd = Db::dateParam($endDate);
                $endDateTime = Db::parseDate($endDate);
                // 仅给日期时按「含当日」处理
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $endDate)) {
                    $endDateTime->modify('+1 day');
                    $windowEnd = Db::dateTimeParam($endDateTime);
                }
            } else {
                $startDateTime = Db::parseDate($startDate !== null ? $startDate : date('Y-m-d'));
                $startDateTime->modify('+14 days');
                $windowEnd = Db::dateTimeParam($startDateTime);
            }
            $where[] = 'ps.plannedStart < ?';
            $bind[] = $windowEnd;
            $where[] = 'ps.plannedEnd > ?';
            $bind[] = $windowStart;
        }
        if ($equipmentId !== null) {
            $where[] = 'ps.equipmentId = ?';
            $bind[] = $equipmentId;
        }
        if ($status !== null) {
            $where[] = 'ps.status = ?';
            $bind[] = $status;
        }
        if ($workOrderId !== null) {
            $where[] = 'ps.workOrderId = ?';
            $bind[] = $workOrderId;
        }

        $whereSql = implode(' AND ', $where);
        $list = self::query($whereSql, $bind);
        $total = count($list);
        Http::ok(array('list' => $list, 'total' => $total), '查询排程列表成功');
    }

    /**
     * GET /api/production/schedules/conflicts
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function conflicts($params)
    {
        $equipmentId = Http::queryInt('equipmentId');
        $plannedStart = Http::query('plannedStart');
        $plannedEnd = Http::query('plannedEnd');
        $excludeId = Http::queryInt('excludeId');

        if ($equipmentId === null || $plannedStart === null || $plannedEnd === null) {
            throw new HttpException('参数校验失败', 400, array(
                array('field' => 'equipmentId', 'message' => '设备不能为空'),
                array('field' => 'plannedStart', 'message' => '计划开始时间不能为空'),
                array('field' => 'plannedEnd', 'message' => '计划结束时间不能为空'),
            ));
        }

        $start = Db::dateParam($plannedStart);
        $end = Db::dateParam($plannedEnd);
        Http::ok(array(
            'conflicts' => self::overlaps($equipmentId, $start, $end, $excludeId),
        ), '冲突检测完成');
    }

    /**
     * POST /api/production/schedules
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function store($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'workOrderId' => 'required|int|positive',
            'plannedStart' => 'required',
            'plannedEnd' => 'required',
        ));

        $workOrderId = (int) $body['workOrderId'];
        $equipmentId = !empty($body['equipmentId']) ? (int) $body['equipmentId'] : null;
        $plannedStart = Db::dateParam($body['plannedStart']);
        $plannedEnd = Db::dateParam($body['plannedEnd']);

        if (Db::val('SELECT COUNT(*) FROM work_orders WHERE id = ?', array($workOrderId)) == 0) {
            throw new HttpException('工单不存在', 404);
        }
        if ($equipmentId !== null
            && Db::val('SELECT COUNT(*) FROM equipment WHERE id = ?', array($equipmentId)) == 0) {
            throw new HttpException('设备不存在', 404);
        }

        $startDate = Db::parseDate($body['plannedStart']);
        $endDate = Db::parseDate($body['plannedEnd']);
        if ($startDate >= $endDate) {
            throw new HttpException('计划开始时间必须早于计划结束时间', 400);
        }

        $scheduleId = Db::tx(function () use ($workOrderId, $equipmentId, $plannedStart, $plannedEnd) {
            if ($equipmentId !== null) {
                $conflicts = self::overlaps($equipmentId, $plannedStart, $plannedEnd);
                if (count($conflicts) > 0) {
                    $orderNos = array();
                    foreach ($conflicts as $conflict) {
                        $orderNos[] = $conflict['workOrder'] !== null
                            ? $conflict['workOrder']['orderNo'] : ('#' . $conflict['id']);
                    }
                    throw new HttpException(
                        '排程冲突：与工单 ' . implode('、', $orderNos) . ' 在同一设备时段重叠',
                        409,
                        null,
                        $conflicts
                    );
                }
            }

            $now = Db::nowParam();
            return Db::insert('production_schedules', array(
                'workOrderId' => $workOrderId,
                'equipmentId' => $equipmentId,
                'plannedStart' => $plannedStart,
                'plannedEnd' => $plannedEnd,
                'actualStart' => null,
                'actualEnd' => null,
                'status' => 'planned',
                'createdAt' => $now,
                'updatedAt' => $now,
            ));
        });

        $list = self::query('ps.id = ?', array($scheduleId));
        Http::created(array('schedule' => $list[0]), '创建排程成功');
    }

    /**
     * PATCH /api/production/schedules/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function update($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array());

        $existing = Db::one('SELECT * FROM production_schedules WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('排程不存在', 404);
        }

        $equipmentId = array_key_exists('equipmentId', $body)
            ? (!empty($body['equipmentId']) ? (int) $body['equipmentId'] : null)
            : ($existing['equipmentId'] === null ? null : (int) $existing['equipmentId']);
        $plannedStart = !empty($body['plannedStart'])
            ? Db::dateParam($body['plannedStart'])
            : $existing['plannedStart'];
        $plannedEnd = !empty($body['plannedEnd'])
            ? Db::dateParam($body['plannedEnd'])
            : $existing['plannedEnd'];

        $startDate = Db::rawToDate($plannedStart);
        $endDate = Db::rawToDate($plannedEnd);
        if ($startDate >= $endDate) {
            throw new HttpException('计划开始时间必须早于计划结束时间', 400);
        }

        Db::tx(function () use ($id, $equipmentId, $plannedStart, $plannedEnd) {
            if ($equipmentId !== null) {
                $conflicts = self::overlaps($equipmentId, $plannedStart, $plannedEnd, $id);
                if (count($conflicts) > 0) {
                    $orderNos = array();
                    foreach ($conflicts as $conflict) {
                        $orderNos[] = $conflict['workOrder'] !== null
                            ? $conflict['workOrder']['orderNo'] : ('#' . $conflict['id']);
                    }
                    throw new HttpException(
                        '排程冲突：与工单 ' . implode('、', $orderNos) . ' 在同一设备时段重叠',
                        409,
                        null,
                        $conflicts
                    );
                }
            }
            Db::update('production_schedules', array(
                'equipmentId' => $equipmentId,
                'plannedStart' => $plannedStart,
                'plannedEnd' => $plannedEnd,
                'updatedAt' => Db::nowParam(),
            ), 'id = ?', array($id));
            return null;
        });

        $list = self::query('ps.id = ?', array($id));
        Http::ok(array('schedule' => $list[0], 'conflicts' => array()), '调整排程成功');
    }

    /**
     * PATCH /api/production/schedules/:id/status
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateStatus($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'status' => 'required|in:planned,in_progress,completed,cancelled',
        ));

        $existing = Db::one('SELECT * FROM production_schedules WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('排程不存在', 404);
        }

        $status = (string) $body['status'];
        $allowed = isset(self::$transitions[$existing['status']])
            ? self::$transitions[$existing['status']] : array();
        if (!in_array($status, $allowed, true)) {
            throw new HttpException(
                '非法状态流转：' . $existing['status'] . ' 不能变更为 ' . $status,
                400
            );
        }

        $now = Db::nowParam();
        $data = array('status' => $status, 'updatedAt' => $now);
        if ($status === 'in_progress' && $existing['actualStart'] === null) {
            $data['actualStart'] = $now;
        }
        if ($status === 'completed') {
            $data['actualEnd'] = $now;
        }

        $affected = Db::update(
            'production_schedules',
            $data,
            'id = ? AND status = ?',
            array($id, $existing['status'])
        );
        if ($affected === 0) {
            throw new HttpException('排程状态已被其他操作修改，请刷新后重试', 409);
        }

        $list = self::query('ps.id = ?', array($id));
        Http::ok(array('schedule' => $list[0]), '排程状态流转成功');
    }

    /**
     * DELETE /api/production/schedules/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroy($params)
    {
        $id = (int) $params['id'];
        $exists = Db::val('SELECT COUNT(*) FROM production_schedules WHERE id = ?', array($id));
        if ((int) $exists === 0) {
            throw new HttpException('排程不存在', 404);
        }
        Db::exec('DELETE FROM production_schedules WHERE id = ?', array($id));
        Http::ok(null, '删除排程成功');
    }
}

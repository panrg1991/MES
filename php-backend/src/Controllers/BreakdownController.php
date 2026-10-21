<?php
/**
 * MES 系统 - 设备故障维修接口（报修 / 复机 / 统计）
 */

class BreakdownController
{
    /**
     * 故障行 → 输出
     * @param array<string,mixed> $row 行
     * @return array<string,mixed>
     */
    private static function format($row)
    {
        $equipment = null;
        if (isset($row['equipmentCode']) && $row['equipmentCode'] !== null) {
            $equipment = array(
                'id' => (int) $row['equipmentId'],
                'code' => $row['equipmentCode'],
                'name' => $row['equipmentName'],
            );
        }
        $repairer = null;
        if (isset($row['repairerName']) && $row['repairerName'] !== null) {
            $repairer = array(
                'id' => (int) $row['repairerId'],
                'name' => $row['repairerName'],
                'department' => $row['repairerDepartment'],
            );
        }
        unset($row['equipmentCode'], $row['equipmentName'], $row['repairerName'], $row['repairerDepartment']);
        $row['id'] = (int) $row['id'];
        $row['equipmentId'] = (int) $row['equipmentId'];
        $row['repairerId'] = $row['repairerId'] === null ? null : (int) $row['repairerId'];
        $row['downtimeDuration'] = (int) $row['downtimeDuration'];
        $row['equipment'] = $equipment;
        $row['repairer'] = $repairer;
        return $row;
    }

    /**
     * 查询故障记录
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $limit LIMIT 片段
     * @param string $order 排序
     * @return array<int,array<string,mixed>>
     */
    private static function query($where, $bind, $limit = '', $order = 'br.occurredAt DESC')
    {
        $sql = 'SELECT br.*, e.code AS equipmentCode, e.name AS equipmentName,'
            . ' u.name AS repairerName, u.department AS repairerDepartment'
            . ' FROM breakdown_records br'
            . ' LEFT JOIN equipment e ON e.id = br.equipmentId'
            . ' LEFT JOIN users u ON u.id = br.repairerId'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY ' . $order . ($limit !== '' ? ' ' . $limit : '');
        $rows = Db::all($sql, $bind, 'breakdown_records');
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::format($row);
        }
        return $list;
    }

    /**
     * 故障筛选条件
     * @return array{0:string,1:array<int,mixed>}
     */
    private static function filters()
    {
        $where = array();
        $bind = array();
        $equipmentId = Http::queryInt('equipmentId');
        $status = Http::query('status');
        $startDate = Http::query('startDate');
        $endDate = Http::query('endDate');

        if ($equipmentId !== null) {
            $where[] = 'br.equipmentId = ?';
            $bind[] = $equipmentId;
        }
        if ($status === 'pending') {
            $where[] = 'br.repairedAt IS NULL';
        } elseif ($status === 'repaired') {
            $where[] = 'br.repairedAt IS NOT NULL';
        }
        if ($startDate !== null) {
            list($start) = Db::localDateRange($startDate);
            $where[] = 'br.occurredAt >= ?';
            $bind[] = $start;
        }
        if ($endDate !== null) {
            list(, $endExclusive) = Db::localDateRange($endDate);
            $where[] = 'br.occurredAt < ?';
            $bind[] = $endExclusive;
        }
        return array(implode(' AND ', $where), $bind);
    }

    /**
     * GET /api/equipment/breakdowns
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function index($params)
    {
        list($page, $pageSize) = Http::pagination();
        list($where, $bind) = self::filters();

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM breakdown_records br' . ($where !== '' ? ' WHERE ' . $where : ''),
            $bind
        );
        $list = self::query(
            $where,
            $bind,
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );

        Http::paginated($list, $total, $page, $pageSize, '查询故障记录列表成功');
    }

    /**
     * GET /api/equipment/breakdowns/statistics
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function statistics($params)
    {
        $where = array();
        $bind = array();
        $equipmentId = Http::queryInt('equipmentId');
        $startDate = Http::query('startDate');
        $endDate = Http::query('endDate');
        if ($equipmentId !== null) {
            $where[] = 'equipmentId = ?';
            $bind[] = $equipmentId;
        }
        if ($startDate !== null) {
            list($start) = Db::localDateRange($startDate);
            $where[] = 'occurredAt >= ?';
            $bind[] = $start;
        }
        if ($endDate !== null) {
            list(, $endExclusive) = Db::localDateRange($endDate);
            $where[] = 'occurredAt < ?';
            $bind[] = $endExclusive;
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $records = Db::all(
            'SELECT br.equipmentId, br.faultType, br.downtimeDuration,'
            . ' e.code AS equipmentCode, e.name AS equipmentName'
            . ' FROM breakdown_records br LEFT JOIN equipment e ON e.id = br.equipmentId'
            . $whereSql,
            $bind
        );

        $totalDowntime = 0;
        $equipmentMap = array();
        $typeMap = array();
        foreach ($records as $record) {
            $downtime = (int) $record['downtimeDuration'];
            $totalDowntime += $downtime;
            $equipmentKey = (int) $record['equipmentId'];
            if (!isset($equipmentMap[$equipmentKey])) {
                $equipmentMap[$equipmentKey] = array(
                    'equipmentId' => $equipmentKey,
                    'equipmentCode' => $record['equipmentCode'] === null ? '' : $record['equipmentCode'],
                    'equipmentName' => $record['equipmentName'] === null ? '' : $record['equipmentName'],
                    'faultCount' => 0,
                    'totalDowntime' => 0,
                );
            }
            $equipmentMap[$equipmentKey]['faultCount'] += 1;
            $equipmentMap[$equipmentKey]['totalDowntime'] += $downtime;

            $typeKey = $record['faultType'];
            if (!isset($typeMap[$typeKey])) {
                $typeMap[$typeKey] = array(
                    'faultType' => $typeKey,
                    'count' => 0,
                    'totalDowntime' => 0,
                );
            }
            $typeMap[$typeKey]['count'] += 1;
            $typeMap[$typeKey]['totalDowntime'] += $downtime;
        }

        $top = array_values($equipmentMap);
        usort($top, function ($a, $b) {
            if ($b['faultCount'] !== $a['faultCount']) {
                return $b['faultCount'] - $a['faultCount'];
            }
            return $b['totalDowntime'] - $a['totalDowntime'];
        });
        $top = array_slice($top, 0, 5);

        $byType = array_values($typeMap);
        usort($byType, function ($a, $b) {
            return $b['count'] - $a['count'];
        });

        Http::ok(array(
            'topFaultEquipments' => $top,
            'totalDowntime' => $totalDowntime,
            'byFaultType' => $byType,
        ), '查询故障统计成功');
    }

    /**
     * POST /api/equipment/breakdowns
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function store($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'equipmentId' => 'required|int|positive',
            'faultType' => 'required|string|min:1|max:50',
            'occurredAt' => 'required',
        ));

        $equipmentId = (int) $body['equipmentId'];
        $equipment = Db::one('SELECT id, status FROM equipment WHERE id = ?', array($equipmentId));
        if ($equipment === null) {
            throw new HttpException('设备不存在', 404);
        }
        $current = Auth::user();
        $operatorId = (int) $current['userId'];

        $record = Db::tx(function () use ($body, $equipmentId, $equipment, $operatorId) {
            $now = Db::nowParam();
            $id = Db::insert('breakdown_records', array(
                'equipmentId' => $equipmentId,
                'faultType' => $body['faultType'],
                'faultDescription' => isset($body['faultDescription']) ? (string) $body['faultDescription'] : '',
                'occurredAt' => Db::dateParam($body['occurredAt']),
                'repairedAt' => null,
                'repairerId' => null,
                'repairMethod' => '',
                'downtimeDuration' => 0,
                'createdAt' => $now,
                'updatedAt' => $now,
            ));

            if ($equipment['status'] !== 'fault') {
                EquipmentController::changeStatusWithLog($equipmentId, 'fault', $operatorId, '故障报修');
            }

            $list = self::query('br.id = ?', array($id));
            return $list[0];
        });

        Http::created($record, '故障报修成功，设备状态已置为故障');
    }

    /**
     * PATCH /api/equipment/breakdowns/:id/repair
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function repair($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array('repairedAt' => 'required'));

        $record = Db::one(
            'SELECT br.*, e.status AS equipmentStatus FROM breakdown_records br'
            . ' LEFT JOIN equipment e ON e.id = br.equipmentId WHERE br.id = ?',
            array($id)
        );
        if ($record === null) {
            throw new HttpException('故障记录不存在', 404);
        }
        if ($record['repairedAt'] !== null) {
            throw new HttpException('该故障已完成维修，请勿重复提交', 400);
        }

        $repairedAt = Db::parseDate($body['repairedAt']);
        $occurredAt = Db::rawToDate($record['occurredAt']);
        if ($repairedAt <= $occurredAt) {
            throw new HttpException('修复时间必须晚于故障发生时间（停机时长不可为负）', 400);
        }
        $downtimeDuration = (int) round(($repairedAt->getTimestamp() - $occurredAt->getTimestamp()) / 60);

        $activeSchedule = Db::val(
            'SELECT COUNT(*) FROM production_schedules WHERE equipmentId = ? AND status = ?',
            array((int) $record['equipmentId'], 'in_progress')
        );
        $restoreStatus = (int) $activeSchedule > 0 ? 'running' : 'idle';
        $current = Auth::user();
        $operatorId = (int) $current['userId'];

        $updated = Db::tx(function () use ($id, $body, $repairedAt, $downtimeDuration, $record, $restoreStatus, $operatorId) {
            $now = Db::nowParam();
            Db::update('breakdown_records', array(
                'repairerId' => !empty($body['repairerId']) ? (int) $body['repairerId'] : null,
                'repairMethod' => isset($body['repairMethod']) ? (string) $body['repairMethod'] : '',
                'repairedAt' => Db::dateTimeParam($repairedAt),
                'downtimeDuration' => $downtimeDuration,
                'updatedAt' => $now,
            ), 'id = ?', array($id));

            if ($record['equipmentStatus'] === 'fault') {
                EquipmentController::changeStatusWithLog(
                    (int) $record['equipmentId'],
                    $restoreStatus,
                    $operatorId,
                    '维修完成复机'
                );
            }

            $list = self::query('br.id = ?', array($id));
            return $list[0];
        });

        Http::ok(
            $updated,
            '维修完成，停机时长 ' . $downtimeDuration . ' 分钟，设备已复机'
        );
    }

    /**
     * PUT /api/equipment/breakdowns/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function update($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'faultType' => 'string|min:1|max:50',
            'faultDescription' => 'string|max:500',
            'repairMethod' => 'string|max:500',
        ));

        $record = Db::one('SELECT * FROM breakdown_records WHERE id = ?', array($id));
        if ($record === null) {
            throw new HttpException('故障记录不存在', 404);
        }

        $data = array('updatedAt' => Db::nowParam());
        foreach (array('faultType', 'faultDescription', 'repairMethod') as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('repairerId', $body)) {
            $data['repairerId'] = $body['repairerId'] === null ? null : (int) $body['repairerId'];
        }
        if (array_key_exists('occurredAt', $body)) {
            $data['occurredAt'] = Db::dateParam($body['occurredAt']);
            if ($record['repairedAt'] !== null) {
                $repairedAt = Db::rawToDate($record['repairedAt']);
                $occurredAt = Db::parseDate($body['occurredAt']);
                $diff = (int) round(($repairedAt->getTimestamp() - $occurredAt->getTimestamp()) / 60);
                if ($diff < 0) {
                    throw new HttpException('修复时间必须晚于故障发生时间（停机时长不可为负）', 400);
                }
                $data['downtimeDuration'] = $diff;
            }
        }

        Db::update('breakdown_records', $data, 'id = ?', array($id));
        $list = self::query('br.id = ?', array($id));
        Http::ok($list[0], '更新故障记录成功');
    }

    /**
     * DELETE /api/equipment/breakdowns/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroy($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM breakdown_records WHERE id = ?', array($id)) === 0) {
            throw new HttpException('故障记录不存在', 404);
        }
        Db::exec('DELETE FROM breakdown_records WHERE id = ?', array($id));
        Http::ok(null, '删除故障记录成功');
    }
}

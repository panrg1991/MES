<?php
/**
 * MES 系统 - 设备管理接口
 */

class EquipmentController
{
    /**
     * 设备行 → 输出（含车间）
     * @param array<string,mixed> $row 行
     * @return array<string,mixed>
     */
    private static function format($row)
    {
        $workshop = null;
        if (isset($row['workshopName']) && $row['workshopName'] !== null) {
            $workshop = array(
                'id' => (int) $row['workshopId'],
                'name' => $row['workshopName'],
                'code' => $row['workshopCode'],
            );
        }
        unset($row['workshopName'], $row['workshopCode']);
        $row['id'] = (int) $row['id'];
        $row['workshopId'] = $row['workshopId'] === null ? null : (int) $row['workshopId'];
        $row['workshop'] = $workshop;
        return $row;
    }

    /**
     * GET /api/equipment/status-summary
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function statusSummary($params)
    {
        $rows = Db::all('SELECT status FROM equipment');
        $summary = array('running' => 0, 'idle' => 0, 'stopped' => 0, 'fault' => 0, 'total' => count($rows));
        foreach ($rows as $row) {
            if (isset($summary[$row['status']])) {
                $summary[$row['status']] += 1;
            }
        }
        Http::ok($summary);
    }

    /**
     * GET /api/equipment
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function index($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');
        $status = Http::query('status');
        $type = Http::query('type');
        Validate::queryEnum('status', array('running', 'idle', 'stopped', 'fault'));

        $where = array();
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where[] = '(e.code LIKE ? OR e.name LIKE ? OR e.location LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
            $bind[] = $like;
        }
        if ($status !== null) {
            $where[] = 'e.status = ?';
            $bind[] = $status;
        }
        if ($type !== null) {
            $where[] = 'e.type LIKE ?';
            $bind[] = '%' . $type . '%';
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $total = (int) Db::val('SELECT COUNT(*) FROM equipment e' . $whereSql, $bind);
        $rows = Db::all(
            'SELECT e.*, w.name AS workshopName, w.code AS workshopCode'
            . ' FROM equipment e LEFT JOIN workshops w ON w.id = e.workshopId'
            . $whereSql . ' ORDER BY e.createdAt DESC LIMIT ' . $pageSize
            . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'equipment'
        );

        $list = array();
        foreach ($rows as $row) {
            $list[] = self::format($row);
        }
        Http::paginated($list, $total, $page, $pageSize);
    }

    /**
     * GET /api/equipment/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function show($params)
    {
        $id = (int) $params['id'];
        $row = Db::one(
            'SELECT e.*, w.name AS workshopName, w.code AS workshopCode'
            . ' FROM equipment e LEFT JOIN workshops w ON w.id = e.workshopId WHERE e.id = ?',
            array($id),
            'equipment'
        );
        if ($row === null) {
            throw new HttpException('设备不存在', 404);
        }
        $equipment = self::format($row);

        $logs = Db::all(
            'SELECT id, equipmentId, oldStatus, newStatus, changedById, changedAt, remark'
            . ' FROM equipment_status_logs WHERE equipmentId = ? ORDER BY changedAt DESC LIMIT 50',
            array($id),
            'equipment_status_logs'
        );
        foreach ($logs as $index => $log) {
            $logs[$index]['id'] = (int) $log['id'];
            $logs[$index]['equipmentId'] = (int) $log['equipmentId'];
            $changedById = $log['changedById'] === null ? null : (int) $log['changedById'];
            $logs[$index]['changedById'] = $changedById;
            $changedBy = null;
            if ($changedById !== null) {
                $user = Db::one(
                    'SELECT id, name, department FROM users WHERE id = ?',
                    array($changedById)
                );
                if ($user !== null) {
                    $changedBy = array(
                        'id' => (int) $user['id'],
                        'name' => $user['name'],
                        'department' => $user['department'],
                    );
                }
            }
            $logs[$index]['changedBy'] = $changedBy;
        }

        $equipment['statusLogs'] = $logs;
        Http::ok($equipment);
    }

    /**
     * POST /api/equipment
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function store($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'code' => 'required|string|min:1|max:50',
            'name' => 'required|string|min:1|max:100',
            'type' => 'required|string|min:1|max:50',
            'location' => 'required|string|min:1|max:100',
        ));

        $code = trim((string) $body['code']);
        if (Db::val('SELECT COUNT(*) FROM equipment WHERE code = ?', array($code)) > 0) {
            throw new HttpException('设备编码已存在', 409);
        }

        $now = Db::nowParam();
        $id = Db::insert('equipment', array(
            'code' => $code,
            'name' => $body['name'],
            'type' => $body['type'],
            'location' => $body['location'],
            'status' => 'idle',
            'workshopId' => !empty($body['workshopId']) ? (int) $body['workshopId'] : null,
            'manufacturer' => isset($body['manufacturer']) ? (string) $body['manufacturer'] : '',
            'model' => isset($body['model']) ? (string) $body['model'] : '',
            'purchaseDate' => isset($body['purchaseDate']) ? Db::dateParam($body['purchaseDate']) : null,
            'remark' => isset($body['remark']) ? (string) $body['remark'] : '',
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        $created = Db::one('SELECT * FROM equipment WHERE id = ?', array($id), 'equipment');
        Http::created($created);
    }

    /**
     * PUT /api/equipment/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function update($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'name' => 'string|min:1|max:100',
            'type' => 'string|min:1|max:50',
            'location' => 'string|min:1|max:100',
        ));

        $existing = Db::one('SELECT id FROM equipment WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('设备不存在', 404);
        }

        $data = array('updatedAt' => Db::nowParam());
        foreach (array('name', 'type', 'location', 'manufacturer', 'model', 'remark') as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('workshopId', $body)) {
            $data['workshopId'] = $body['workshopId'] === null ? null : (int) $body['workshopId'];
        }
        if (array_key_exists('purchaseDate', $body)) {
            $data['purchaseDate'] = Db::dateParam($body['purchaseDate']);
        }

        Db::update('equipment', $data, 'id = ?', array($id));
        Http::ok(Db::one('SELECT * FROM equipment WHERE id = ?', array($id), 'equipment'));
    }

    /**
     * DELETE /api/equipment/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroy($params)
    {
        $id = (int) $params['id'];
        $exists = Db::val('SELECT COUNT(*) FROM equipment WHERE id = ?', array($id));
        if ((int) $exists === 0) {
            throw new HttpException('设备不存在', 404);
        }
        Db::exec('DELETE FROM equipment WHERE id = ?', array($id));
        Http::ok(null, '删除成功');
    }

    /**
     * 更新设备状态并写状态日志
     * @param int $equipmentId 设备 ID
     * @param string $newStatus 新状态
     * @param int|null $changedBy 操作人
     * @param string $remark 备注
     * @return array<string,mixed>
     * @throws HttpException 404/400
     */
    public static function changeStatusWithLog($equipmentId, $newStatus, $changedBy, $remark)
    {
        $existing = Db::one('SELECT * FROM equipment WHERE id = ?', array($equipmentId));
        if ($existing === null) {
            throw new HttpException('设备不存在', 404);
        }
        $oldStatus = $existing['status'];
        if ($oldStatus === $newStatus) {
            throw new HttpException('设备状态与当前相同，无需切换', 400);
        }

        $now = Db::nowParam();
        Db::update('equipment', array('status' => $newStatus, 'updatedAt' => $now), 'id = ?', array($equipmentId));
        Db::insert('equipment_status_logs', array(
            'equipmentId' => $equipmentId,
            'oldStatus' => $oldStatus,
            'newStatus' => $newStatus,
            'changedById' => $changedBy,
            'changedAt' => $now,
            'remark' => $remark,
        ));

        return Db::one('SELECT * FROM equipment WHERE id = ?', array($equipmentId), 'equipment');
    }

    /**
     * PATCH /api/equipment/:id/status
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function changeStatus($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'status' => 'required|in:running,idle,stopped,fault',
            'remark' => 'string|max:500',
        ));

        $current = Auth::user();
        $equipment = Db::tx(function () use ($id, $body, $current) {
            return self::changeStatusWithLog(
                $id,
                (string) $body['status'],
                (int) $current['userId'],
                isset($body['remark']) ? (string) $body['remark'] : ''
            );
        });

        Http::ok($equipment, '设备状态切换成功');
    }
}

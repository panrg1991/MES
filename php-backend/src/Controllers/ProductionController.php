<?php
/**
 * MES 系统 - 生产管理接口（工单 / 状态流转 / 报工）
 */

class ProductionController
{
    /** @var array<string,array<int,string>> 工单状态机 */
    private static $transitions = array(
        'pending' => array('in_progress', 'closed'),
        'in_progress' => array('paused', 'completed', 'closed'),
        'paused' => array('in_progress', 'closed'),
        'completed' => array('closed'),
        'closed' => array(),
    );

    /**
     * 计算进度百分比
     * @param int $completed 完成数量
     * @param int $quantity 计划数量
     * @return float
     */
    private static function progress($completed, $quantity)
    {
        return $quantity > 0 ? round($completed / $quantity * 1000) / 10 : 0;
    }

    /**
     * 读取工单操作员信息
     * @param int|null $operatorId 操作员 ID
     * @return array<string,mixed>|null
     */
    private static function operator($operatorId)
    {
        if ($operatorId === null) {
            return null;
        }
        $row = Db::one(
            'SELECT id, name, department FROM users WHERE id = ?',
            array((int) $operatorId)
        );
        if ($row === null) {
            return null;
        }
        return array(
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'department' => $row['department'],
        );
    }

    /**
     * 工单行 → 输出结构（含车间）
     * @param array<string,mixed> $row 工单行（含 workshopName/workshopCode 别名）
     * @param bool $withProgress 是否计算进度
     * @return array<string,mixed>
     */
    private static function formatOrder($row, $withProgress = true)
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
        $row['quantity'] = (int) $row['quantity'];
        $row['completedQty'] = (int) $row['completedQty'];
        $row['defectQty'] = (int) $row['defectQty'];
        $row['workshopId'] = $row['workshopId'] === null ? null : (int) $row['workshopId'];
        $row['workshop'] = $workshop;
        if ($withProgress) {
            $row['progress'] = self::progress($row['completedQty'], $row['quantity']);
        } else {
            unset($row['workshop']);
        }
        return $row;
    }

    /**
     * 生成工单号 WO-YYYYMMDD-XXX（取当天最大序号 +1）
     * @return string
     */
    private static function generateOrderNo()
    {
        $prefix = 'WO-' . date('Ymd') . '-';
        list($start, $end) = Db::todayRange();
        $rows = Db::all(
            'SELECT orderNo FROM work_orders WHERE createdAt >= ? AND createdAt < ?',
            array($start, $end)
        );
        $max = 0;
        foreach ($rows as $row) {
            if (strpos($row['orderNo'], $prefix) !== 0) {
                continue;
            }
            $seq = (int) substr($row['orderNo'], strlen($prefix));
            if ($seq > $max) {
                $max = $seq;
            }
        }
        return $prefix . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    /**
     * GET /api/production
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function index($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');
        $status = Http::query('status');
        $priority = Http::query('priority');
        Validate::queryEnum('status', array('pending', 'in_progress', 'paused', 'completed', 'closed'));
        Validate::queryEnum('priority', array('low', 'medium', 'high', 'urgent'));

        $where = array();
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where[] = '(wo.orderNo LIKE ? OR wo.productName LIKE ? OR wo.productCode LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
            $bind[] = $like;
        }
        if ($status !== null) {
            $where[] = 'wo.status = ?';
            $bind[] = $status;
        }
        if ($priority !== null) {
            $where[] = 'wo.priority = ?';
            $bind[] = $priority;
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $total = (int) Db::val('SELECT COUNT(*) FROM work_orders wo' . $whereSql, $bind);
        $rows = Db::all(
            'SELECT wo.*, w.name AS workshopName, w.code AS workshopCode'
            . ' FROM work_orders wo LEFT JOIN workshops w ON w.id = wo.workshopId'
            . $whereSql . ' ORDER BY wo.createdAt DESC LIMIT ' . $pageSize
            . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'work_orders'
        );

        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatOrder($row, true);
        }
        Http::paginated($list, $total, $page, $pageSize, '查询工单列表成功');
    }

    /**
     * GET /api/production/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function show($params)
    {
        $id = (int) $params['id'];
        $row = Db::one(
            'SELECT wo.*, w.name AS workshopName, w.code AS workshopCode'
            . ' FROM work_orders wo LEFT JOIN workshops w ON w.id = wo.workshopId'
            . ' WHERE wo.id = ?',
            array($id),
            'work_orders'
        );
        if ($row === null) {
            throw new HttpException('工单不存在', 404);
        }
        $order = self::formatOrder($row, true);

        $reports = Db::all(
            'SELECT id, workOrderId, completedQty, defectQty, operatorId, reportTime, remark, requestId'
            . ' FROM production_reports WHERE workOrderId = ? ORDER BY reportTime DESC',
            array($id),
            'production_reports'
        );
        foreach ($reports as $index => $report) {
            $reports[$index]['id'] = (int) $report['id'];
            $reports[$index]['workOrderId'] = (int) $report['workOrderId'];
            $reports[$index]['completedQty'] = (int) $report['completedQty'];
            $reports[$index]['defectQty'] = (int) $report['defectQty'];
            $reports[$index]['operatorId'] = $report['operatorId'] === null ? null : (int) $report['operatorId'];
            $reports[$index]['operator'] = self::operator($reports[$index]['operatorId']);
        }

        $logs = Db::all(
            'SELECT id, workOrderId, fromStatus, toStatus, operatorId, changedAt, remark'
            . ' FROM work_order_status_logs WHERE workOrderId = ? ORDER BY changedAt DESC',
            array($id),
            'work_order_status_logs'
        );
        foreach ($logs as $index => $log) {
            $logs[$index]['id'] = (int) $log['id'];
            $logs[$index]['workOrderId'] = (int) $log['workOrderId'];
            $logs[$index]['operatorId'] = $log['operatorId'] === null ? null : (int) $log['operatorId'];
            $logs[$index]['operator'] = self::operator($logs[$index]['operatorId']);
        }

        $order['reports'] = $reports;
        $order['statusLogs'] = $logs;
        Http::ok($order, '查询工单详情成功');
    }

    /**
     * POST /api/production
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function store($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'productName' => 'required|string|min:1|max:200',
            'productCode' => 'required|string|min:1|max:100',
            'quantity' => 'required|int|positive',
            'priority' => 'in:low,medium,high,urgent',
            'remark' => 'string|max:500',
        ));

        $now = Db::nowParam();
        $payload = array(
            'productName' => $body['productName'],
            'productCode' => $body['productCode'],
            'quantity' => (int) $body['quantity'],
            'completedQty' => 0,
            'defectQty' => 0,
            'status' => 'pending',
            'workshopId' => !empty($body['workshopId']) ? (int) $body['workshopId'] : null,
            'priority' => isset($body['priority']) && $body['priority'] !== ''
                ? $body['priority'] : 'medium',
            'planStart' => isset($body['planStart']) ? Db::dateParam($body['planStart']) : null,
            'planEnd' => isset($body['planEnd']) ? Db::dateParam($body['planEnd']) : null,
            'actualStart' => null,
            'actualEnd' => null,
            'remark' => isset($body['remark']) ? (string) $body['remark'] : '',
            'createdAt' => $now,
            'updatedAt' => $now,
        );

        $lastError = null;
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $orderNo = self::generateOrderNo();
            try {
                $data = $payload;
                $data['orderNo'] = $orderNo;
                $id = Db::insert('work_orders', $data);
                $created = Db::one('SELECT * FROM work_orders WHERE id = ?', array($id), 'work_orders');
                Http::created($created, '创建工单成功');
            } catch (PDOException $error) {
                $lastError = $error;
                if ($error->getCode() !== '23000') {
                    throw $error;
                }
            }
        }

        throw new HttpException('工单编号生成冲突，请稍后重试', 409);
    }

    /**
     * PUT /api/production/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function update($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'productName' => 'string|min:1|max:200',
            'productCode' => 'string|min:1|max:100',
            'quantity' => 'int|positive',
            'priority' => 'in:low,medium,high,urgent',
            'remark' => 'string|max:500',
        ));

        $result = Db::tx(function () use ($id, $body) {
            $existing = Db::one('SELECT * FROM work_orders WHERE id = ?', array($id));
            if ($existing === null) {
                throw new HttpException('工单不存在', 404);
            }
            if ($existing['status'] === 'closed') {
                throw new HttpException('已关闭的工单不允许编辑', 400);
            }
            if (array_key_exists('quantity', $body) && $body['quantity'] !== null) {
                $reported = (int) $existing['completedQty'] + (int) $existing['defectQty'];
                if ((int) $body['quantity'] < $reported) {
                    throw new HttpException(
                        '计划数量不能小于已报数量（已完成 ' . (int) $existing['completedQty']
                        . ' + 不良 ' . (int) $existing['defectQty'] . ' = ' . $reported . '）',
                        400
                    );
                }
            }

            $data = array('updatedAt' => Db::nowParam());
            $fields = array('productName', 'productCode', 'priority', 'remark');
            foreach ($fields as $field) {
                if (array_key_exists($field, $body)) {
                    $data[$field] = $body[$field];
                }
            }
            if (array_key_exists('quantity', $body)) {
                $data['quantity'] = (int) $body['quantity'];
            }
            if (array_key_exists('workshopId', $body)) {
                $data['workshopId'] = $body['workshopId'] === null ? null : (int) $body['workshopId'];
            }
            if (array_key_exists('planStart', $body)) {
                $data['planStart'] = Db::dateParam($body['planStart']);
            }
            if (array_key_exists('planEnd', $body)) {
                $data['planEnd'] = Db::dateParam($body['planEnd']);
            }

            Db::update('work_orders', $data, 'id = ?', array($id));
            return Db::one('SELECT * FROM work_orders WHERE id = ?', array($id), 'work_orders');
        });

        Http::ok($result, '更新工单成功');
    }

    /**
     * DELETE /api/production/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroy($params)
    {
        $id = (int) $params['id'];
        $exists = Db::val('SELECT COUNT(*) FROM work_orders WHERE id = ?', array($id));
        if ((int) $exists === 0) {
            throw new HttpException('工单不存在', 404);
        }
        Db::exec('DELETE FROM work_orders WHERE id = ?', array($id));
        Http::ok(null, '删除工单成功');
    }

    /**
     * PATCH /api/production/:id/status
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function transition($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'toStatus' => 'required|in:pending,in_progress,paused,completed,closed',
            'remark' => 'string|max:500',
        ));

        $current = Auth::user();
        $operatorId = (int) $current['userId'];
        $toStatus = (string) $body['toStatus'];
        $remark = isset($body['remark']) ? (string) $body['remark'] : '';

        $order = Db::tx(function () use ($id, $toStatus, $remark, $operatorId) {
            $existing = Db::one('SELECT * FROM work_orders WHERE id = ?', array($id));
            if ($existing === null) {
                throw new HttpException('工单不存在', 404);
            }
            $fromStatus = $existing['status'];
            $allowed = isset(self::$transitions[$fromStatus]) ? self::$transitions[$fromStatus] : array();
            if (!in_array($toStatus, $allowed, true)) {
                throw new HttpException(
                    '不允许从状态「' . $fromStatus . '」流转到「' . $toStatus . '」',
                    400
                );
            }

            $now = Db::nowParam();
            $data = array('status' => $toStatus, 'updatedAt' => $now);
            if ($fromStatus === 'pending' && $toStatus === 'in_progress') {
                $data['actualStart'] = $now;
            }
            if ($toStatus === 'completed') {
                $data['actualEnd'] = $now;
            }

            $affected = Db::update(
                'work_orders',
                $data,
                'id = ? AND status = ?',
                array($id, $fromStatus)
            );
            if ($affected === 0) {
                throw new HttpException('工单状态已被其他操作修改，请刷新后重试', 409);
            }

            Db::insert('work_order_status_logs', array(
                'workOrderId' => $id,
                'fromStatus' => $fromStatus,
                'toStatus' => $toStatus,
                'operatorId' => $operatorId,
                'changedAt' => $now,
                'remark' => $remark,
            ));

            return Db::one('SELECT * FROM work_orders WHERE id = ?', array($id), 'work_orders');
        });

        Http::ok($order, '状态流转成功');
    }

    /**
     * POST /api/production/:id/reports
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createReport($params)
    {
        $workOrderId = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'completedQty' => 'required|int|min:0',
            'defectQty' => 'int|min:0',
            'remark' => 'string|max:500',
            'requestId' => 'string|min:8|max:64',
        ));

        $completedQty = (int) $body['completedQty'];
        $defectQty = isset($body['defectQty']) ? (int) $body['defectQty'] : 0;
        $remark = isset($body['remark']) ? (string) $body['remark'] : '';
        $requestId = isset($body['requestId']) && $body['requestId'] !== ''
            ? (string) $body['requestId'] : null;
        $current = Auth::user();
        $operatorId = (int) $current['userId'];

        try {
            $report = Db::tx(function () use (
                $workOrderId,
                $completedQty,
                $defectQty,
                $operatorId,
                $remark,
                $requestId
            ) {
                // ① 幂等：同一 requestId 重试直接返回已有记录
                if ($requestId !== null) {
                    $existed = Db::one(
                        'SELECT * FROM production_reports WHERE requestId = ?',
                        array($requestId),
                        'production_reports'
                    );
                    if ($existed !== null) {
                        if ((int) $existed['workOrderId'] !== $workOrderId) {
                            throw new HttpException('requestId 已被其他工单使用，请重新提交', 409);
                        }
                        $existed['operator'] = self::operator(
                            $existed['operatorId'] === null ? null : (int) $existed['operatorId']
                        );
                        return $existed;
                    }
                }

                $order = Db::one('SELECT * FROM work_orders WHERE id = ?', array($workOrderId));
                if ($order === null) {
                    throw new HttpException('工单不存在', 404);
                }
                if ($order['status'] !== 'in_progress') {
                    throw new HttpException('只有进行中的工单可以报工', 400);
                }

                $totalQty = $completedQty + $defectQty;
                if ($totalQty <= 0) {
                    throw new HttpException('完成数量与不良数量不能同时为 0', 400);
                }
                $reported = (int) $order['completedQty'] + (int) $order['defectQty'];
                $remaining = (int) $order['quantity'] - $reported;
                if ($totalQty > $remaining) {
                    throw new HttpException(
                        '报工数量超出剩余可报数量：本次 ' . $totalQty . '，剩余 '
                        . ($remaining > 0 ? $remaining : 0) . '（计划 ' . (int) $order['quantity']
                        . '，已报 ' . $reported . '）',
                        400
                    );
                }

                $now = Db::nowParam();
                $updated = Db::exec(
                    'UPDATE work_orders SET completedQty = completedQty + ?,'
                    . ' defectQty = defectQty + ?, updatedAt = ? WHERE id = ? AND status = ?',
                    array($completedQty, $defectQty, $now, $workOrderId, 'in_progress')
                );
                if ($updated === 0) {
                    throw new HttpException('工单状态已变更，报工失败，请刷新后重试', 409);
                }

                $id = Db::insert('production_reports', array(
                    'workOrderId' => $workOrderId,
                    'completedQty' => $completedQty,
                    'defectQty' => $defectQty,
                    'operatorId' => $operatorId,
                    'reportTime' => $now,
                    'remark' => $remark,
                    'requestId' => $requestId,
                ));

                $created = Db::one(
                    'SELECT * FROM production_reports WHERE id = ?',
                    array($id),
                    'production_reports'
                );
                $created['operator'] = self::operator($operatorId);
                return $created;
            });
        } catch (PDOException $error) {
            if ($error->getCode() === '23000' && $requestId !== null) {
                $existed = Db::one(
                    'SELECT * FROM production_reports WHERE requestId = ?',
                    array($requestId),
                    'production_reports'
                );
                if ($existed !== null && (int) $existed['workOrderId'] === $workOrderId) {
                    $existed['operator'] = self::operator(
                        $existed['operatorId'] === null ? null : (int) $existed['operatorId']
                    );
                    Http::created($existed, '报工成功');
                }
            }
            throw $error;
        }

        Http::created($report, '报工成功');
    }
}

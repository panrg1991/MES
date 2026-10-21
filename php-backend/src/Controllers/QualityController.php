<?php
/**
 * MES 系统 - 质量管理接口（检验记录 / 不良品）
 */

class QualityController
{
    /**
     * 判定检验结果：任一 fail → fail；全部 pass → pass；否则 concession
     * @param array<int,array<string,mixed>> $items 检验项
     * @return string
     */
    private static function determineResult($items)
    {
        $allPass = true;
        foreach ($items as $item) {
            $result = isset($item['result']) ? $item['result'] : 'pass';
            if ($result === 'fail') {
                return 'fail';
            }
            if ($result !== 'pass') {
                $allPass = false;
            }
        }
        return $allPass ? 'pass' : 'concession';
    }

    /**
     * 检验项输出
     * @param array<string,mixed> $row 行
     * @param bool $withRemark 是否包含备注
     * @return array<string,mixed>
     */
    private static function formatItem($row, $withRemark = true, $withInspectionId = true)
    {
        $item = array('id' => (int) $row['id']);
        if ($withInspectionId) {
            $item['inspectionId'] = (int) $row['inspectionId'];
        }
        $item['itemName'] = $row['itemName'];
        $item['standardValue'] = $row['standardValue'];
        $item['actualValue'] = $row['actualValue'];
        $item['unit'] = $row['unit'];
        $item['result'] = $row['result'];
        if ($withRemark) {
            $item['remark'] = $row['remark'];
        }
        return $item;
    }

    /**
     * 检验记录输出
     * @param array<string,mixed> $row 行（含工单/检验员别名）
     * @param array<int,array<string,mixed>> $items 检验项
     * @param bool $fullWorkOrder 是否输出完整工单字段
     * @return array<string,mixed>
     */
    private static function formatInspection($row, $items, $fullWorkOrder = false)
    {
        $workOrder = null;
        if (isset($row['orderNo']) && $row['orderNo'] !== null) {
            $workOrder = array(
                'id' => (int) $row['workOrderId'],
                'orderNo' => $row['orderNo'],
                'productName' => $row['productName'],
                'productCode' => $row['productCode'],
            );
            if ($fullWorkOrder) {
                $workOrder['quantity'] = (int) $row['woQuantity'];
                $workOrder['completedQty'] = (int) $row['woCompletedQty'];
                $workOrder['defectQty'] = (int) $row['woDefectQty'];
            }
        }
        $inspector = null;
        if (isset($row['inspectorName']) && $row['inspectorName'] !== null) {
            $inspector = array(
                'id' => (int) $row['inspectorId'],
                'name' => $row['inspectorName'],
                'department' => $row['inspectorDepartment'],
            );
        }
        unset(
            $row['orderNo'],
            $row['productName'],
            $row['productCode'],
            $row['woQuantity'],
            $row['woCompletedQty'],
            $row['woDefectQty'],
            $row['inspectorName'],
            $row['inspectorDepartment']
        );
        $row['id'] = (int) $row['id'];
        $row['workOrderId'] = (int) $row['workOrderId'];
        $row['inspectorId'] = $row['inspectorId'] === null ? null : (int) $row['inspectorId'];
        $row['workOrder'] = $workOrder;
        $row['inspector'] = $inspector;
        $row['items'] = $items;
        return $row;
    }

    /**
     * 读取检验项
     * @param array<int,int> $inspectionIds 检验记录 ID
     * @param bool $withRemark 是否含备注
     * @return array<int,array<int,array<string,mixed>>>
     */
    private static function itemsMap($inspectionIds, $withRemark = true)
    {
        $map = array();
        if (count($inspectionIds) === 0) {
            return $map;
        }
        $placeholders = implode(',', array_fill(0, count($inspectionIds), '?'));
        $rows = Db::all(
            'SELECT * FROM inspection_items WHERE inspectionId IN (' . $placeholders . ') ORDER BY id ASC',
            $inspectionIds
        );
        foreach ($rows as $row) {
            $key = (int) $row['inspectionId'];
            if (!isset($map[$key])) {
                $map[$key] = array();
            }
            $map[$key][] = self::formatItem($row, $withRemark, $withRemark);
        }
        return $map;
    }

    /**
     * 查询检验记录
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $limit LIMIT 片段
     * @return array<int,array<string,mixed>>
     */
    private static function queryInspections($where, $bind, $limit = '')
    {
        $sql = 'SELECT qi.*, wo.orderNo AS orderNo, wo.productName AS productName,'
            . ' wo.productCode AS productCode, wo.quantity AS woQuantity,'
            . ' wo.completedQty AS woCompletedQty, wo.defectQty AS woDefectQty,'
            . ' u.name AS inspectorName, u.department AS inspectorDepartment'
            . ' FROM quality_inspections qi'
            . ' LEFT JOIN work_orders wo ON wo.id = qi.workOrderId'
            . ' LEFT JOIN users u ON u.id = qi.inspectorId'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY qi.inspectionTime DESC' . ($limit !== '' ? ' ' . $limit : '');
        $rows = Db::all($sql, $bind, 'quality_inspections');

        $ids = array();
        foreach ($rows as $row) {
            $ids[] = (int) $row['id'];
        }
        $itemsMap = self::itemsMap($ids, false);

        $list = array();
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $list[] = self::formatInspection($row, isset($itemsMap[$id]) ? $itemsMap[$id] : array());
        }
        return $list;
    }

    /**
     * GET /api/quality/inspections
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function inspections($params)
    {
        list($page, $pageSize) = Http::pagination();
        $where = array();
        $bind = array();
        $keyword = Http::query('keyword');
        $result = Http::query('result');
        $inspectionType = Http::query('inspectionType');
        $workOrderId = Http::queryInt('workOrderId');

        if ($keyword !== null && $keyword !== '') {
            $where[] = '(wo.orderNo LIKE ? OR wo.productName LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
        }
        if ($result !== null) {
            $where[] = 'qi.result = ?';
            $bind[] = $result;
        }
        if ($inspectionType !== null) {
            $where[] = 'qi.inspectionType = ?';
            $bind[] = $inspectionType;
        }
        if ($workOrderId !== null) {
            $where[] = 'qi.workOrderId = ?';
            $bind[] = $workOrderId;
        }
        $whereSql = implode(' AND ', $where);

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM quality_inspections qi'
            . ' LEFT JOIN work_orders wo ON wo.id = qi.workOrderId'
            . ($whereSql !== '' ? ' WHERE ' . $whereSql : ''),
            $bind
        );
        $list = self::queryInspections(
            $whereSql,
            $bind,
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );

        Http::paginated($list, $total, $page, $pageSize, '查询检验记录列表成功');
    }

    /**
     * GET /api/quality/inspections/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function inspection($params)
    {
        $id = (int) $params['id'];
        $list = self::queryInspections('qi.id = ?', array($id));
        if (count($list) === 0) {
            throw new HttpException('检验记录不存在', 404);
        }
        $items = self::itemsMap(array($id), true);
        $record = $list[0];
        $record['items'] = isset($items[$id]) ? $items[$id] : array();

        // 详情补齐工单计划/完成/不良字段
        $workOrder = Db::one(
            'SELECT id, orderNo, productName, productCode, quantity, completedQty, defectQty'
            . ' FROM work_orders WHERE id = ?',
            array((int) $record['workOrderId'])
        );
        if ($workOrder !== null) {
            $record['workOrder'] = array(
                'id' => (int) $workOrder['id'],
                'orderNo' => $workOrder['orderNo'],
                'productName' => $workOrder['productName'],
                'productCode' => $workOrder['productCode'],
                'quantity' => (int) $workOrder['quantity'],
                'completedQty' => (int) $workOrder['completedQty'],
                'defectQty' => (int) $workOrder['defectQty'],
            );
        }
        Http::ok($record, '查询检验记录详情成功');
    }

    /**
     * POST /api/quality/inspections
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createInspection($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'workOrderId' => 'required|int|positive',
            'inspectionType' => 'required|in:first_article,process,final',
            'items' => 'required|array',
        ));

        $workOrderId = (int) $body['workOrderId'];
        if (Db::val('SELECT COUNT(*) FROM work_orders WHERE id = ?', array($workOrderId)) == 0) {
            throw new HttpException('关联工单不存在', 404);
        }

        $items = array();
        foreach ($body['items'] as $item) {
            if (!is_array($item) || empty($item['itemName'])) {
                continue;
            }
            $items[] = array(
                'itemName' => $item['itemName'],
                'standardValue' => isset($item['standardValue']) ? (string) $item['standardValue'] : '',
                'actualValue' => isset($item['actualValue']) ? (string) $item['actualValue'] : '',
                'unit' => isset($item['unit']) ? (string) $item['unit'] : '',
                'result' => isset($item['result']) ? $item['result'] : 'pass',
                'remark' => isset($item['remark']) ? (string) $item['remark'] : '',
            );
        }
        if (count($items) === 0) {
            throw new HttpException('参数校验失败', 400, array(
                array('field' => 'items', 'message' => '至少填写一个检验项'),
            ));
        }

        $current = Auth::user();
        $result = self::determineResult($items);

        $inspectionId = Db::tx(function () use ($body, $workOrderId, $items, $result, $current) {
            $now = Db::nowParam();
            $id = Db::insert('quality_inspections', array(
                'workOrderId' => $workOrderId,
                'inspectionType' => $body['inspectionType'],
                'inspectorId' => (int) $current['userId'],
                'inspectionTime' => $now,
                'result' => $result,
                'remark' => isset($body['remark']) ? (string) $body['remark'] : '',
                'createdAt' => $now,
                'updatedAt' => $now,
            ));
            foreach ($items as $item) {
                Db::insert('inspection_items', array(
                    'inspectionId' => $id,
                    'itemName' => $item['itemName'],
                    'standardValue' => $item['standardValue'],
                    'actualValue' => $item['actualValue'],
                    'unit' => $item['unit'],
                    'result' => $item['result'],
                    'remark' => $item['remark'],
                ));
            }
            return $id;
        });

        $list = self::queryInspections('qi.id = ?', array($inspectionId));
        $record = $list[0];
        $itemsMap = self::itemsMap(array($inspectionId), true);
        $record['items'] = isset($itemsMap[$inspectionId]) ? $itemsMap[$inspectionId] : array();
        Http::created($record, '创建检验记录成功');
    }

    /**
     * DELETE /api/quality/inspections/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deleteInspection($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM quality_inspections WHERE id = ?', array($id)) === 0) {
            throw new HttpException('检验记录不存在', 404);
        }
        Db::exec('DELETE FROM quality_inspections WHERE id = ?', array($id));
        Http::ok(null, '删除检验记录成功');
    }

    /**
     * 不良品行输出
     * @param array<string,mixed> $row 行
     * @return array<string,mixed>
     */
    private static function formatDefect($row)
    {
        $workOrder = null;
        if (isset($row['orderNo']) && $row['orderNo'] !== null) {
            $workOrder = array(
                'id' => (int) $row['workOrderId'],
                'orderNo' => $row['orderNo'],
                'productName' => $row['productName'],
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
        $handler = null;
        if (isset($row['handlerName']) && $row['handlerName'] !== null) {
            $handler = array(
                'id' => (int) $row['handledBy'],
                'name' => $row['handlerName'],
                'department' => $row['handlerDepartment'],
            );
        }
        unset(
            $row['orderNo'],
            $row['productName'],
            $row['equipmentCode'],
            $row['equipmentName'],
            $row['handlerName'],
            $row['handlerDepartment']
        );
        $row['id'] = (int) $row['id'];
        $row['workOrderId'] = (int) $row['workOrderId'];
        $row['equipmentId'] = $row['equipmentId'] === null ? null : (int) $row['equipmentId'];
        $row['quantity'] = (int) $row['quantity'];
        $row['handledBy'] = $row['handledBy'] === null ? null : (int) $row['handledBy'];
        $row['workOrder'] = $workOrder;
        $row['equipment'] = $equipment;
        $row['handler'] = $handler;
        return $row;
    }

    /**
     * 查询不良品
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $limit LIMIT
     * @return array<int,array<string,mixed>>
     */
    private static function queryDefects($where, $bind, $limit = '')
    {
        $sql = 'SELECT dr.*, wo.orderNo AS orderNo, wo.productName AS productName,'
            . ' e.code AS equipmentCode, e.name AS equipmentName,'
            . ' u.name AS handlerName, u.department AS handlerDepartment'
            . ' FROM defect_records dr'
            . ' LEFT JOIN work_orders wo ON wo.id = dr.workOrderId'
            . ' LEFT JOIN equipment e ON e.id = dr.equipmentId'
            . ' LEFT JOIN users u ON u.id = dr.handledBy'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY dr.createdAt DESC' . ($limit !== '' ? ' ' . $limit : '');
        $rows = Db::all($sql, $bind, 'defect_records');
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatDefect($row);
        }
        return $list;
    }

    /**
     * GET /api/quality/defects
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function defects($params)
    {
        list($page, $pageSize) = Http::pagination();
        $where = array();
        $bind = array();
        $keyword = Http::query('keyword');
        $defectType = Http::query('defectType');
        $handlingMethod = Http::query('handlingMethod');
        $workOrderId = Http::queryInt('workOrderId');

        if ($keyword !== null && $keyword !== '') {
            $where[] = '(wo.orderNo LIKE ? OR dr.defectType LIKE ? OR dr.defectReason LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
            $bind[] = $like;
        }
        if ($defectType !== null) {
            $where[] = 'dr.defectType LIKE ?';
            $bind[] = '%' . $defectType . '%';
        }
        if ($handlingMethod !== null) {
            $where[] = 'dr.handlingMethod = ?';
            $bind[] = $handlingMethod;
        }
        if ($workOrderId !== null) {
            $where[] = 'dr.workOrderId = ?';
            $bind[] = $workOrderId;
        }
        $whereSql = implode(' AND ', $where);

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM defect_records dr'
            . ' LEFT JOIN work_orders wo ON wo.id = dr.workOrderId'
            . ($whereSql !== '' ? ' WHERE ' . $whereSql : ''),
            $bind
        );
        $list = self::queryDefects(
            $whereSql,
            $bind,
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );

        Http::paginated($list, $total, $page, $pageSize, '查询不良品记录列表成功');
    }

    /**
     * GET /api/quality/defects/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function defect($params)
    {
        $id = (int) $params['id'];
        $list = self::queryDefects('dr.id = ?', array($id));
        if (count($list) === 0) {
            throw new HttpException('不良品记录不存在', 404);
        }
        $record = $list[0];
        $workOrder = Db::one(
            'SELECT id, orderNo, productName, productCode FROM work_orders WHERE id = ?',
            array((int) $record['workOrderId'])
        );
        if ($workOrder !== null) {
            $record['workOrder'] = array(
                'id' => (int) $workOrder['id'],
                'orderNo' => $workOrder['orderNo'],
                'productName' => $workOrder['productName'],
                'productCode' => $workOrder['productCode'],
            );
        }
        Http::ok($record, '查询不良品记录详情成功');
    }

    /**
     * POST /api/quality/defects
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createDefect($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'workOrderId' => 'required|int|positive',
            'defectType' => 'required|string|min:1|max:50',
            'quantity' => 'required|int|positive',
        ));

        $workOrderId = (int) $body['workOrderId'];
        if (Db::val('SELECT COUNT(*) FROM work_orders WHERE id = ?', array($workOrderId)) == 0) {
            throw new HttpException('关联工单不存在', 404);
        }
        $equipmentId = !empty($body['equipmentId']) ? (int) $body['equipmentId'] : null;
        if ($equipmentId !== null
            && Db::val('SELECT COUNT(*) FROM equipment WHERE id = ?', array($equipmentId)) == 0) {
            throw new HttpException('关联设备不存在', 404);
        }

        $now = Db::nowParam();
        $id = Db::insert('defect_records', array(
            'workOrderId' => $workOrderId,
            'equipmentId' => $equipmentId,
            'defectType' => $body['defectType'],
            'defectReason' => isset($body['defectReason']) ? (string) $body['defectReason'] : '',
            'quantity' => (int) $body['quantity'],
            'handlingMethod' => null,
            'handledBy' => null,
            'handledAt' => null,
            'remark' => isset($body['remark']) ? (string) $body['remark'] : '',
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        $list = self::queryDefects('dr.id = ?', array($id));
        Http::created($list[0], '创建不良品记录成功');
    }

    /**
     * PUT /api/quality/defects/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateDefect($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'handlingMethod' => 'required|in:rework,scrap,concession',
            'remark' => 'string|max:500',
        ));

        $existing = Db::one('SELECT * FROM defect_records WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('不良品记录不存在', 404);
        }
        if ($existing['handlingMethod'] !== null) {
            throw new HttpException('该不良品已处理，不可重复处理', 400);
        }

        $current = Auth::user();
        $now = Db::nowParam();
        $data = array(
            'handlingMethod' => $body['handlingMethod'],
            'handledBy' => (int) $current['userId'],
            'handledAt' => $now,
            'updatedAt' => $now,
        );
        if (array_key_exists('remark', $body)) {
            $data['remark'] = $body['remark'];
        }

        Db::update('defect_records', $data, 'id = ?', array($id));
        $list = self::queryDefects('dr.id = ?', array($id));
        Http::ok($list[0], '不良品处理成功');
    }

    /**
     * DELETE /api/quality/defects/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deleteDefect($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM defect_records WHERE id = ?', array($id)) === 0) {
            throw new HttpException('不良品记录不存在', 404);
        }
        Db::exec('DELETE FROM defect_records WHERE id = ?', array($id));
        Http::ok(null, '删除不良品记录成功');
    }
}

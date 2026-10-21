<?php
/**
 * MES 系统 - 质量追溯接口（工单维度 / 批次维度）
 */

class TraceController
{
    /**
     * 物料链路（按工单号分组）
     * @param array<int,string> $orderNos 工单号列表
     * @return array<string,array<int,array<string,mixed>>>
     */
    private static function materialChain($orderNos)
    {
        $chain = array();
        $valid = array();
        foreach ($orderNos as $orderNo) {
            if (is_string($orderNo) && trim($orderNo) !== '') {
                $valid[] = trim($orderNo);
                $chain[trim($orderNo)] = array();
            }
        }
        if (count($valid) === 0) {
            return $chain;
        }

        $placeholders = implode(',', array_fill(0, count($valid), '?'));
        $transactions = Db::all(
            'SELECT it.*, m.code AS materialCode, m.name AS materialName'
            . ' FROM inventory_transactions it LEFT JOIN materials m ON m.id = it.materialId'
            . ' WHERE it.relatedOrder IN (' . $placeholders . ') ORDER BY it.transactionTime ASC',
            $valid,
            'inventory_transactions'
        );

        $batchNos = array();
        foreach ($transactions as $transaction) {
            $batchNos[$transaction['batchNo']] = true;
        }
        $batchMap = array();
        if (count($batchNos) > 0) {
            $names = array_keys($batchNos);
            $batchPlaceholders = implode(',', array_fill(0, count($names), '?'));
            $batches = Db::all(
                'SELECT * FROM material_batches WHERE batchNo IN (' . $batchPlaceholders . ')',
                $names,
                'material_batches'
            );
            foreach ($batches as $batch) {
                $batchMap[$batch['batchNo']] = $batch;
            }
        }

        foreach ($transactions as $transaction) {
            $orderNo = $transaction['relatedOrder'];
            if (!isset($chain[$orderNo])) {
                continue;
            }
            $batch = isset($batchMap[$transaction['batchNo']]) ? $batchMap[$transaction['batchNo']] : null;
            $chain[$orderNo][] = array(
                'batchNo' => $transaction['batchNo'],
                'materialCode' => $transaction['materialCode'] === null ? '-' : $transaction['materialCode'],
                'materialName' => $transaction['materialName'] === null ? '-' : $transaction['materialName'],
                'supplier' => $batch === null ? '批次未建档' : $batch['supplier'],
                'receivedDate' => $batch === null ? null : $batch['receivedDate'],
                'quantity' => $batch === null ? 0 : $batch['quantity'],
                'transactionType' => $transaction['transactionType'],
                'quantityUsed' => $transaction['quantity'],
                'relatedOrder' => $orderNo,
            );
        }
        return $chain;
    }

    /**
     * 工单维度链路
     * @param string $orderNo 工单号
     * @return array<string,mixed>
     */
    public static function buildWorkOrderChain($orderNo)
    {
        $workOrder = Db::one(
            'SELECT * FROM work_orders WHERE orderNo = ?',
            array($orderNo),
            'work_orders'
        );
        if ($workOrder === null) {
            throw new HttpException('未找到工单：' . $orderNo, 404);
        }
        $workOrderId = (int) $workOrder['id'];

        $materialChain = self::materialChain(array($orderNo));

        // 生产执行：报工
        $reports = Db::all(
            'SELECT pr.*, u.name AS operatorName FROM production_reports pr'
            . ' LEFT JOIN users u ON u.id = pr.operatorId'
            . ' WHERE pr.workOrderId = ? ORDER BY pr.reportTime ASC',
            array($workOrderId),
            'production_reports'
        );

        // 生产执行：工时
        $workHours = Db::all(
            'SELECT wh.*, s.name AS shiftName FROM work_hours_records wh'
            . ' LEFT JOIN shifts s ON s.id = wh.shiftId'
            . ' WHERE wh.workOrderId = ? ORDER BY wh.workDate ASC',
            array($workOrderId),
            'work_hours_records'
        );

        // 设备与排程
        $schedules = Db::all(
            'SELECT ps.*, e.code AS equipmentCode, e.name AS equipmentName'
            . ' FROM production_schedules ps LEFT JOIN equipment e ON e.id = ps.equipmentId'
            . ' WHERE ps.workOrderId = ? ORDER BY ps.plannedStart ASC',
            array($workOrderId),
            'production_schedules'
        );

        // 检验
        $inspections = Db::all(
            'SELECT qi.*, u.name AS inspectorName FROM quality_inspections qi'
            . ' LEFT JOIN users u ON u.id = qi.inspectorId'
            . ' WHERE qi.workOrderId = ? ORDER BY qi.inspectionTime ASC',
            array($workOrderId),
            'quality_inspections'
        );
        $inspectionIds = array();
        foreach ($inspections as $inspection) {
            $inspectionIds[] = (int) $inspection['id'];
        }
        $itemsMap = array();
        if (count($inspectionIds) > 0) {
            $placeholders = implode(',', array_fill(0, count($inspectionIds), '?'));
            $items = Db::all(
                'SELECT * FROM inspection_items WHERE inspectionId IN (' . $placeholders . ') ORDER BY id ASC',
                $inspectionIds
            );
            foreach ($items as $item) {
                $key = (int) $item['inspectionId'];
                if (!isset($itemsMap[$key])) {
                    $itemsMap[$key] = array();
                }
                $itemsMap[$key][] = array(
                    'itemName' => $item['itemName'],
                    'standardValue' => $item['standardValue'],
                    'actualValue' => $item['actualValue'],
                    'unit' => $item['unit'],
                    'result' => $item['result'],
                );
            }
        }

        // 不良品
        $defects = Db::all(
            'SELECT dr.*, e.code AS equipmentCode, u.name AS handlerName'
            . ' FROM defect_records dr'
            . ' LEFT JOIN equipment e ON e.id = dr.equipmentId'
            . ' LEFT JOIN users u ON u.id = dr.handledBy'
            . ' WHERE dr.workOrderId = ? ORDER BY dr.createdAt ASC',
            array($workOrderId),
            'defect_records'
        );

        // 设备时段内故障
        $equipmentIds = array();
        foreach ($schedules as $schedule) {
            if ($schedule['equipmentId'] !== null) {
                $equipmentIds[(int) $schedule['equipmentId']] = true;
            }
        }
        $breakdowns = array();
        if (count($equipmentIds) > 0) {
            $ids = array_keys($equipmentIds);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $breakdowns = Db::all(
                'SELECT * FROM breakdown_records WHERE equipmentId IN (' . $placeholders . ')'
                . ' ORDER BY occurredAt ASC',
                $ids,
                'breakdown_records'
            );
        }

        $equipmentChain = array();
        foreach ($schedules as $schedule) {
            $related = array();
            foreach ($breakdowns as $breakdown) {
                if ($breakdown['equipmentId'] != $schedule['equipmentId']) {
                    continue;
                }
                if ($schedule['plannedStart'] !== null && $schedule['plannedEnd'] !== null) {
                    $occurred = strtotime($breakdown['occurredAt']);
                    if ($occurred < strtotime($schedule['plannedStart'])
                        || $occurred > strtotime($schedule['plannedEnd'])) {
                        continue;
                    }
                }
                $related[] = array(
                    'occurredAt' => $breakdown['occurredAt'],
                    'faultType' => $breakdown['faultType'],
                    'faultDescription' => $breakdown['faultDescription'],
                    'repairedAt' => $breakdown['repairedAt'],
                    'downtimeDuration' => (int) $breakdown['downtimeDuration'],
                );
            }
            $equipmentChain[] = array(
                'equipmentId' => $schedule['equipmentId'] === null ? null : (int) $schedule['equipmentId'],
                'equipmentCode' => $schedule['equipmentCode'] === null ? '-' : $schedule['equipmentCode'],
                'equipmentName' => $schedule['equipmentName'] === null ? '-' : $schedule['equipmentName'],
                'plannedStart' => $schedule['plannedStart'],
                'plannedEnd' => $schedule['plannedEnd'],
                'actualStart' => $schedule['actualStart'],
                'actualEnd' => $schedule['actualEnd'],
                'breakdown' => $related,
            );
        }

        // 工时池（按 操作员 + 本地日期 与报工配对）
        $hoursPool = array();
        foreach ($workHours as $record) {
            $hoursPool[] = array(
                'userId' => $record['userId'] === null ? null : (int) $record['userId'],
                'date' => Db::localDateKey($record['workDate']),
                'hours' => (float) $record['hours'],
                'shiftName' => $record['shiftName'] === null ? '-' : $record['shiftName'],
            );
        }

        $executionChain = array();
        foreach ($reports as $report) {
            $reportDate = Db::localDateKey($report['reportTime']);
            $operatorId = $report['operatorId'] === null ? null : (int) $report['operatorId'];
            $hours = 0;
            $shiftName = '-';
            $workDate = $reportDate;
            foreach ($hoursPool as $index => $pool) {
                if ($pool['userId'] === $operatorId && $pool['date'] === $reportDate) {
                    $hours = $pool['hours'];
                    $shiftName = $pool['shiftName'];
                    $workDate = $pool['date'];
                    unset($hoursPool[$index]);
                    break;
                }
            }
            $executionChain[] = array(
                'reportTime' => $report['reportTime'],
                'completedQty' => (int) $report['completedQty'],
                'defectQty' => (int) $report['defectQty'],
                'operatorName' => $report['operatorName'] === null ? '未记录操作员' : $report['operatorName'],
                'workDate' => $workDate,
                'hours' => $hours,
                'shiftName' => $shiftName,
            );
        }

        $qualityChain = array();
        foreach ($inspections as $inspection) {
            $key = (int) $inspection['id'];
            $qualityChain[] = array(
                'inspectionType' => $inspection['inspectionType'],
                'inspectionTime' => $inspection['inspectionTime'],
                'inspectorName' => $inspection['inspectorName'] === null
                    ? '未记录检验员' : $inspection['inspectorName'],
                'result' => $inspection['result'],
                'items' => isset($itemsMap[$key]) ? $itemsMap[$key] : array(),
            );
        }

        $defectChain = array();
        foreach ($defects as $defect) {
            $defectChain[] = array(
                'defectType' => $defect['defectType'],
                'defectReason' => $defect['defectReason'],
                'quantity' => (int) $defect['quantity'],
                'handlingMethod' => $defect['handlingMethod'],
                'handledByName' => $defect['handlerName'] === null ? '未处理' : $defect['handlerName'],
                'handledAt' => $defect['handledAt'],
                'equipmentCode' => $defect['equipmentCode'] === null ? '-' : $defect['equipmentCode'],
            );
        }

        return array(
            'workOrder' => array(
                'id' => $workOrderId,
                'orderNo' => $workOrder['orderNo'],
                'productName' => $workOrder['productName'],
                'quantity' => (int) $workOrder['quantity'],
                'completedQty' => (int) $workOrder['completedQty'],
                'defectQty' => (int) $workOrder['defectQty'],
                'status' => $workOrder['status'],
                'planStart' => $workOrder['planStart'],
                'planEnd' => $workOrder['planEnd'],
                'actualStart' => $workOrder['actualStart'],
                'actualEnd' => $workOrder['actualEnd'],
            ),
            'materialChain' => isset($materialChain[$orderNo]) ? $materialChain[$orderNo] : array(),
            'executionChain' => $executionChain,
            'equipmentChain' => $equipmentChain,
            'qualityChain' => $qualityChain,
            'defectChain' => $defectChain,
        );
    }

    /**
     * 批次维度链路
     * @param string $batchNo 批次号
     * @return array<string,mixed>
     */
    public static function buildBatchEntries($batchNo)
    {
        $transactions = Db::all(
            'SELECT * FROM inventory_transactions WHERE batchNo = ? AND transactionType = ?'
            . ' AND relatedOrder <> ? ORDER BY transactionTime ASC',
            array($batchNo, 'out', '')
        );

        $orderNos = array();
        foreach ($transactions as $transaction) {
            $orderNos[$transaction['relatedOrder']] = true;
        }
        if (count($orderNos) === 0) {
            $exists = Db::val('SELECT COUNT(*) FROM material_batches WHERE batchNo = ?', array($batchNo));
            if ((int) $exists === 0) {
                throw new HttpException('未找到该批次，或该批次尚未发生出入库', 404);
            }
            return array('entries' => array());
        }

        $entries = array();
        foreach (array_keys($orderNos) as $orderNo) {
            $entries[] = self::buildWorkOrderChain($orderNo);
        }
        return array('entries' => $entries);
    }

    /**
     * GET /api/quality/traceability
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function traceability($params)
    {
        $workOrderNo = Http::query('workOrderNo');
        $batchNo = Http::query('batchNo');
        $hasOrder = is_string($workOrderNo) && trim($workOrderNo) !== '';
        $hasBatch = is_string($batchNo) && trim($batchNo) !== '';

        if ($hasOrder && $hasBatch) {
            throw new HttpException('workOrderNo 与 batchNo 参数只能二选一', 400);
        }
        if (!$hasOrder && !$hasBatch) {
            throw new HttpException('请提供 workOrderNo（工单号）或 batchNo（批次号）查询参数', 400);
        }

        if ($hasOrder) {
            $data = array('entries' => array(self::buildWorkOrderChain(trim($workOrderNo))));
        } else {
            $data = self::buildBatchEntries(trim($batchNo));
        }

        Http::ok($data, '追溯查询成功');
    }
}

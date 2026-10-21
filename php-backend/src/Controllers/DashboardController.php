<?php
/**
 * MES 系统 - 数据看板接口
 */

class DashboardController
{
    /**
     * GET /api/dashboard/overview
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function overview($params)
    {
        $productionProgress = (int) Db::val(
            'SELECT COUNT(*) FROM work_orders WHERE status = ?',
            array('in_progress')
        );

        $equipments = Db::all('SELECT status FROM equipment');
        $equipmentStatus = array(
            'running' => 0,
            'idle' => 0,
            'stopped' => 0,
            'fault' => 0,
            'total' => count($equipments),
        );
        foreach ($equipments as $equipment) {
            if (isset($equipmentStatus[$equipment['status']])) {
                $equipmentStatus[$equipment['status']] += 1;
            }
        }

        list($start, $end) = Db::todayRange();
        $reports = Db::all(
            'SELECT completedQty, defectQty FROM production_reports WHERE reportTime >= ? AND reportTime < ?',
            array($start, $end)
        );
        $outputToday = 0;
        $defectToday = 0;
        foreach ($reports as $report) {
            $outputToday += (int) $report['completedQty'];
            $defectToday += (int) $report['defectQty'];
        }
        $totalToday = $outputToday + $defectToday;
        $defectRate = $totalToday > 0 ? round($defectToday / $totalToday * 1000) / 10 : 0;

        $inventories = Db::all('SELECT quantity, safetyStock FROM inventory');
        $lowStockCount = 0;
        foreach ($inventories as $inventory) {
            $warning = MaterialController::evaluateWarning($inventory);
            if ($warning['isLowStock']) {
                $lowStockCount += 1;
            }
        }

        $deadline = Db::dateTimeParam(new DateTime('+' . 7 . ' days', new DateTimeZone('UTC')));
        $maintenanceDueCount = (int) Db::val(
            'SELECT COUNT(*) FROM maintenance_plans WHERE status = ? AND nextDate <= ?',
            array('active', $deadline)
        );

        Http::ok(array(
            'productionProgress' => $productionProgress,
            'equipmentStatus' => $equipmentStatus,
            'outputToday' => $outputToday,
            'defectRate' => $defectRate,
            'lowStockCount' => $lowStockCount,
            'maintenanceDueCount' => $maintenanceDueCount,
        ), '查询看板总览成功');
    }

    /**
     * GET /api/dashboard/production-progress
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function productionProgress($params)
    {
        $orders = Db::all(
            'SELECT orderNo, productName, completedQty, quantity, priority'
            . ' FROM work_orders WHERE status = ? ORDER BY priority DESC, createdAt DESC',
            array('in_progress')
        );
        $list = array();
        foreach ($orders as $order) {
            $completed = (int) $order['completedQty'];
            $quantity = (int) $order['quantity'];
            $list[] = array(
                'orderNo' => $order['orderNo'],
                'productName' => $order['productName'],
                'completedQty' => $completed,
                'quantity' => $quantity,
                'progress' => $quantity > 0 ? round($completed / $quantity * 1000) / 10 : 0,
            );
        }
        Http::ok(array('list' => $list), '查询工单进度成功');
    }

    /**
     * GET /api/dashboard/equipment-status
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function equipmentStatus($params)
    {
        $equipments = Db::all(
            'SELECT id, code, name, status FROM equipment ORDER BY code ASC'
        );
        $summary = array(
            'running' => 0,
            'idle' => 0,
            'stopped' => 0,
            'fault' => 0,
            'total' => count($equipments),
            'details' => array(),
        );
        foreach ($equipments as $equipment) {
            $summary['details'][] = array(
                'id' => (int) $equipment['id'],
                'code' => $equipment['code'],
                'name' => $equipment['name'],
                'status' => $equipment['status'],
            );
            if (isset($summary[$equipment['status']])) {
                $summary[$equipment['status']] += 1;
            }
        }
        Http::ok($summary, '查询设备状态成功');
    }

    /**
     * GET /api/dashboard/output-trend
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function outputTrend($params)
    {
        $days = Http::queryInt('days');
        if ($days === null || $days < 1) {
            $days = 7;
        }
        if ($days > 90) {
            $days = 90;
        }

        $tz = new DateTimeZone(date_default_timezone_get());
        $startLocal = new DateTime('today', $tz);
        $startLocal->modify('-' . ($days - 1) . ' days');
        $startUtc = clone $startLocal;
        $startUtc->setTimezone(new DateTimeZone('UTC'));
        $endLocal = new DateTime('tomorrow', $tz);
        $endLocal->setTimezone(new DateTimeZone('UTC'));

        $reports = Db::all(
            'SELECT completedQty, defectQty, reportTime FROM production_reports'
            . ' WHERE reportTime >= ? AND reportTime < ?',
            array(Db::dateTimeParam($startUtc), Db::dateTimeParam($endLocal)),
            'production_reports'
        );

        $dates = array();
        $outputs = array();
        $defects = array();
        for ($i = 0; $i < $days; $i++) {
            $date = clone $startLocal;
            $date->modify('+' . $i . ' days');
            $dates[] = $date->format('Y-m-d');
            $outputs[] = 0;
            $defects[] = 0;
        }

        $indexMap = array_flip($dates);
        foreach ($reports as $report) {
            $key = Db::localDateKey($report['reportTime']);
            if (!isset($indexMap[$key])) {
                continue;
            }
            $index = $indexMap[$key];
            $outputs[$index] += (int) $report['completedQty'];
            $defects[$index] += (int) $report['defectQty'];
        }

        Http::ok(array('dates' => $dates, 'outputs' => $outputs, 'defects' => $defects), '查询产量趋势成功');
    }

    /**
     * GET /api/dashboard/quality-summary
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function qualitySummary($params)
    {
        $date = Http::query('date');
        if ($date === null || $date === '') {
            $date = date('Y-m-d');
        }
        list($start, $end) = Db::localDateRange($date);

        $reports = Db::all(
            'SELECT completedQty, defectQty FROM production_reports WHERE reportTime >= ? AND reportTime < ?',
            array($start, $end)
        );
        $totalOutput = 0;
        $defectCount = 0;
        foreach ($reports as $report) {
            $totalOutput += (int) $report['completedQty'];
            $defectCount += (int) $report['defectQty'];
        }
        $total = $totalOutput + $defectCount;
        $defectRate = $total > 0 ? round($defectCount / $total * 1000) / 10 : 0;
        $passRate = $total > 0 ? round($totalOutput / $total * 1000) / 10 : 0;

        Http::ok(array(
            'totalOutput' => $totalOutput,
            'defectCount' => $defectCount,
            'defectRate' => $defectRate,
            'passRate' => $passRate,
        ), '查询质量摘要成功');
    }
}

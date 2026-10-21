<?php
/**
 * MES 系统 - 报表中心接口（OEE / 生产 / 质量 / 库存 / 工时 + Excel 导出）
 * OEE 口径与 Node 端架构文档 §8.1 完全一致。
 */

class ReportController
{
    /**
     * 保留 2 位小数
     * @param float $value 值
     * @return float
     */
    private static function round2($value)
    {
        return round($value * 100) / 100;
    }

    /**
     * 本地日期字符串 → 本地零点时间戳
     * @param string $date YYYY-MM-DD
     * @return int
     */
    private static function localStart($date)
    {
        $dt = new DateTime($date . ' 00:00:00', new DateTimeZone(date_default_timezone_get()));
        return $dt->getTimestamp();
    }

    /**
     * 解析查询区间 [start, end)
     * @param int $defaultDays 默认天数
     * @return array{0:int,1:int}
     */
    private static function parseRange($defaultDays = 7)
    {
        $startDate = Http::query('startDate');
        $endDate = Http::query('endDate');
        $today = self::localStart(date('Y-m-d'));
        $start = $startDate !== null
            ? self::localStart($startDate)
            : $today - ($defaultDays - 1) * 86400;
        $end = $endDate !== null
            ? self::localStart($endDate) + 86400
            : $today + 86400;
        if ($start >= $end) {
            throw new HttpException('startDate 不能晚于 endDate', 400);
        }
        return array($start, $end);
    }

    /**
     * 构建分桶
     * @param int $start 区间起
     * @param int $end 区间止
     * @param string $dimension day|week|month
     * @return array<int,array<string,mixed>>
     */
    private static function buildBuckets($start, $end, $dimension)
    {
        $buckets = array();
        $tz = new DateTimeZone(date_default_timezone_get());

        if ($dimension === 'month') {
            $cursor = new DateTime(date('Y-m-01', $start) . ' 00:00:00', $tz);
            while ($cursor->getTimestamp() < $end) {
                $next = clone $cursor;
                $next->modify('+1 month');
                $bucketStart = max($start, $cursor->getTimestamp());
                $bucketEnd = min($end, $next->getTimestamp());
                $buckets[] = array(
                    'start' => $bucketStart,
                    'end' => $bucketEnd,
                    'label' => $cursor->format('Y-m'),
                );
                $cursor = $next;
            }
            return $buckets;
        }

        if ($dimension === 'week') {
            $dt = new DateTime(date('Y-m-d', $start) . ' 00:00:00', $tz);
            $weekday = (int) $dt->format('N');
            $dt->modify('-' . ($weekday - 1) . ' days');
            while ($dt->getTimestamp() < $end) {
                $next = clone $dt;
                $next->modify('+7 days');
                $buckets[] = array(
                    'start' => max($start, $dt->getTimestamp()),
                    'end' => min($end, $next->getTimestamp()),
                    'label' => $dt->format('Y-m-d'),
                );
                $dt = $next;
            }
            return $buckets;
        }

        $dt = new DateTime(date('Y-m-d', $start) . ' 00:00:00', $tz);
        while ($dt->getTimestamp() < $end) {
            $next = clone $dt;
            $next->modify('+1 day');
            $buckets[] = array(
                'start' => max($start, $dt->getTimestamp()),
                'end' => min($end, $next->getTimestamp()),
                'label' => $dt->format('Y-m-d'),
            );
            $dt = $next;
        }
        return $buckets;
    }

    /**
     * OEE 基础数据
     * @param int $rangeStart 起
     * @param int $rangeEnd 止
     * @return array<string,mixed>
     */
    private static function fetchOeeBase($rangeStart, $rangeEnd)
    {
        $equipmentId = Http::queryInt('equipmentId');
        $scope = $equipmentId !== null ? array($equipmentId) : array();

        $scheduleSql = 'SELECT ps.*, wo.quantity AS woQuantity, wo.planStart AS woPlanStart,'
            . ' wo.planEnd AS woPlanEnd FROM production_schedules ps'
            . ' LEFT JOIN work_orders wo ON wo.id = ps.workOrderId'
            . ' WHERE ps.status <> ? AND ps.plannedStart < ? AND ps.plannedEnd > ?';
        $scheduleBind = array('cancelled', self::dbTime($rangeEnd), self::dbTime($rangeStart));
        if (count($scope) > 0) {
            $scheduleSql .= ' AND ps.equipmentId = ?';
            $scheduleBind[] = $scope[0];
        }
        $scheduleSql .= ' ORDER BY ps.plannedStart ASC';
        $schedules = Db::all($scheduleSql, $scheduleBind, 'production_schedules');

        $logSql = 'SELECT equipmentId, newStatus, changedAt FROM equipment_status_logs'
            . ' WHERE changedAt <= ?';
        $logBind = array(self::dbTime($rangeEnd));
        if (count($scope) > 0) {
            $logSql .= ' AND equipmentId = ?';
            $logBind[] = $scope[0];
        }
        $logSql .= ' ORDER BY equipmentId ASC, changedAt ASC';
        $logs = Db::all($logSql, $logBind, 'equipment_status_logs');

        $reportSql = 'SELECT workOrderId, completedQty, defectQty, reportTime FROM production_reports'
            . ' WHERE reportTime >= ? AND reportTime < ?';
        $reports = Db::all(
            $reportSql,
            array(self::dbTime($rangeStart), self::dbTime($rangeEnd)),
            'production_reports'
        );

        $equipmentSql = 'SELECT id, code, name FROM equipment';
        $equipmentBind = array();
        if (count($scope) > 0) {
            $equipmentSql .= ' WHERE id = ?';
            $equipmentBind[] = $scope[0];
        }
        $equipmentSql .= ' ORDER BY code ASC';
        $equipmentList = Db::all($equipmentSql, $equipmentBind);

        // 停机区间
        $logsByEquipment = array();
        foreach ($logs as $log) {
            $equipmentKey = (int) $log['equipmentId'];
            if (!isset($logsByEquipment[$equipmentKey])) {
                $logsByEquipment[$equipmentKey] = array();
            }
            $logsByEquipment[$equipmentKey][] = $log;
        }
        $downtimeSegments = array();
        foreach ($logsByEquipment as $equipmentKey => $equipmentLogs) {
            $segments = self::deriveDowntime($equipmentLogs, $rangeStart, $rangeEnd);
            if (count($segments) > 0) {
                $downtimeSegments[$equipmentKey] = $segments;
            }
        }

        // 工单 → 设备集合
        $orderEquipmentMap = array();
        foreach ($schedules as $schedule) {
            if ($schedule['equipmentId'] === null) {
                continue;
            }
            $orderId = (int) $schedule['workOrderId'];
            if (!isset($orderEquipmentMap[$orderId])) {
                $orderEquipmentMap[$orderId] = array();
            }
            $orderEquipmentMap[$orderId][(int) $schedule['equipmentId']] = true;
        }

        return array(
            'schedules' => $schedules,
            'downtimeSegments' => $downtimeSegments,
            'reports' => $reports,
            'equipmentList' => $equipmentList,
            'orderEquipmentMap' => $orderEquipmentMap,
            'scope' => $scope,
        );
    }

    /**
     * 时间戳 → 数据库参数
     * @param int $ts 时间戳
     * @return mixed
     */
    private static function dbTime($ts)
    {
        $dt = new DateTime('@' . $ts);
        $dt->setTimezone(new DateTimeZone('UTC'));
        return Db::dateTimeParam($dt);
    }

    /**
     * 停机区间推导
     * @param array<int,array<string,mixed>> $logs 状态日志（升序）
     * @param int $rangeStart 起
     * @param int $rangeEnd 止
     * @return array<int,array{0:int,1:int}>
     */
    private static function deriveDowntime($logs, $rangeStart, $rangeEnd)
    {
        $segments = array();
        $openStart = null;
        $downtimeStates = array('stopped' => true, 'fault' => true);
        $uptimeStates = array('running' => true, 'idle' => true);

        foreach ($logs as $log) {
            $changedAt = strtotime($log['changedAt']);
            if (isset($downtimeStates[$log['newStatus']])) {
                if ($openStart === null) {
                    $openStart = $changedAt;
                }
            } elseif (isset($uptimeStates[$log['newStatus']])) {
                if ($openStart !== null) {
                    $segments[] = array($openStart, $changedAt);
                    $openStart = null;
                }
            }
        }
        if ($openStart !== null) {
            $segments[] = array($openStart, $rangeEnd);
        }

        $result = array();
        foreach ($segments as $segment) {
            $start = max($segment[0], $rangeStart);
            $end = min($segment[1], $rangeEnd);
            if ($end > $start) {
                $result[] = array($start, $end);
            }
        }
        return $result;
    }

    /**
     * 标准节拍（小时/件）
     * @param array<string,mixed> $schedule 排程行
     * @return float|null
     */
    private static function tactTime($schedule)
    {
        if ($schedule['woPlanStart'] === null || $schedule['woPlanEnd'] === null) {
            return null;
        }
        $durationHours = (strtotime($schedule['woPlanEnd']) - strtotime($schedule['woPlanStart'])) / 3600;
        $quantity = (int) $schedule['woQuantity'];
        if (!($durationHours > 0) || $quantity <= 0) {
            return null;
        }
        return $durationHours / $quantity;
    }

    /**
     * 子区间 OEE 指标
     * @param array<string,mixed> $base 基础数据
     * @param int $start 起
     * @param int $end 止
     * @param array<int,int>|null $scope 设备范围
     * @return array<string,mixed>
     */
    private static function computeMetrics($base, $start, $end, $scope = null)
    {
        $hasScope = is_array($scope) && count($scope) > 0;
        $scopeSet = $hasScope ? array_flip($scope) : null;

        $plannedTime = 0.0;
        $theoreticalQty = 0.0;
        foreach ($base['schedules'] as $schedule) {
            if ($scopeSet !== null
                && ($schedule['equipmentId'] === null || !isset($scopeSet[(int) $schedule['equipmentId']]))) {
                continue;
            }
            $segmentStart = max($start, strtotime($schedule['plannedStart']));
            $segmentEnd = min($end, strtotime($schedule['plannedEnd']));
            $hours = ($segmentEnd - $segmentStart) / 3600;
            if ($hours <= 0) {
                continue;
            }
            $plannedTime += $hours;
            $tact = self::tactTime($schedule);
            if ($tact !== null && $tact > 0) {
                $theoreticalQty += $hours / $tact;
            }
        }

        $downtime = 0.0;
        foreach ($base['downtimeSegments'] as $equipmentId => $segments) {
            if ($scopeSet !== null && !isset($scopeSet[(int) $equipmentId])) {
                continue;
            }
            foreach ($segments as $segment) {
                $clippedStart = max($segment[0], $start);
                $clippedEnd = min($segment[1], $end);
                if ($clippedEnd > $clippedStart) {
                    $downtime += ($clippedEnd - $clippedStart) / 3600;
                }
            }
        }

        $actualQty = 0;
        $completedQty = 0;
        $defectQty = 0;
        foreach ($base['reports'] as $report) {
            $reportTime = strtotime($report['reportTime']);
            if ($reportTime < $start || $reportTime >= $end) {
                continue;
            }
            if ($scopeSet !== null) {
                $orderId = (int) $report['workOrderId'];
                $equipmentSet = isset($base['orderEquipmentMap'][$orderId])
                    ? $base['orderEquipmentMap'][$orderId] : array();
                $matched = false;
                foreach (array_keys($equipmentSet) as $equipmentId) {
                    if (isset($scopeSet[$equipmentId])) {
                        $matched = true;
                        break;
                    }
                }
                if (!$matched) {
                    continue;
                }
            }
            $actualQty += (int) $report['completedQty'];
            $completedQty += (int) $report['completedQty'];
            $defectQty += (int) $report['defectQty'];
        }

        $availability = $plannedTime > 0
            ? self::round2(($plannedTime - $downtime) / $plannedTime * 100) : null;
        $performance = $theoreticalQty > 0
            ? self::round2(min($actualQty / $theoreticalQty, 1) * 100) : null;
        $quality = $completedQty > 0
            ? self::round2(($completedQty - $defectQty) / $completedQty * 100) : null;
        $oee = ($availability === null || $performance === null || $quality === null)
            ? null
            : self::round2(($availability / 100) * ($performance / 100) * ($quality / 100) * 100);

        return array(
            'availability' => $availability,
            'performance' => $performance,
            'quality' => $quality,
            'oee' => $oee,
            'plannedTime' => self::round2($plannedTime),
            'downtime' => self::round2($downtime),
            'actualQty' => $actualQty,
            'theoreticalQty' => self::round2($theoreticalQty),
            'completedQty' => $completedQty,
            'defectQty' => $defectQty,
            'goodQty' => $completedQty - $defectQty,
            'overProduced' => $theoreticalQty > 0 && $actualQty > $theoreticalQty,
            'insufficientData' => $availability === null || $performance === null || $quality === null,
        );
    }

    /**
     * GET /api/reports/oee/summary
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function oeeSummary($params)
    {
        list($start, $end) = self::parseRange(7);
        $base = self::fetchOeeBase($start, $end);
        $metrics = self::computeMetrics($base, $start, $end, $base['scope']);

        Http::ok(array(
            'availability' => $metrics['availability'],
            'performance' => $metrics['performance'],
            'quality' => $metrics['quality'],
            'oee' => $metrics['oee'],
            'plannedTime' => $metrics['plannedTime'],
            'downtime' => $metrics['downtime'],
            'actualQty' => $metrics['actualQty'],
            'theoreticalQty' => $metrics['theoreticalQty'],
            'goodQty' => $metrics['goodQty'],
            'insufficientData' => $metrics['insufficientData'],
        ), '查询成功');
    }

    /**
     * GET /api/reports/oee/trend
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function oeeTrend($params)
    {
        $dimension = Http::query('dimension');
        if ($dimension === null) {
            $dimension = 'day';
        }
        if (!in_array($dimension, array('day', 'week', 'month'), true)) {
            throw new HttpException('dimension 仅支持 day / week / month', 400);
        }

        list($start, $end) = self::parseRange(7);
        $base = self::fetchOeeBase($start, $end);
        $points = array();
        foreach (self::buildBuckets($start, $end, $dimension) as $bucket) {
            $metrics = self::computeMetrics($base, $bucket['start'], $bucket['end'], $base['scope']);
            $points[] = array(
                'date' => $bucket['label'],
                'availability' => $metrics['availability'],
                'performance' => $metrics['performance'],
                'quality' => $metrics['quality'],
                'oee' => $metrics['oee'],
            );
        }
        Http::ok(array('points' => $points), '查询成功');
    }

    /**
     * OEE 明细数据
     * @param array<string,mixed> $base 基础数据
     * @param int $start 起
     * @param int $end 止
     * @return array<int,array<string,mixed>>
     */
    private static function oeeDetailRows($base, $start, $end)
    {
        $rows = array();
        foreach ($base['equipmentList'] as $equipment) {
            $metrics = self::computeMetrics($base, $start, $end, array((int) $equipment['id']));
            $rows[] = array(
                'equipmentId' => (int) $equipment['id'],
                'equipmentCode' => $equipment['code'],
                'equipmentName' => $equipment['name'],
                'shiftId' => null,
                'shiftName' => '全部班次',
                'plannedTime' => $metrics['plannedTime'],
                'downtime' => $metrics['downtime'],
                'availability' => $metrics['availability'],
                'actualQty' => $metrics['actualQty'],
                'theoreticalQty' => $metrics['theoreticalQty'],
                'performance' => $metrics['performance'],
                'completedQty' => $metrics['completedQty'],
                'defectQty' => $metrics['defectQty'],
                'quality' => $metrics['quality'],
                'oee' => $metrics['oee'],
                'overProduced' => $metrics['overProduced'],
            );
        }
        usort($rows, function ($a, $b) {
            return strcmp($a['equipmentCode'], $b['equipmentCode']);
        });
        return $rows;
    }

    /**
     * GET /api/reports/oee/details
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function oeeDetails($params)
    {
        list($start, $end) = self::parseRange(7);
        $page = Http::queryInt('page');
        $pageSize = Http::queryInt('pageSize');
        if ($page === null || $page < 1) {
            $page = 1;
        }
        if ($pageSize === null || $pageSize < 1) {
            $pageSize = 10;
        }
        if ($pageSize > 200) {
            $pageSize = 200;
        }

        $base = self::fetchOeeBase($start, $end);
        $rows = self::oeeDetailRows($base, $start, $end);
        Http::ok(array(
            'list' => array_slice($rows, ($page - 1) * $pageSize, $pageSize),
            'total' => count($rows),
        ), '查询成功');
    }

    /**
     * 生产报表数据
     * @return array<int,array<string,mixed>>
     */
    private static function productionRows()
    {
        $type = Http::query('type');
        if ($type === null) {
            $type = 'daily';
        }
        if (!in_array($type, array('daily', 'weekly', 'monthly'), true)) {
            throw new HttpException('type 仅支持 daily / weekly / monthly', 400);
        }
        list($start, $end) = self::parseRange(30);

        $orders = Db::all(
            'SELECT quantity, createdAt FROM work_orders WHERE createdAt >= ? AND createdAt < ?',
            array(self::dbTime($start), self::dbTime($end)),
            'work_orders'
        );
        $reports = Db::all(
            'SELECT completedQty, defectQty, reportTime FROM production_reports'
            . ' WHERE reportTime >= ? AND reportTime < ?',
            array(self::dbTime($start), self::dbTime($end)),
            'production_reports'
        );

        $list = array();
        foreach (self::buildBuckets($start, $end, $type) as $bucket) {
            $orderCount = 0;
            $plannedQty = 0;
            foreach ($orders as $order) {
                $created = strtotime($order['createdAt']);
                if ($created >= $bucket['start'] && $created < $bucket['end']) {
                    $orderCount += 1;
                    $plannedQty += (int) $order['quantity'];
                }
            }
            $completedQty = 0;
            $defectQty = 0;
            foreach ($reports as $report) {
                $reportTime = strtotime($report['reportTime']);
                if ($reportTime >= $bucket['start'] && $reportTime < $bucket['end']) {
                    $completedQty += (int) $report['completedQty'];
                    $defectQty += (int) $report['defectQty'];
                }
            }
            $list[] = array(
                'period' => $bucket['label'],
                'orderCount' => $orderCount,
                'plannedQty' => $plannedQty,
                'completedQty' => $completedQty,
                'defectQty' => $defectQty,
                'achieveRate' => $plannedQty > 0 ? self::round2($completedQty / $plannedQty * 100) : null,
                'defectRate' => $completedQty > 0 ? self::round2($defectQty / $completedQty * 100) : null,
            );
        }
        return $list;
    }

    /**
     * GET /api/reports/production
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function production($params)
    {
        Http::ok(array('list' => self::productionRows()), '查询成功');
    }

    /**
     * 质量报表数据
     * @return array<string,mixed>
     */
    private static function qualityData()
    {
        list($start, $end) = self::parseRange(30);
        $inspections = Db::all(
            'SELECT result, inspectionTime FROM quality_inspections'
            . ' WHERE inspectionTime >= ? AND inspectionTime < ?',
            array(self::dbTime($start), self::dbTime($end)),
            'quality_inspections'
        );
        $defects = Db::all(
            'SELECT defectType, quantity, handlingMethod FROM defect_records'
            . ' WHERE createdAt >= ? AND createdAt < ?',
            array(self::dbTime($start), self::dbTime($end)),
            'defect_records'
        );

        $list = array();
        foreach (self::buildBuckets($start, $end, 'day') as $bucket) {
            $passCount = 0;
            $failCount = 0;
            $concessionCount = 0;
            foreach ($inspections as $inspection) {
                $time = strtotime($inspection['inspectionTime']);
                if ($time < $bucket['start'] || $time >= $bucket['end']) {
                    continue;
                }
                if ($inspection['result'] === 'pass') {
                    $passCount += 1;
                } elseif ($inspection['result'] === 'fail') {
                    $failCount += 1;
                } else {
                    $concessionCount += 1;
                }
            }
            $total = $passCount + $failCount + $concessionCount;
            $list[] = array(
                'period' => $bucket['label'],
                'inspectionCount' => $total,
                'passCount' => $passCount,
                'failCount' => $failCount,
                'concessionCount' => $concessionCount,
                'passRate' => $total > 0 ? self::round2($passCount / $total * 100) : null,
            );
        }

        $passTotal = 0;
        foreach ($inspections as $inspection) {
            if ($inspection['result'] === 'pass') {
                $passTotal += 1;
            }
        }
        $passRate = count($inspections) > 0
            ? self::round2($passTotal / count($inspections) * 100) : null;

        $byType = array();
        $totalDefectQty = 0;
        foreach ($defects as $defect) {
            $key = $defect['defectType'];
            if (!isset($byType[$key])) {
                $byType[$key] = 0;
            }
            $byType[$key] += (int) $defect['quantity'];
            $totalDefectQty += (int) $defect['quantity'];
        }
        $defectTop = array();
        foreach ($byType as $defectType => $quantity) {
            $defectTop[] = array(
                'defectType' => $defectType,
                'quantity' => $quantity,
                'ratio' => $totalDefectQty > 0 ? self::round2($quantity / $totalDefectQty * 100) : 0,
            );
        }
        usort($defectTop, function ($a, $b) {
            return $b['quantity'] - $a['quantity'];
        });
        $defectTop = array_slice($defectTop, 0, 5);

        $handling = array();
        foreach ($defects as $defect) {
            $method = $defect['handlingMethod'] === null || $defect['handlingMethod'] === ''
                ? '未处理' : $defect['handlingMethod'];
            if (!isset($handling[$method])) {
                $handling[$method] = 0;
            }
            $handling[$method] += (int) $defect['quantity'];
        }
        $handlingDist = array();
        foreach ($handling as $method => $quantity) {
            $handlingDist[] = array('handlingMethod' => $method, 'quantity' => $quantity);
        }

        return array(
            'list' => $list,
            'passRate' => $passRate,
            'defectTop' => $defectTop,
            'handlingDist' => $handlingDist,
        );
    }

    /**
     * GET /api/reports/quality
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function quality($params)
    {
        Http::ok(self::qualityData(), '查询成功');
    }

    /**
     * 库存报表数据
     * @return array<string,mixed>
     */
    private static function inventoryData()
    {
        $category = Http::query('category');
        $warehouse = Http::query('warehouse');
        $where = array();
        $bind = array();
        if ($category !== null) {
            $where[] = 'm.category = ?';
            $bind[] = $category;
        }
        if ($warehouse !== null) {
            $where[] = 'inv.warehouse = ?';
            $bind[] = $warehouse;
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $rows = Db::all(
            'SELECT inv.quantity, inv.safetyStock, inv.maxStock, inv.warehouse, inv.location,'
            . ' m.code AS code, m.name AS name, m.specification AS specification,'
            . ' m.unit AS unit, m.category AS category'
            . ' FROM inventory inv LEFT JOIN materials m ON m.id = inv.materialId'
            . $whereSql . ' ORDER BY inv.id ASC',
            $bind,
            'inventory'
        );

        $list = array();
        foreach ($rows as $row) {
            $warning = MaterialController::evaluateWarning($row);
            $list[] = array(
                'materialCode' => $row['code'] === null ? '-' : $row['code'],
                'materialName' => $row['name'] === null ? '-' : $row['name'],
                'specification' => $row['specification'] === null ? '-' : $row['specification'],
                'unit' => $row['unit'] === null ? '-' : $row['unit'],
                'category' => $row['category'] === null ? '-' : $row['category'],
                'warehouse' => $row['warehouse'],
                'location' => $row['location'],
                'quantity' => (float) $row['quantity'],
                'safetyStock' => (float) $row['safetyStock'],
                'maxStock' => (float) $row['maxStock'],
                'level' => $warning['level'],
                'isLowStock' => $warning['isLowStock'],
            );
        }

        $warnings = array();
        foreach ($list as $item) {
            if (!$item['isLowStock']) {
                continue;
            }
            $warning = MaterialController::evaluateWarning($item);
            $item['shortage'] = $warning['shortage'];
            $item['shortageRatio'] = $warning['shortageRatio'];
            $warnings[] = $item;
        }
        usort($warnings, function ($a, $b) {
            if ($a['level'] !== $b['level']) {
                return $a['level'] === 'critical' ? -1 : 1;
            }
            if ($a['shortageRatio'] == $b['shortageRatio']) {
                return 0;
            }
            return $a['shortageRatio'] < $b['shortageRatio'] ? 1 : -1;
        });

        return array('list' => $list, 'warnings' => $warnings);
    }

    /**
     * GET /api/reports/inventory
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function inventory($params)
    {
        Http::ok(self::inventoryData(), '查询成功');
    }

    /**
     * GET /api/reports/workhours
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function workHours($params)
    {
        $dimension = Http::query('dimension');
        if ($dimension === null) {
            $dimension = 'user';
        }
        if (!in_array($dimension, array('user', 'shift', 'date', 'workOrder'), true)) {
            throw new HttpException('dimension 仅支持 user / shift / date / workOrder', 400);
        }
        Http::ok(PersonnelController::summaryData(
            $dimension,
            Http::query('startDate'),
            Http::query('endDate')
        ), '查询成功');
    }

    /**
     * 工时效率数据
     * @return array<int,array<string,mixed>>
     */
    private static function efficiencyRows()
    {
        list($start, $end) = self::parseRange(30);
        $records = Db::all(
            'SELECT wh.userId, wh.hours, u.name AS userName FROM work_hours_records wh'
            . ' LEFT JOIN users u ON u.id = wh.userId'
            . ' WHERE wh.userId IS NOT NULL AND wh.workDate >= ? AND wh.workDate < ?',
            array(self::dbTime($start), self::dbTime($end)),
            'work_hours_records'
        );
        $reports = Db::all(
            'SELECT operatorId, completedQty FROM production_reports'
            . ' WHERE operatorId IS NOT NULL AND reportTime >= ? AND reportTime < ?',
            array(self::dbTime($start), self::dbTime($end))
        );

        $groups = array();
        foreach ($records as $record) {
            $key = (int) $record['userId'];
            if (!isset($groups[$key])) {
                $groups[$key] = array(
                    'userName' => $record['userName'] === null ? '未指定人员' : $record['userName'],
                    'totalHours' => 0,
                    'totalOutput' => 0,
                );
            }
            $groups[$key]['totalHours'] += (float) $record['hours'];
        }
        foreach ($reports as $report) {
            $key = (int) $report['operatorId'];
            if (isset($groups[$key])) {
                $groups[$key]['totalOutput'] += (int) $report['completedQty'];
            }
        }

        $list = array();
        foreach ($groups as $group) {
            $list[] = array(
                'userName' => $group['userName'],
                'totalHours' => self::round2($group['totalHours']),
                'totalOutput' => $group['totalOutput'],
                'outputPerHour' => $group['totalHours'] > 0
                    ? self::round2($group['totalOutput'] / $group['totalHours']) : null,
            );
        }
        usort($list, function ($a, $b) {
            if ($a['totalHours'] == $b['totalHours']) {
                return 0;
            }
            return $a['totalHours'] < $b['totalHours'] ? 1 : -1;
        });
        return $list;
    }

    /**
     * GET /api/reports/workhours/efficiency
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function workHoursEfficiency($params)
    {
        Http::ok(array('list' => self::efficiencyRows()), '查询成功');
    }

    /**
     * 导出日期标签
     * @return string
     */
    private static function dateTag()
    {
        return date('Ymd');
    }

    /**
     * GET /api/reports/oee/export
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function exportOee($params)
    {
        list($start, $end) = self::parseRange(7);
        $base = self::fetchOeeBase($start, $end);
        $metrics = self::computeMetrics($base, $start, $end, $base['scope']);
        $details = self::oeeDetailRows($base, $start, $end);

        $summaryRows = array(
            array('name' => '计划生产时间（小时）', 'value' => $metrics['plannedTime']),
            array('name' => '停机时间（小时）', 'value' => $metrics['downtime']),
            array('name' => '时间稼动率 Availability（%）', 'value' => $metrics['availability']),
            array('name' => '理论产量（基于计划估算）', 'value' => $metrics['theoreticalQty']),
            array('name' => '实际产量', 'value' => $metrics['actualQty']),
            array('name' => '性能稼动率 Performance（%）', 'value' => $metrics['performance']),
            array('name' => '良品数', 'value' => $metrics['goodQty']),
            array('name' => '良品率 Quality（%）', 'value' => $metrics['quality']),
            array('name' => 'OEE（%）', 'value' => $metrics['oee']),
        );
        foreach ($details as $index => $row) {
            $details[$index]['remark'] = $row['overProduced'] ? '超产' : '';
        }

        $buffer = Xlsx::build(array(
            array(
                'name' => 'OEE汇总',
                'title' => 'OEE 汇总（OEE = 时间稼动率 × 性能稼动率 × 良品率；性能稼动率基于计划数据估算）',
                'columns' => array(
                    array('header' => '指标', 'key' => 'name', 'width' => 32),
                    array('header' => '数值', 'key' => 'value', 'width' => 16, 'type' => 'number'),
                ),
                'rows' => $summaryRows,
            ),
            array(
                'name' => 'OEE明细',
                'title' => 'OEE 明细（按设备分组）',
                'columns' => array(
                    array('header' => '设备编码', 'key' => 'equipmentCode', 'width' => 14),
                    array('header' => '设备名称', 'key' => 'equipmentName', 'width' => 18),
                    array('header' => '班次', 'key' => 'shiftName', 'width' => 12),
                    array('header' => '计划时间(h)', 'key' => 'plannedTime', 'width' => 14, 'type' => 'number'),
                    array('header' => '停机时间(h)', 'key' => 'downtime', 'width' => 14, 'type' => 'number'),
                    array('header' => '时间稼动率(%)', 'key' => 'availability', 'width' => 14, 'type' => 'number'),
                    array('header' => '实际产量', 'key' => 'actualQty', 'width' => 12, 'type' => 'number'),
                    array('header' => '理论产量', 'key' => 'theoreticalQty', 'width' => 12, 'type' => 'number'),
                    array('header' => '性能稼动率(%)', 'key' => 'performance', 'width' => 14, 'type' => 'number'),
                    array('header' => '完成数量', 'key' => 'completedQty', 'width' => 12, 'type' => 'number'),
                    array('header' => '不良数量', 'key' => 'defectQty', 'width' => 12, 'type' => 'number'),
                    array('header' => '良品率(%)', 'key' => 'quality', 'width' => 12, 'type' => 'number'),
                    array('header' => 'OEE(%)', 'key' => 'oee', 'width' => 12, 'type' => 'number'),
                    array('header' => '备注', 'key' => 'remark', 'width' => 10),
                ),
                'rows' => $details,
            ),
        ));

        Xlsx::download($buffer, 'OEE分析报表_' . self::dateTag() . '.xlsx');
    }

    /**
     * GET /api/reports/production/export
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function exportProduction($params)
    {
        $buffer = Xlsx::build(array(
            array(
                'name' => '生产报表',
                'title' => '生产报表（达成率 = 完成量 / 计划量；不良率 = 不良量 / 完成量）',
                'columns' => array(
                    array('header' => '期间', 'key' => 'period', 'width' => 16),
                    array('header' => '工单数', 'key' => 'orderCount', 'width' => 12, 'type' => 'number'),
                    array('header' => '计划量', 'key' => 'plannedQty', 'width' => 12, 'type' => 'number'),
                    array('header' => '完成量', 'key' => 'completedQty', 'width' => 12, 'type' => 'number'),
                    array('header' => '不良量', 'key' => 'defectQty', 'width' => 12, 'type' => 'number'),
                    array('header' => '达成率(%)', 'key' => 'achieveRate', 'width' => 12, 'type' => 'number'),
                    array('header' => '不良率(%)', 'key' => 'defectRate', 'width' => 12, 'type' => 'number'),
                ),
                'rows' => self::productionRows(),
            ),
        ));
        Xlsx::download($buffer, '生产报表_' . self::dateTag() . '.xlsx');
    }

    /**
     * GET /api/reports/quality/export
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function exportQuality($params)
    {
        $data = self::qualityData();
        $buffer = Xlsx::build(array(
            array(
                'name' => '质量日报',
                'title' => '质量检验日报',
                'columns' => array(
                    array('header' => '日期', 'key' => 'period', 'width' => 16),
                    array('header' => '检验次数', 'key' => 'inspectionCount', 'width' => 12, 'type' => 'number'),
                    array('header' => '合格', 'key' => 'passCount', 'width' => 10, 'type' => 'number'),
                    array('header' => '不合格', 'key' => 'failCount', 'width' => 10, 'type' => 'number'),
                    array('header' => '让步接收', 'key' => 'concessionCount', 'width' => 12, 'type' => 'number'),
                    array('header' => '合格率(%)', 'key' => 'passRate', 'width' => 12, 'type' => 'number'),
                ),
                'rows' => $data['list'],
            ),
            array(
                'name' => '不良Top5',
                'title' => '不良类型 Top5',
                'columns' => array(
                    array('header' => '不良类型', 'key' => 'defectType', 'width' => 20),
                    array('header' => '数量', 'key' => 'quantity', 'width' => 12, 'type' => 'number'),
                    array('header' => '占比(%)', 'key' => 'ratio', 'width' => 12, 'type' => 'number'),
                ),
                'rows' => $data['defectTop'],
            ),
            array(
                'name' => '处理方式分布',
                'title' => '不良处理方式分布',
                'columns' => array(
                    array('header' => '处理方式', 'key' => 'handlingMethod', 'width' => 16),
                    array('header' => '数量', 'key' => 'quantity', 'width' => 12, 'type' => 'number'),
                ),
                'rows' => $data['handlingDist'],
            ),
        ));
        Xlsx::download($buffer, '质量报表_' . self::dateTag() . '.xlsx');
    }

    /**
     * GET /api/reports/inventory/export
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function exportInventory($params)
    {
        $data = self::inventoryData();
        $columns = array(
            array('header' => '物料编码', 'key' => 'materialCode', 'width' => 16),
            array('header' => '物料名称', 'key' => 'materialName', 'width' => 18),
            array('header' => '规格', 'key' => 'specification', 'width' => 16),
            array('header' => '单位', 'key' => 'unit', 'width' => 8),
            array('header' => '分类', 'key' => 'category', 'width' => 12),
            array('header' => '仓库', 'key' => 'warehouse', 'width' => 12),
            array('header' => '库位', 'key' => 'location', 'width' => 12),
            array('header' => '当前库存', 'key' => 'quantity', 'width' => 12, 'type' => 'number'),
            array('header' => '安全库存', 'key' => 'safetyStock', 'width' => 12, 'type' => 'number'),
            array('header' => '最大库存', 'key' => 'maxStock', 'width' => 12, 'type' => 'number'),
        );

        $warnings = array();
        foreach ($data['warnings'] as $row) {
            $row['shortageRatio'] = self::round2($row['shortageRatio'] * 100);
            $row['levelText'] = $row['level'] === 'critical'
                ? '严重缺料' : ($row['level'] === 'warning' ? '库存预警' : '无预警');
            $warnings[] = $row;
        }

        $buffer = Xlsx::build(array(
            array(
                'name' => '库存明细',
                'title' => '库存明细报表',
                'columns' => $columns,
                'rows' => $data['list'],
            ),
            array(
                'name' => '库存预警',
                'title' => '库存预警清单（口径：quantity < safetyStock；critical 优先）',
                'columns' => array_merge($columns, array(
                    array('header' => '缺口量', 'key' => 'shortage', 'width' => 12, 'type' => 'number'),
                    array('header' => '缺口比例(%)', 'key' => 'shortageRatio', 'width' => 14, 'type' => 'number'),
                    array('header' => '预警等级', 'key' => 'levelText', 'width' => 12),
                )),
                'rows' => $warnings,
            ),
        ));
        Xlsx::download($buffer, '库存报表_' . self::dateTag() . '.xlsx');
    }

    /**
     * GET /api/reports/workhours/export
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function exportWorkHours($params)
    {
        $dimension = Http::query('dimension');
        if ($dimension === null) {
            $dimension = 'user';
        }
        if (!in_array($dimension, array('user', 'shift', 'date', 'workOrder'), true)) {
            throw new HttpException('dimension 仅支持 user / shift / date / workOrder', 400);
        }
        $labels = array(
            'user' => '按人员',
            'shift' => '按班次',
            'workOrder' => '按工单',
            'date' => '按日期',
        );

        $data = PersonnelController::summaryData(
            $dimension,
            Http::query('startDate'),
            Http::query('endDate')
        );

        $buffer = Xlsx::build(array(
            array(
                'name' => '工时报表',
                'title' => '工时报表（' . $labels[$dimension] . '）',
                'columns' => array(
                    array('header' => '分组名称', 'key' => 'dimensionName', 'width' => 20),
                    array('header' => '总工时(h)', 'key' => 'totalHours', 'width' => 14, 'type' => 'number'),
                    array('header' => '记录条数', 'key' => 'recordCount', 'width' => 12, 'type' => 'number'),
                    array('header' => '参与工单数', 'key' => 'workOrderCount', 'width' => 14, 'type' => 'number'),
                    array('header' => '日均工时(h)', 'key' => 'avgHoursPerDay', 'width' => 14, 'type' => 'number'),
                    array('header' => '平均单条时长(h)', 'key' => 'avgHoursPerRecord', 'width' => 16, 'type' => 'number'),
                    array('header' => '单位产品工时(h)', 'key' => 'hoursPerUnit', 'width' => 16, 'type' => 'number'),
                ),
                'rows' => $data['list'],
            ),
        ));
        Xlsx::download($buffer, '工时报表_' . self::dateTag() . '.xlsx');
    }
}

<?php
/**
 * MES 系统 - PHP 后端入口
 * ---------------------------------------------------------------------------
 * 与 Node 后端保持完全相同的接口路径、权限码、响应结构与 JWT 密钥，
 * 前端只需切换 API_BASE_URL 即可在两套后端之间切换。
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

$baseDir = dirname(__DIR__);

require $baseDir . '/src/Config.php';
require $baseDir . '/src/Db.php';
require $baseDir . '/src/Http.php';
require $baseDir . '/src/Jwt.php';
require $baseDir . '/src/Store.php';
require $baseDir . '/src/Denylist.php';
require $baseDir . '/src/Validate.php';
require $baseDir . '/src/Auth.php';
require $baseDir . '/src/Router.php';
require $baseDir . '/src/Xlsx.php';

require $baseDir . '/src/Controllers/AuthController.php';
require $baseDir . '/src/Controllers/UserController.php';
require $baseDir . '/src/Controllers/RoleController.php';
require $baseDir . '/src/Controllers/ProductionController.php';
require $baseDir . '/src/Controllers/ScheduleController.php';
require $baseDir . '/src/Controllers/EquipmentController.php';
require $baseDir . '/src/Controllers/MaintenanceController.php';
require $baseDir . '/src/Controllers/BreakdownController.php';
require $baseDir . '/src/Controllers/QualityController.php';
require $baseDir . '/src/Controllers/TraceController.php';
require $baseDir . '/src/Controllers/MaterialController.php';
require $baseDir . '/src/Controllers/PersonnelController.php';
require $baseDir . '/src/Controllers/DashboardController.php';
require $baseDir . '/src/Controllers/ReportController.php';

Config::load($baseDir);

// PHP 内置服务器：直接放行静态文件
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $file = __DIR__ . $path;
    if ($path !== '/' && is_file($file)) {
        return false;
    }
}

Http::boot();

// ==================== 配置安全自检 ====================
// 生产环境（NODE_ENV=production）下：
//   ① 必须存在 .env.production，否则会用默认值连错库、签发弱密钥，直接拒绝启动；
//   ② 密钥不安全时同样拒绝启动，避免弱密钥上线。
// 非生产环境只写日志，便于本地开发。
$configIssues = Config::securityIssues();
if (count($configIssues) > 0) {
    foreach ($configIssues as $configIssue) {
        Http::log('config_insecure', array('issue' => $configIssue));
    }
    if (Config::isProductionRuntime()) {
        Http::fail('服务配置不安全：' . implode('；', $configIssues), 503);
    }
}

// 全局限流：500 次 / 15 分钟 / IP（与 Node 端一致）
if (!RateLimit::allow('global:' . Http::clientIp(), 500, 900)) {
    Http::fail('请求过于频繁，请稍后再试', 429);
}

// ==================== 健康检查 ====================
Router::open('GET', '/api/health', function () {
    $dbHealth = Db::health();
    $healthy = $dbHealth['connected'];

    $startFile = Config::$baseDir . '/runtime/server_start';
    if (!is_file($startFile)) {
        @file_put_contents($startFile, (string) time());
    }
    $startedAt = (int) @file_get_contents($startFile);
    $uptime = $startedAt > 0 ? max(0, time() - $startedAt) : 0;

    Http::json($healthy ? 200 : 503, array(
        'status' => $healthy ? 'ok' : 'degraded',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'uptime' => $uptime,
        'service' => array(
            'name' => 'mes-management-backend-php',
            'version' => Config::version(),
            'env' => Config::nodeEnv(),
            'node' => 'PHP ' . PHP_VERSION,
        ),
        'database' => array(
            'type' => Config::dbType(),
            'connected' => $dbHealth['connected'],
            'latencyMs' => $dbHealth['latencyMs'],
            'error' => $dbHealth['error'],
        ),
        'insecureSecrets' => Config::hasInsecureSecrets(),
    ), $healthy ? '服务运行正常' : '服务运行异常：数据库连接失败');
});

// ==================== 认证 ====================
Router::open('POST', '/api/auth/login', array('AuthController', 'login'));
Router::open('POST', '/api/auth/refresh', array('AuthController', 'refresh'));
Router::open('POST', '/api/auth/logout', array('AuthController', 'logout'));
Router::add('GET', '/api/auth/profile', '@auth', array('AuthController', 'profile'));
Router::add('POST', '/api/auth/change-password', '@auth', array('AuthController', 'changePassword'));

// ==================== 用户 / 角色 / 权限 ====================
Router::add('GET', '/api/users', 'system:users:view', array('UserController', 'index'));
Router::add('GET', '/api/users/{id}', 'system:users:view', array('UserController', 'show'));
Router::add('POST', '/api/users', 'system:users:create', array('UserController', 'store'));
Router::add('PUT', '/api/users/{id}', 'system:users:edit', array('UserController', 'update'));
Router::add('PATCH', '/api/users/{id}/status', 'system:users:status', array('UserController', 'toggleStatus'));
Router::add('PATCH', '/api/users/{id}/password', 'system:users:edit', array('UserController', 'resetPassword'));
Router::add('DELETE', '/api/users/{id}', 'system:users:delete', array('UserController', 'destroy'));

Router::add('GET', '/api/roles', 'system:roles:view', array('RoleController', 'index'));
Router::add('GET', '/api/roles/{id}', 'system:roles:view', array('RoleController', 'show'));
Router::add('POST', '/api/roles', 'system:roles:create', array('RoleController', 'store'));
Router::add('PUT', '/api/roles/{id}', 'system:roles:edit', array('RoleController', 'update'));
Router::add('DELETE', '/api/roles/{id}', 'system:roles:delete', array('RoleController', 'destroy'));
Router::add('GET', '/api/roles/{id}/permissions', 'system:roles:view', array('RoleController', 'permissions'));
Router::add('PUT', '/api/roles/{id}/permissions', 'system:roles:assign', array('RoleController', 'assignPermissions'));
Router::add('GET', '/api/permissions', '@auth', array('RoleController', 'allPermissions'));

// ==================== 生产排程（必须先于 /production） ====================
Router::add('GET', '/api/production/schedules/conflicts', 'production:schedule:view', array('ScheduleController', 'conflicts'));
Router::add('GET', '/api/production/schedules', 'production:schedule:view', array('ScheduleController', 'index'));
Router::add('POST', '/api/production/schedules', 'production:schedule:create', array('ScheduleController', 'store'));
Router::add('PATCH', '/api/production/schedules/{id}/status', 'production:schedule:edit', array('ScheduleController', 'updateStatus'));
Router::add('PATCH', '/api/production/schedules/{id}', 'production:schedule:edit', array('ScheduleController', 'update'));
Router::add('DELETE', '/api/production/schedules/{id}', 'production:schedule:delete', array('ScheduleController', 'destroy'));

// ==================== 生产管理 ====================
Router::add('GET', '/api/production', 'production:order:view', array('ProductionController', 'index'));
Router::add('GET', '/api/production/{id}', 'production:order:view', array('ProductionController', 'show'));
Router::add('POST', '/api/production', 'production:order:create', array('ProductionController', 'store'));
Router::add('PUT', '/api/production/{id}', 'production:order:edit', array('ProductionController', 'update'));
Router::add('DELETE', '/api/production/{id}', 'production:order:delete', array('ProductionController', 'destroy'));
Router::add('PATCH', '/api/production/{id}/status', 'production:order:status', array('ProductionController', 'transition'));
Router::add('POST', '/api/production/{id}/reports', 'production:order:report', array('ProductionController', 'createReport'));

// ==================== 设备维保（必须先于 /equipment） ====================
Router::add('GET', '/api/equipment/maintenance/plans', 'equipment:maintenance:view', array('MaintenanceController', 'plans'));
Router::add('POST', '/api/equipment/maintenance/plans', 'equipment:maintenance:create', array('MaintenanceController', 'createPlan'));
Router::add('PUT', '/api/equipment/maintenance/plans/{id}', 'equipment:maintenance:edit', array('MaintenanceController', 'updatePlan'));
Router::add('DELETE', '/api/equipment/maintenance/plans/{id}', 'equipment:maintenance:delete', array('MaintenanceController', 'deletePlan'));
Router::add('GET', '/api/equipment/maintenance/records', 'equipment:maintenance:view', array('MaintenanceController', 'records'));
Router::add('POST', '/api/equipment/maintenance/records', 'equipment:maintenance:complete', array('MaintenanceController', 'createRecord'));
Router::add('PUT', '/api/equipment/maintenance/records/{id}', 'equipment:maintenance:complete', array('MaintenanceController', 'updateRecord'));
Router::add('DELETE', '/api/equipment/maintenance/records/{id}', 'equipment:maintenance:delete', array('MaintenanceController', 'deleteRecord'));
Router::add('GET', '/api/equipment/maintenance/due', 'equipment:maintenance:view', array('MaintenanceController', 'due'));

// ==================== 设备故障（必须先于 /equipment） ====================
Router::add('GET', '/api/equipment/breakdowns/statistics', 'equipment:breakdown:view', array('BreakdownController', 'statistics'));
Router::add('GET', '/api/equipment/breakdowns', 'equipment:breakdown:view', array('BreakdownController', 'index'));
Router::add('POST', '/api/equipment/breakdowns', 'equipment:breakdown:create', array('BreakdownController', 'store'));
Router::add('PATCH', '/api/equipment/breakdowns/{id}/repair', 'equipment:breakdown:repair', array('BreakdownController', 'repair'));
Router::add('PUT', '/api/equipment/breakdowns/{id}', 'equipment:breakdown:repair', array('BreakdownController', 'update'));
Router::add('DELETE', '/api/equipment/breakdowns/{id}', 'equipment:breakdown:delete', array('BreakdownController', 'destroy'));

// ==================== 设备管理 ====================
Router::add('GET', '/api/equipment/status-summary', 'equipment:list:view', array('EquipmentController', 'statusSummary'));
Router::add('GET', '/api/equipment', 'equipment:list:view', array('EquipmentController', 'index'));
Router::add('GET', '/api/equipment/{id}', 'equipment:list:view', array('EquipmentController', 'show'));
Router::add('POST', '/api/equipment', 'equipment:list:create', array('EquipmentController', 'store'));
Router::add('PUT', '/api/equipment/{id}', 'equipment:list:edit', array('EquipmentController', 'update'));
Router::add('DELETE', '/api/equipment/{id}', 'equipment:list:delete', array('EquipmentController', 'destroy'));
Router::add('PATCH', '/api/equipment/{id}/status', 'equipment:list:status', array('EquipmentController', 'changeStatus'));

// ==================== 质量追溯（必须先于 /quality） ====================
Router::add('GET', '/api/quality/traceability', 'quality:traceability:view', array('TraceController', 'traceability'));

// ==================== 质量管理 ====================
Router::add('GET', '/api/quality/inspections', 'quality:inspection:view', array('QualityController', 'inspections'));
Router::add('GET', '/api/quality/inspections/{id}', 'quality:inspection:view', array('QualityController', 'inspection'));
Router::add('POST', '/api/quality/inspections', 'quality:inspection:create', array('QualityController', 'createInspection'));
Router::add('DELETE', '/api/quality/inspections/{id}', 'quality:inspection:delete', array('QualityController', 'deleteInspection'));
Router::add('GET', '/api/quality/defects', 'quality:defect:view', array('QualityController', 'defects'));
Router::add('GET', '/api/quality/defects/{id}', 'quality:defect:view', array('QualityController', 'defect'));
Router::add('POST', '/api/quality/defects', 'quality:defect:create', array('QualityController', 'createDefect'));
Router::add('PUT', '/api/quality/defects/{id}', 'quality:defect:handle', array('QualityController', 'updateDefect'));
Router::add('DELETE', '/api/quality/defects/{id}', 'quality:defect:delete', array('QualityController', 'deleteDefect'));

// ==================== 物料管理（挂载前缀 /api/material） ====================
Router::add('GET', '/api/material/materials', 'material:items:view', array('MaterialController', 'index'));
Router::add('GET', '/api/material/materials/{id}', 'material:items:view', array('MaterialController', 'show'));
Router::add('POST', '/api/material/materials', 'material:items:create', array('MaterialController', 'store'));
Router::add('PUT', '/api/material/materials/{id}', 'material:items:edit', array('MaterialController', 'update'));
Router::add('DELETE', '/api/material/materials/{id}', 'material:items:delete', array('MaterialController', 'destroy'));
Router::add('GET', '/api/material/bom', 'material:bom:view', array('MaterialController', 'boms'));
Router::add('GET', '/api/material/bom/{id}', 'material:bom:view', array('MaterialController', 'bom'));
Router::add('POST', '/api/material/bom', 'material:bom:create', array('MaterialController', 'createBom'));
Router::add('PUT', '/api/material/bom/{id}', 'material:bom:edit', array('MaterialController', 'updateBom'));
Router::add('DELETE', '/api/material/bom/{id}', 'material:bom:delete', array('MaterialController', 'destroyBom'));
Router::add('GET', '/api/material/inventory/warnings', 'material:warning:view', array('MaterialController', 'warnings'));
Router::add('GET', '/api/material/inventory', 'material:inventory:view', array('MaterialController', 'inventory'));
Router::add('GET', '/api/material/inventory/transactions', 'material:inventory:view', array('MaterialController', 'transactions'));
Router::add('POST', '/api/material/inventory/transactions', 'material:inventory:transact', array('MaterialController', 'createTransaction'));
Router::add('GET', '/api/material/batches', 'material:batch:view', array('MaterialController', 'batches'));
Router::add('POST', '/api/material/batches', 'material:batch:create', array('MaterialController', 'createBatch'));
Router::add('PUT', '/api/material/batches/{id}', 'material:batch:edit', array('MaterialController', 'updateBatch'));
Router::add('DELETE', '/api/material/batches/{id}', 'material:batch:delete', array('MaterialController', 'deleteBatch'));
Router::add('GET', '/api/material/trace/forward', 'material:trace:view', array('MaterialController', 'forwardTrace'));
Router::add('GET', '/api/material/trace/backward', 'material:trace:view', array('MaterialController', 'backwardTrace'));

// ==================== 人员管理 ====================
Router::add('GET', '/api/personnel/shifts', 'personnel:shift:view', array('PersonnelController', 'shifts'));
Router::add('POST', '/api/personnel/shifts', 'personnel:shift:create', array('PersonnelController', 'createShift'));
Router::add('PUT', '/api/personnel/shifts/{id}', 'personnel:shift:edit', array('PersonnelController', 'updateShift'));
Router::add('DELETE', '/api/personnel/shifts/{id}', 'personnel:shift:delete', array('PersonnelController', 'deleteShift'));
Router::add('GET', '/api/personnel/schedules/calendar', 'personnel:schedule:view', array('PersonnelController', 'calendar'));
Router::add('GET', '/api/personnel/schedules', 'personnel:schedule:view', array('PersonnelController', 'schedules'));
Router::add('POST', '/api/personnel/schedules', 'personnel:schedule:create', array('PersonnelController', 'createSchedule'));
Router::add('PUT', '/api/personnel/schedules/{id}', 'personnel:schedule:edit', array('PersonnelController', 'updateSchedule'));
Router::add('DELETE', '/api/personnel/schedules/{id}', 'personnel:schedule:delete', array('PersonnelController', 'deleteSchedule'));
Router::add('GET', '/api/personnel/workhours/summary', 'personnel:workhours:view', array('PersonnelController', 'workHoursSummary'));
Router::add('GET', '/api/personnel/workhours', 'personnel:workhours:view', array('PersonnelController', 'workHours'));
Router::add('POST', '/api/personnel/workhours', 'personnel:workhours:create', array('PersonnelController', 'createWorkHours'));
Router::add('PUT', '/api/personnel/workhours/{id}', 'personnel:workhours:edit', array('PersonnelController', 'updateWorkHours'));
Router::add('DELETE', '/api/personnel/workhours/{id}', 'personnel:workhours:edit', array('PersonnelController', 'deleteWorkHours'));

// ==================== 报表中心 ====================
Router::add('GET', '/api/reports/oee/summary', 'reports:oee:view', array('ReportController', 'oeeSummary'));
Router::add('GET', '/api/reports/oee/trend', 'reports:oee:view', array('ReportController', 'oeeTrend'));
Router::add('GET', '/api/reports/oee/details', 'reports:oee:view', array('ReportController', 'oeeDetails'));
Router::add('GET', '/api/reports/oee/export', 'reports:oee:export', array('ReportController', 'exportOee'));
Router::add('GET', '/api/reports/production', 'reports:production:view', array('ReportController', 'production'));
Router::add('GET', '/api/reports/production/export', 'reports:production:export', array('ReportController', 'exportProduction'));
Router::add('GET', '/api/reports/quality', 'reports:production:view', array('ReportController', 'quality'));
Router::add('GET', '/api/reports/quality/export', 'reports:production:export', array('ReportController', 'exportQuality'));
Router::add('GET', '/api/reports/inventory', 'reports:production:view', array('ReportController', 'inventory'));
Router::add('GET', '/api/reports/inventory/export', 'reports:production:export', array('ReportController', 'exportInventory'));
Router::add('GET', '/api/reports/workhours/efficiency', 'personnel:workhours:view', array('ReportController', 'workHoursEfficiency'));
Router::add('GET', '/api/reports/workhours/export', 'personnel:workhours:export', array('ReportController', 'exportWorkHours'));
Router::add('GET', '/api/reports/workhours', 'personnel:workhours:view', array('ReportController', 'workHours'));

// ==================== 数据看板 ====================
Router::add('GET', '/api/dashboard/overview', 'dashboard:view', array('DashboardController', 'overview'));
Router::add('GET', '/api/dashboard/production-progress', 'dashboard:view', array('DashboardController', 'productionProgress'));
Router::add('GET', '/api/dashboard/equipment-status', 'dashboard:view', array('DashboardController', 'equipmentStatus'));
Router::add('GET', '/api/dashboard/output-trend', 'dashboard:view', array('DashboardController', 'outputTrend'));
Router::add('GET', '/api/dashboard/quality-summary', 'dashboard:view', array('DashboardController', 'qualitySummary'));

Router::dispatch();

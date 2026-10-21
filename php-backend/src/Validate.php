<?php
/**
 * MES 系统 - 轻量参数校验（对齐 Node 端 Zod 的关键约束）
 */

class Validate
{
    /** @var array<string,string> 字段中文名 */
    public static $labels = array(
        'username' => '用户名',
        'password' => '密码',
        'newPassword' => '新密码',
        'confirmPassword' => '确认密码',
        'oldPassword' => '旧密码',
        'name' => '姓名',
        'department' => '部门',
        'roleIds' => '角色',
        'productName' => '产品名称',
        'productCode' => '产品编码',
        'quantity' => '计划数量',
        'completedQty' => '完成数量',
        'defectQty' => '不良数量',
        'toStatus' => '目标状态',
        'workOrderId' => '工单',
        'equipmentId' => '设备',
        'plannedStart' => '计划开始时间',
        'plannedEnd' => '计划结束时间',
        'faultType' => '故障类型',
        'occurredAt' => '故障发生时间',
        'code' => '编码',
        'type' => '类型',
        'location' => '位置',
        'unit' => '单位',
        'category' => '分类',
        'specification' => '规格',
        'batchNo' => '批次号',
        'supplier' => '供应商',
        'receivedDate' => '入库日期',
        'materialId' => '物料',
        'planName' => '计划名称',
        'cycleType' => '周期类型',
        'nextDate' => '下次日期',
        'maintenanceType' => '维保类型',
        'startTime' => '开始时间',
        'inspectionType' => '检验类型',
        'defectType' => '不良类型',
        'userId' => '用户',
        'shiftId' => '班次',
        'scheduleDate' => '排班日期',
        'workDate' => '工作日期',
        'handlingMethod' => '处理方式',
        'requestId' => 'requestId',
        'refreshToken' => '刷新令牌',
    );

    /**
     * 执行校验并返回规整后的数据
     * @param array<string,mixed> $data 数据
     * @param array<string,string> $rules 字段 => 规则（required|string|int|positive|min:x|max:x|in:a,b|array|bool）
     * @return array<string,mixed>
     * @throws HttpException 400
     */
    public static function run($data, $rules)
    {
        $errors = array();
        foreach ($rules as $field => $ruleText) {
            $label = isset(self::$labels[$field]) ? self::$labels[$field] : $field;
            $rulesList = explode('|', $ruleText);
            $value = array_key_exists($field, $data) ? $data[$field] : null;
            $isEmpty = $value === null || $value === '';

            if (in_array('required', $rulesList, true) && $isEmpty) {
                $errors[] = array('field' => $field, 'message' => $label . '不能为空');
                continue;
            }
            if ($isEmpty) {
                continue;
            }

            foreach ($rulesList as $rule) {
                if ($rule === 'required' || $rule === '') {
                    continue;
                }
                if ($rule === 'string') {
                    if (!is_string($value)) {
                        $errors[] = array('field' => $field, 'message' => $label . '格式错误');
                        break;
                    }
                    continue;
                }
                if ($rule === 'int') {
                    if (!is_numeric($value) || (int) $value != $value) {
                        $errors[] = array('field' => $field, 'message' => $label . '必须为整数');
                        break;
                    }
                    continue;
                }
                if ($rule === 'number') {
                    if (!is_numeric($value)) {
                        $errors[] = array('field' => $field, 'message' => $label . '必须为数字');
                        break;
                    }
                    continue;
                }
                if ($rule === 'positive') {
                    if ((float) $value <= 0) {
                        $errors[] = array('field' => $field, 'message' => $label . '必须大于 0');
                        break;
                    }
                    continue;
                }
                if ($rule === 'min:0') {
                    if ((float) $value < 0) {
                        $errors[] = array('field' => $field, 'message' => $label . '不能为负数');
                        break;
                    }
                    continue;
                }
                if ($rule === 'bool') {
                    if (!is_bool($value) && $value !== 0 && $value !== 1
                        && $value !== '0' && $value !== '1'
                        && $value !== 'true' && $value !== 'false') {
                        $errors[] = array('field' => $field, 'message' => $label . '必须为布尔值');
                        break;
                    }
                    continue;
                }
                if ($rule === 'array') {
                    if (!is_array($value) || count($value) === 0) {
                        $errors[] = array('field' => $field, 'message' => '至少选择一个' . $label);
                        break;
                    }
                    continue;
                }
                if (strpos($rule, 'min:') === 0) {
                    $min = (int) substr($rule, 4);
                    if (is_string($value) && mb_strlen($value) < $min) {
                        $errors[] = array('field' => $field, 'message' => $label . '至少 ' . $min . ' 个字符');
                        break;
                    }
                    if (is_array($value) && count($value) < $min) {
                        $errors[] = array('field' => $field, 'message' => '至少选择 ' . $min . ' 个' . $label);
                        break;
                    }
                    continue;
                }
                if (strpos($rule, 'max:') === 0) {
                    $max = (int) substr($rule, 4);
                    if (is_string($value) && mb_strlen($value) > $max) {
                        $errors[] = array('field' => $field, 'message' => $label . '最多 ' . $max . ' 个字符');
                        break;
                    }
                    continue;
                }
                if (strpos($rule, 'in:') === 0) {
                    $allowed = explode(',', substr($rule, 3));
                    if (!in_array((string) $value, $allowed, true)) {
                        $errors[] = array(
                            'field' => $field,
                            'message' => $label . '仅支持 ' . implode(' / ', $allowed),
                        );
                        break;
                    }
                }
            }
        }

        if (count($errors) > 0) {
            throw new HttpException('参数校验失败', 400, $errors);
        }
        return $data;
    }

    /**
     * 校验查询参数枚举（未传则跳过）
     * @param string $field 字段
     * @param array<int,string> $allowed 允许值
     * @return void
     */
    public static function queryEnum($field, $allowed)
    {
        $value = Http::query($field);
        if ($value === null) {
            return;
        }
        if (!in_array((string) $value, $allowed, true)) {
            $label = isset(self::$labels[$field]) ? self::$labels[$field] : $field;
            throw new HttpException(
                '参数校验失败',
                400,
                array(array('field' => $field, 'message' => $label . '仅支持 ' . implode(' / ', $allowed)))
            );
        }
    }
}

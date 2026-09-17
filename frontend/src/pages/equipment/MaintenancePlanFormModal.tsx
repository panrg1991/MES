/**
 * MES 系统 - 维保计划新增/编辑弹窗【T07 新增】
 * 功能：设备选择（搜索）、五档周期类型（自动带出默认周期天数）、下次维保日期、启停状态
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Form, Select, Input, InputNumber, DatePicker, App } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { getEquipments } from '@/api/equipment.api';
import {
  createMaintenancePlan,
  updateMaintenancePlan,
  type MaintenancePlanListItem,
} from '@/api/maintenance.api';
import {
  DROPDOWN_PAGE_SIZE,
  MAINTENANCE_CYCLE_MAP,
  MAINTENANCE_CYCLE_OPTIONS,
  MAINTENANCE_PLAN_STATUS_MAP,
} from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';
import type { MaintenanceCycleType, MaintenancePlanStatus } from '@/types';

/** 维保计划表单数据（日期为 Dayjs 对象） */
interface MaintenancePlanFormData {
  equipmentId: number;
  planName: string;
  cycleType: MaintenanceCycleType;
  cycleDays: number;
  nextDate: Dayjs;
  status: MaintenancePlanStatus;
}

/** 弹窗属性 */
interface MaintenancePlanFormModalProps {
  /** 编辑目标（null = 新增） */
  editingPlan: MaintenancePlanListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 维保计划新增/编辑弹窗组件 */
function MaintenancePlanFormModal({
  editingPlan,
  visible,
  onClose,
  onSuccess,
}: MaintenancePlanFormModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MaintenancePlanFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canSubmit = editingPlan
    ? hasPermission('equipment:maintenance:edit')
    : hasPermission('equipment:maintenance:create');

  // 设备下拉选项（弹窗打开时加载）
  const { data: equipmentData } = useQuery({
    queryKey: ['equipmentOptions'],
    queryFn: () =>
      getEquipments({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible,
  });

  const equipmentOptions = useMemo(
    () =>
      (equipmentData?.list || []).map((eq) => ({
        label: `${eq.code} - ${eq.name}`,
        value: eq.id,
      })),
    [equipmentData],
  );

  /** 弹窗打开时填充/重置表单 */
  useEffect(() => {
    if (visible) {
      if (editingPlan) {
        form.setFieldsValue({
          equipmentId: editingPlan.equipmentId,
          planName: editingPlan.planName,
          cycleType: editingPlan.cycleType,
          cycleDays: editingPlan.cycleDays,
          nextDate: dayjs(editingPlan.nextDate),
          status: editingPlan.status,
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, editingPlan, form]);

  /** 切换周期类型时自动带出默认周期天数（可手动改） */
  const handleCycleTypeChange = (value: MaintenanceCycleType) => {
    form.setFieldValue('cycleDays', MAINTENANCE_CYCLE_MAP[value].days);
  };

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingPlan) {
        await updateMaintenancePlan(editingPlan.id, {
          planName: values.planName,
          cycleType: values.cycleType,
          cycleDays: values.cycleDays,
          nextDate: values.nextDate.toISOString(),
          status: values.status,
        });
        message.success('更新维保计划成功');
      } else {
        await createMaintenancePlan({
          equipmentId: values.equipmentId,
          planName: values.planName,
          cycleType: values.cycleType,
          cycleDays: values.cycleDays,
          nextDate: values.nextDate.toISOString(),
          status: values.status,
        });
        message.success('创建维保计划成功');
      }
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误（错误信息由拦截器处理）
    }
  };

  const statusOptions = (
    Object.keys(MAINTENANCE_PLAN_STATUS_MAP) as MaintenancePlanStatus[]
  ).map((s) => ({
    label: MAINTENANCE_PLAN_STATUS_MAP[s].label,
    value: s,
  }));

  return (
    <Modal
      title={editingPlan ? '编辑维保计划' : '新增维保计划'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canSubmit }}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
      width={560}
    >
      <Form<MaintenancePlanFormData>
        form={form}
        layout="vertical"
        initialValues={{ cycleType: 'monthly', cycleDays: 30, status: 'active' }}
      >
        <Form.Item
          label="所属设备"
          name="equipmentId"
          rules={[{ required: true, message: '请选择所属设备' }]}
        >
          <Select
            options={equipmentOptions}
            placeholder="请选择设备（可搜索）"
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          label="计划名称"
          name="planName"
          rules={[
            { required: true, message: '请输入计划名称' },
            { max: 100, message: '计划名称最多 100 个字符' },
          ]}
        >
          <Input placeholder="请输入维保计划名称，如：主轴 monthly 保养" />
        </Form.Item>

        <Form.Item
          label="维保周期"
          name="cycleType"
          rules={[{ required: true, message: '请选择维保周期类型' }]}
        >
          <Select
            options={MAINTENANCE_CYCLE_OPTIONS}
            placeholder="请选择维保周期类型"
            onChange={handleCycleTypeChange}
          />
        </Form.Item>

        <Form.Item
          label="周期天数"
          name="cycleDays"
          rules={[{ required: true, message: '请输入周期天数' }]}
          extra="登记维保记录后将按该天数自动顺延下次维保日期"
        >
          <InputNumber
            min={1}
            max={3650}
            style={{ width: '100%' }}
            placeholder="周期天数（天）"
            precision={0}
          />
        </Form.Item>

        <Form.Item
          label="下次维保日期"
          name="nextDate"
          rules={[{ required: true, message: '请选择下次维保日期' }]}
        >
          <DatePicker
            showTime
            style={{ width: '100%' }}
            placeholder="选择下次维保日期"
          />
        </Form.Item>

        <Form.Item label="计划状态" name="status">
          <Select options={statusOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default MaintenancePlanFormModal;

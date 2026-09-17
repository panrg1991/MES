/**
 * MES 系统 - 登记维保记录弹窗【T07 新增】
 * 功能：可选关联维保计划（关联后登记成功自动顺延 nextDate）/ 临时保养（只记录不顺延）、
 *       维保类型、维保人员、起止时间、维保内容
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Form, Select, Input, DatePicker, App } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { getEquipments } from '@/api/equipment.api';
import { getUsers } from '@/api/user.api';
import {
  createMaintenanceRecord,
  getMaintenancePlans,
  type MaintenancePlanListItem,
} from '@/api/maintenance.api';
import { DROPDOWN_PAGE_SIZE, MAINTENANCE_TYPE_OPTIONS } from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';
import type { MaintenanceType } from '@/types';

/** 维保记录表单数据（日期为 Dayjs 对象） */
interface MaintenanceRecordFormData {
  planId?: number;
  equipmentId: number;
  maintenanceType: MaintenanceType;
  maintainerId?: number;
  startTime: Dayjs;
  endTime?: Dayjs;
  content?: string;
}

/** 弹窗属性 */
interface MaintenanceRecordModalProps {
  /** 打开时预关联的维保计划（从计划列表行「登记」进入时传入） */
  initialPlan: MaintenancePlanListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 登记维保记录弹窗组件 */
function MaintenanceRecordModal({
  initialPlan,
  visible,
  onClose,
  onSuccess,
}: MaintenanceRecordModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MaintenanceRecordFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canSubmit = hasPermission('equipment:maintenance:complete');

  // 设备下拉选项
  const { data: equipmentData } = useQuery({
    queryKey: ['equipmentOptions'],
    queryFn: () => getEquipments({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible,
  });

  // 启用中的维保计划下拉选项（关联后登记成功自动顺延）
  const { data: planData } = useQuery({
    queryKey: ['maintenancePlanOptions'],
    queryFn: () =>
      getMaintenancePlans({ page: 1, pageSize: 100, status: 'active' }),
    enabled: visible,
  });

  // 维保人员下拉选项
  const { data: userData } = useQuery({
    queryKey: ['userOptions'],
    queryFn: () => getUsers({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
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

  const planOptions = useMemo(
    () =>
      (planData?.list || []).map((plan) => ({
        label: `${plan.planName}（${
          plan.equipment ? `${plan.equipment.code} ` : ''
        }下次 ${dayjs(plan.nextDate).format('YYYY-MM-DD')}）`,
        value: plan.id,
        equipmentId: plan.equipmentId,
      })),
    [planData],
  );

  const userOptions = useMemo(
    () =>
      (userData?.list || []).map((u) => ({
        label: `${u.name}（${u.department}）`,
        value: u.id,
      })),
    [userData],
  );

  /** 弹窗打开时填充/重置表单 */
  useEffect(() => {
    if (visible) {
      form.resetFields();
      if (initialPlan) {
        form.setFieldsValue({
          planId: initialPlan.id,
          equipmentId: initialPlan.equipmentId,
          maintenanceType: 'preventive',
          startTime: dayjs(),
        });
      } else {
        form.setFieldsValue({ maintenanceType: 'preventive', startTime: dayjs() });
      }
    }
  }, [visible, initialPlan, form]);

  /** 选择关联计划后自动带出设备 */
  const handlePlanChange = (value?: number) => {
    if (value) {
      const option = planOptions.find((p) => p.value === value);
      if (option) {
        form.setFieldValue('equipmentId', option.equipmentId);
      }
    }
  };

  /** 提交登记 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const result = await createMaintenanceRecord({
        planId: values.planId ?? null,
        equipmentId: values.equipmentId,
        maintenanceType: values.maintenanceType,
        maintainerId: values.maintainerId ?? null,
        startTime: values.startTime.toISOString(),
        endTime: values.endTime ? values.endTime.toISOString() : null,
        content: values.content || '',
      });
      if (result.plan) {
        message.success(
          `维保记录登记成功，下次维保日期已顺延至 ${dayjs(
            result.plan.nextDate,
          ).format('YYYY-MM-DD')}`,
        );
      } else {
        message.success('临时保养记录登记成功（未关联计划，不顺延）');
      }
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误（错误信息由拦截器处理）
    }
  };

  return (
    <Modal
      title="登记维保记录"
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canSubmit }}
      okText="登记"
      cancelText="取消"
      destroyOnHidden
      width={560}
    >
      <Form<MaintenanceRecordFormData> form={form} layout="vertical">
        <Form.Item
          label="关联维保计划"
          name="planId"
          extra="不选择即为「临时保养」，仅记录不顺延任何计划"
        >
          <Select
            options={planOptions}
            placeholder="临时保养（不关联计划）"
            allowClear
            showSearch
            optionFilterProp="label"
            onChange={handlePlanChange}
          />
        </Form.Item>

        <Form.Item
          label="维保设备"
          name="equipmentId"
          rules={[{ required: true, message: '请选择维保设备' }]}
        >
          <Select
            options={equipmentOptions}
            placeholder="请选择设备（可搜索）"
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          label="维保类型"
          name="maintenanceType"
          rules={[{ required: true, message: '请选择维保类型' }]}
        >
          <Select options={MAINTENANCE_TYPE_OPTIONS} />
        </Form.Item>

        <Form.Item label="维保人员" name="maintainerId">
          <Select
            options={userOptions}
            placeholder="请选择维保人员（可选）"
            allowClear
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          label="开始时间"
          name="startTime"
          rules={[{ required: true, message: '请选择维保开始时间' }]}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          label="结束时间"
          name="endTime"
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value: Dayjs | undefined) {
                const start = getFieldValue('startTime') as Dayjs | undefined;
                if (value && start && value.isBefore(start)) {
                  return Promise.reject(
                    new Error('结束时间必须晚于开始时间'),
                  );
                }
                return Promise.resolve();
              },
            }),
          ]}
        >
          <DatePicker
            showTime
            style={{ width: '100%' }}
            placeholder="选择结束时间（进行中可留空）"
          />
        </Form.Item>

        <Form.Item
          label="维保内容"
          name="content"
          rules={[{ max: 1000, message: '维保内容最多 1000 个字符' }]}
        >
          <Input.TextArea rows={3} placeholder="请输入维保内容（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default MaintenanceRecordModal;

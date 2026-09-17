/**
 * MES 系统 - 排程创建弹窗（P1-01，T08）
 * 工单/设备为下拉搜索 Select；提交后端冲突校验（同设备重叠 → 409，提示由拦截器弹出）
 */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import { createSchedule } from '@/api/schedule.api';
import { getWorkOrders } from '@/api/production.api';
import { getEquipments } from '@/api/equipment.api';
import type { Dayjs } from 'dayjs';
import { DROPDOWN_PAGE_SIZE } from '@/utils/constants';

/** 表单值类型 */
interface ScheduleFormValues {
  workOrderId: number;
  equipmentId?: number;
  plannedStart: Dayjs;
  plannedEnd: Dayjs;
  remark?: string;
}

interface ScheduleFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 排程创建弹窗组件 */
function ScheduleFormModal({ visible, onClose, onSuccess }: ScheduleFormModalProps) {
  const [form] = Form.useForm<ScheduleFormValues>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  // 工单下拉（搜索，含未关闭工单）
  const { data: workOrderData } = useQuery({
    queryKey: ['workOrders', 'schedule-options'],
    queryFn: () => getWorkOrders({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible,
  });

  // 设备下拉（搜索）
  const { data: equipmentData } = useQuery({
    queryKey: ['equipments', 'schedule-options'],
    queryFn: () => getEquipments({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible,
  });

  useEffect(() => {
    if (visible) {
      form.resetFields();
    }
  }, [visible, form]);

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      message.success('创建排程成功');
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      onSuccess();
    },
  });

  /** 提交 */
  const handleOk = async () => {
    const values = await form.validateFields();
    await createMutation.mutateAsync({
      workOrderId: values.workOrderId,
      equipmentId: values.equipmentId,
      plannedStart: values.plannedStart.toISOString(),
      plannedEnd: values.plannedEnd.toISOString(),
    });
  };

  return (
    <Modal
      open={visible}
      title="新增生产排程"
      okText="创建"
      cancelText="取消"
      confirmLoading={createMutation.isPending}
      onOk={() => {
        void handleOk();
      }}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="workOrderId"
          label="工单"
          rules={[{ required: true, message: '请选择工单' }]}
        >
          <Select
            showSearch
            placeholder="按工单号 / 产品名搜索"
            optionFilterProp="label"
            options={(workOrderData?.list ?? []).map((order) => ({
              value: order.id,
              label: `${order.orderNo} · ${order.productName}（${order.status}）`,
            }))}
          />
        </Form.Item>
        <Form.Item name="equipmentId" label="设备（可选）">
          <Select
            showSearch
            allowClear
            placeholder="按设备编码 / 名称搜索"
            optionFilterProp="label"
            options={(equipmentData?.list ?? []).map((equipment) => ({
              value: equipment.id,
              label: `${equipment.code} · ${equipment.name}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="plannedStart"
          label="计划开始时间"
          rules={[{ required: true, message: '请选择计划开始时间' }]}
        >
          <DatePicker
            needConfirm={false}
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="开始时间"
          />
        </Form.Item>
        <Form.Item
          name="plannedEnd"
          label="计划结束时间"
          rules={[
            { required: true, message: '请选择计划结束时间' },
            ({ getFieldValue }) => ({
              validator(_, value: Dayjs) {
                const start = getFieldValue('plannedStart') as Dayjs | undefined;
                if (!value || !start || value.isAfter(start)) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('计划结束时间必须晚于计划开始时间'));
              },
            }),
          ]}
        >
          <DatePicker
            needConfirm={false}
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="结束时间"
          />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={200} placeholder="备注（可选）" />
        </Form.Item>
        <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>
          提示：同一工单允许多条排程（分段生产）；同一设备时段重叠的排程将被拒绝（409），端点相接不算冲突。
        </div>
      </Form>
    </Modal>
  );
}

export default ScheduleFormModal;

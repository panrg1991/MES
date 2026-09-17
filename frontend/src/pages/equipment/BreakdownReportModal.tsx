/**
 * MES 系统 - 一键报修弹窗【T07 新增】
 * 功能：选择设备、填写故障类型/描述/发生时间；提交后设备状态自动置为「故障」
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Form, Select, Input, DatePicker, App } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { getEquipments } from '@/api/equipment.api';
import { reportBreakdown } from '@/api/breakdown.api';
import { useAuthStore } from '@/stores/authStore';
import { DROPDOWN_PAGE_SIZE } from '@/utils/constants';

/** 报修表单数据 */
interface BreakdownReportFormData {
  equipmentId: number;
  faultType: string;
  faultDescription?: string;
  occurredAt: Dayjs;
}

/** 弹窗属性 */
interface BreakdownReportModalProps {
  /** 打开时预选的设备 ID（可选） */
  initialEquipmentId?: number;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 一键报修弹窗组件 */
function BreakdownReportModal({
  initialEquipmentId,
  visible,
  onClose,
  onSuccess,
}: BreakdownReportModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BreakdownReportFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canSubmit = hasPermission('equipment:breakdown:create');

  // 设备下拉选项
  const { data: equipmentData } = useQuery({
    queryKey: ['equipmentOptions'],
    queryFn: () => getEquipments({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible,
  });

  const equipmentOptions = useMemo(
    () =>
      (equipmentData?.list || []).map((eq) => ({
        label: `${eq.code} - ${eq.name}${
          eq.status === 'fault' ? '（当前已故障）' : ''
        }`,
        value: eq.id,
      })),
    [equipmentData],
  );

  /** 弹窗打开时重置表单（默认发生时间为当前时间） */
  useEffect(() => {
    if (visible) {
      form.resetFields();
      form.setFieldsValue({
        equipmentId: initialEquipmentId,
        occurredAt: dayjs(),
      });
    }
  }, [visible, initialEquipmentId, form]);

  /** 提交报修 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await reportBreakdown({
        equipmentId: values.equipmentId,
        faultType: values.faultType,
        faultDescription: values.faultDescription || '',
        occurredAt: values.occurredAt.toISOString(),
      });
      message.success('故障报修成功，设备状态已置为故障');
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误（错误信息由拦截器处理）
    }
  };

  return (
    <Modal
      title="一键报修"
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canSubmit }}
      okText="提交报修"
      cancelText="取消"
      destroyOnHidden
      width={520}
    >
      <Form<BreakdownReportFormData> form={form} layout="vertical">
        <Form.Item
          label="故障设备"
          name="equipmentId"
          rules={[{ required: true, message: '请选择故障设备' }]}
        >
          <Select
            options={equipmentOptions}
            placeholder="请选择设备（可搜索）"
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          label="故障类型"
          name="faultType"
          rules={[
            { required: true, message: '请输入故障类型' },
            { max: 50, message: '故障类型最多 50 个字符' },
          ]}
        >
          <Input placeholder="如：机械故障 / 电气故障 / 液压故障" />
        </Form.Item>

        <Form.Item
          label="故障描述"
          name="faultDescription"
          rules={[{ max: 500, message: '故障描述最多 500 个字符' }]}
        >
          <Input.TextArea rows={3} placeholder="请描述故障现象（可选）" />
        </Form.Item>

        <Form.Item
          label="发生时间"
          name="occurredAt"
          rules={[{ required: true, message: '请选择故障发生时间' }]}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default BreakdownReportModal;

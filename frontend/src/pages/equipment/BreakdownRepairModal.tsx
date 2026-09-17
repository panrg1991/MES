/**
 * MES 系统 - 维修完成（复机）弹窗【T07 新增】
 * 功能：填写维修人员 / 维修方法 / 修复时间；实时预览停机时长（服务端最终计算）；
 *       提交后设备状态自动恢复（存在进行中排程恢复 running，否则 idle）
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Form, Select, Input, DatePicker, Descriptions, Alert, App } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { getUsers } from '@/api/user.api';
import { completeBreakdownRepair, type BreakdownListItem } from '@/api/breakdown.api';
import { formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import { DROPDOWN_PAGE_SIZE } from '@/utils/constants';

/** 维修完成表单数据 */
interface BreakdownRepairFormData {
  repairerId: number;
  repairMethod: string;
  repairedAt: Dayjs;
}

/** 弹窗属性 */
interface BreakdownRepairModalProps {
  /** 待维修的故障记录 */
  record: BreakdownListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 维修完成弹窗组件 */
function BreakdownRepairModal({
  record,
  visible,
  onClose,
  onSuccess,
}: BreakdownRepairModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BreakdownRepairFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canSubmit = hasPermission('equipment:breakdown:repair');

  // 维修人员下拉选项
  const { data: userData } = useQuery({
    queryKey: ['userOptions'],
    queryFn: () => getUsers({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible,
  });

  const userOptions = useMemo(
    () =>
      (userData?.list || []).map((u) => ({
        label: `${u.name}（${u.department}）`,
        value: u.id,
      })),
    [userData],
  );

  // 实时监听修复时间，动态预览停机时长（分钟）
  const repairedAt = Form.useWatch('repairedAt', form);

  /** 预览停机时长（分钟）：修复时间 - 发生时间；修复时间早于发生时间为负（不允许提交） */
  const previewDowntimeMinutes = useMemo(() => {
    if (!record || !repairedAt) return null;
    return Math.round(
      (repairedAt.valueOf() - dayjs(record.occurredAt).valueOf()) / 60000,
    );
  }, [record, repairedAt]);

  /** 弹窗打开时重置表单（修复时间默认当前时间） */
  useEffect(() => {
    if (visible) {
      form.resetFields();
      form.setFieldsValue({ repairedAt: dayjs() });
    }
  }, [visible, form]);

  /** 提交维修完成 */
  const handleSubmit = async () => {
    if (!record) return;
    try {
      const values = await form.validateFields();
      await completeBreakdownRepair(record.id, {
        repairerId: values.repairerId,
        repairMethod: values.repairMethod,
        repairedAt: values.repairedAt.toISOString(),
      });
      message.success('维修完成，设备已复机');
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误（错误信息由拦截器处理）
    }
  };

  return (
    <Modal
      title={`维修处理 - ${record?.equipment?.name ?? ''}`}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canSubmit }}
      okText="确认复机"
      cancelText="取消"
      destroyOnClose
      width={560}
    >
      {record && (
        <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="故障设备">
            {record.equipment
              ? `${record.equipment.code} - ${record.equipment.name}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="故障类型">
            {record.faultType}
          </Descriptions.Item>
          <Descriptions.Item label="发生时间" span={2}>
            {formatDateTime(record.occurredAt)}
          </Descriptions.Item>
          <Descriptions.Item label="故障描述" span={2}>
            {record.faultDescription || '-'}
          </Descriptions.Item>
        </Descriptions>
      )}

      <Form<BreakdownRepairFormData> form={form} layout="vertical">
        <Form.Item
          label="维修人员"
          name="repairerId"
          rules={[{ required: true, message: '请选择维修人员' }]}
        >
          <Select
            options={userOptions}
            placeholder="请选择维修人员（可搜索）"
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          label="维修方法"
          name="repairMethod"
          rules={[
            { required: true, message: '请输入维修方法' },
            { max: 500, message: '维修方法最多 500 个字符' },
          ]}
        >
          <Input.TextArea rows={3} placeholder="请描述维修方法 / 更换备件等" />
        </Form.Item>

        <Form.Item
          label="修复时间"
          name="repairedAt"
          rules={[
            { required: true, message: '请选择修复时间' },
            () => ({
              validator(_, value: Dayjs | undefined) {
                if (record && value && !value.isAfter(dayjs(record.occurredAt))) {
                  return Promise.reject(
                    new Error('修复时间必须晚于故障发生时间'),
                  );
                }
                return Promise.resolve();
              },
            }),
          ]}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
      </Form>

      {previewDowntimeMinutes !== null && (
        previewDowntimeMinutes >= 0 ? (
          <Alert
            type="info"
            showIcon
            message={`预计停机时长：${previewDowntimeMinutes} 分钟（以服务端最终计算为准）`}
          />
        ) : (
          <Alert
            type="error"
            showIcon
            message="修复时间早于故障发生时间，停机时长不可为负，请修正修复时间"
          />
        )
      )}
    </Modal>
  );
}

export default BreakdownRepairModal;

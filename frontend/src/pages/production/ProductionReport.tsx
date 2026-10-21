/**
 * MES 系统 - 报工录入组件
 * 功能：录入完成数量、不良数量、备注 → 调用报工 API
 * 作为弹窗被 WorkOrderDetail 调用
 */

import { useEffect, useRef, useState } from 'react';
import { Modal, Form, InputNumber, Input, App } from 'antd';
import { createReport } from '@/api/production.api';
import { useAuthStore } from '@/stores/authStore';

const { TextArea } = Input;

/**
 * 生成报工幂等键
 * 说明：车间电脑可能双击提交或在弱网下重试，携带同一 requestId 时后端只累加一次。
 *      非安全上下文（如 http://192.168.x.x）下 crypto.randomUUID 不可用，故提供降级实现。
 * @returns {string} 幂等键
 */
function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mes-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 报工表单数据 */
interface ReportFormData {
  completedQty: number;
  defectQty: number;
  remark?: string;
}

interface ProductionReportProps {
  /** 工单 ID */
  workOrderId: number;
  /** 弹窗是否可见 */
  visible: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 保存成功后的回调 */
  onSuccess: () => void;
}

/** 报工录入弹窗组件 */
function ProductionReport({
  workOrderId,
  visible,
  onClose,
  onSuccess,
}: ProductionReportProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReportFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  /** 提交中标记：防止 Modal 重复点击导致并发提交 */
  const [submitting, setSubmitting] = useState(false);
  /**
   * 本次报工的幂等键：失败重试期间保持不变（同一笔数据只落一条）；
   * 弹窗重新打开时重置，避免把上一次的键带到新报工中。
   */
  const requestIdRef = useRef('');

  /** 弹窗打开时重置表单与幂等键 */
  useEffect(() => {
    if (visible) {
      form.resetFields();
      requestIdRef.current = '';
    }
  }, [visible, form]);

  /** 提交报工 */
  const handleSubmit = async () => {
    if (submitting) return;

    try {
      const values = await form.validateFields();
      if (!requestIdRef.current) {
        requestIdRef.current = createRequestId();
      }

      setSubmitting(true);
      await createReport(workOrderId, {
        completedQty: values.completedQty,
        defectQty: values.defectQty || 0,
        remark: values.remark || '',
        requestId: requestIdRef.current,
      });
      message.success('报工成功');
      requestIdRef.current = '';
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误：保留 requestId，用户重试时不会重复累加
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="报工录入"
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={submitting}
      okButtonProps={{
        disabled: !hasPermission('production:order:report'),
        loading: submitting,
      }}
      okText="提交"
      cancelText="取消"
      destroyOnHidden
      width={450}
    >
      <Form<ReportFormData> form={form} layout="vertical">
        <Form.Item
          label="完成数量"
          name="completedQty"
          rules={[
            { required: true, message: '请输入完成数量' },
            {
              type: 'number',
              min: 0,
              message: '完成数量不能为负数',
            },
          ]}
        >
          <InputNumber
            placeholder="请输入本次完成数量"
            min={0}
            precision={0}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          label="不良数量"
          name="defectQty"
          initialValue={0}
          rules={[
            {
              type: 'number',
              min: 0,
              message: '不良数量不能为负数',
            },
          ]}
        >
          <InputNumber
            placeholder="请输入本次不良数量"
            min={0}
            precision={0}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          label="备注"
          name="remark"
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <TextArea rows={3} placeholder="请输入备注（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ProductionReport;

/**
 * MES 系统 - 工单创建/编辑表单组件
 * 作为弹窗被 WorkOrderList 调用
 */

import { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, DatePicker, App } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { WorkOrderPriority } from '@/types';
import {
  createWorkOrder,
  updateWorkOrder,
  type WorkOrderListItem,
  type CreateWorkOrderRequest,
  type UpdateWorkOrderRequest,
} from '@/api/production.api';
import { useAuthStore } from '@/stores/authStore';

const { TextArea } = Input;

/** 表单数据（日期为 Dayjs 对象） */
interface WorkOrderFormData {
  productName: string;
  productCode: string;
  quantity: number;
  priority: WorkOrderPriority;
  planStart?: Dayjs;
  planEnd?: Dayjs;
  remark?: string;
}

interface WorkOrderFormProps {
  /** 编辑的工单（null 表示新增） */
  editingOrder: WorkOrderListItem | null;
  /** 弹窗是否可见 */
  visible: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 保存成功后的回调 */
  onSuccess: () => void;
}

/** 优先级选项 */
const PRIORITY_OPTIONS = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' },
];

/** 工单表单弹窗组件 */
function WorkOrderForm({
  editingOrder,
  visible,
  onClose,
  onSuccess,
}: WorkOrderFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<WorkOrderFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const canEdit = editingOrder
    ? hasPermission('production:order:edit')
    : hasPermission('production:order:create');

  /** 弹窗打开时填充表单 */
  useEffect(() => {
    if (visible) {
      if (editingOrder) {
        form.setFieldsValue({
          productName: editingOrder.productName,
          productCode: editingOrder.productCode,
          quantity: editingOrder.quantity,
          priority: editingOrder.priority,
          planStart: editingOrder.planStart ? dayjs(editingOrder.planStart) : undefined,
          planEnd: editingOrder.planEnd ? dayjs(editingOrder.planEnd) : undefined,
          remark: editingOrder.remark,
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, editingOrder, form]);

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // 转换 Dayjs 为 ISO 字符串
      const data: CreateWorkOrderRequest | UpdateWorkOrderRequest = {
        productName: values.productName,
        productCode: values.productCode,
        quantity: values.quantity,
        priority: values.priority,
        planStart: values.planStart ? values.planStart.toISOString() : undefined,
        planEnd: values.planEnd ? values.planEnd.toISOString() : undefined,
        remark: values.remark || '',
      };

      if (editingOrder) {
        await updateWorkOrder(editingOrder.id, data);
        message.success('更新工单成功');
      } else {
        await createWorkOrder(data as CreateWorkOrderRequest);
        message.success('创建工单成功');
      }
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误（错误信息由拦截器处理）
    }
  };

  return (
    <Modal
      title={editingOrder ? '编辑工单' : '新增工单'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !canEdit }}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
      width={600}
    >
      <Form<WorkOrderFormData>
        form={form}
        layout="vertical"
        initialValues={{ priority: 'medium' }}
      >
        <Form.Item
          label="产品名称"
          name="productName"
          rules={[
            { required: true, message: '请输入产品名称' },
            { max: 200, message: '产品名称最多 200 个字符' },
          ]}
        >
          <Input placeholder="请输入产品名称" />
        </Form.Item>

        <Form.Item
          label="产品编码"
          name="productCode"
          rules={[
            { required: true, message: '请输入产品编码' },
            { max: 100, message: '产品编码最多 100 个字符' },
          ]}
        >
          <Input placeholder="请输入产品编码" />
        </Form.Item>

        <Form.Item
          label="计划数量"
          name="quantity"
          rules={[
            { required: true, message: '请输入计划数量' },
            {
              type: 'number',
              min: 1,
              message: '计划数量必须大于 0',
            },
          ]}
        >
          <InputNumber
            placeholder="请输入计划数量"
            min={1}
            precision={0}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item label="优先级" name="priority">
          <Select options={PRIORITY_OPTIONS} />
        </Form.Item>

        <Form.Item label="计划开始时间" name="planStart">
          <DatePicker
            // needConfirm=false：选中即生效，无需再点面板内的「确定」，
            // 避免用户选完直接点弹窗「保存」时选择被静默丢弃
            needConfirm={false}
            showTime={{ format: 'HH:mm' }}
            // 显式指定 format：输入框完整展示「日期 时间」，让已选值可见
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="选择计划开始时间"
          />
        </Form.Item>

        <Form.Item
          label="计划结束时间"
          name="planEnd"
          dependencies={['planStart']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value: Dayjs | undefined) {
                const start = getFieldValue('planStart') as Dayjs | undefined;
                // 两个时间均为可选项，仅在都填写时校验先后关系
                if (!value || !start || value.isAfter(start)) {
                  return Promise.resolve();
                }
                return Promise.reject(
                  new Error('计划结束时间必须晚于计划开始时间'),
                );
              },
            }),
          ]}
        >
          <DatePicker
            needConfirm={false}
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="选择计划结束时间"
          />
        </Form.Item>

        <Form.Item
          label="备注"
          name="remark"
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <TextArea rows={3} placeholder="请输入备注" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default WorkOrderForm;

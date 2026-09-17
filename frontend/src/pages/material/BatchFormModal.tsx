/**
 * MES 系统 - 批次新增/编辑弹窗（P1-07，T09）
 * 创建：选择物料 + 批次号（全局唯一，重复后端 409）+ 供应商 + 入库日期 + 数量 + 状态
 * 编辑：物料不可变更（materialId 建档后固定）
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  App,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  getMaterials,
  createBatch,
  updateBatch,
  type BatchListItem,
  type CreateBatchRequest,
  type UpdateBatchRequest,
} from '@/api/material.api';
import { BATCH_STATUS_MAP } from '@/utils/constants';
import type { BatchStatus } from '@/types';

/** 批次表单数据（receivedDate 为 Dayjs，提交时转 YYYY-MM-DD） */
interface BatchFormData {
  materialId: number;
  batchNo: string;
  supplier: string;
  receivedDate: Dayjs;
  quantity: number;
  status: BatchStatus;
}

/** 批次表单弹窗属性 */
interface BatchFormModalProps {
  visible: boolean;
  /** 编辑目标（null 表示新建） */
  editing: BatchListItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** 批次新增/编辑弹窗组件 */
function BatchFormModal({ visible, editing, onClose, onSuccess }: BatchFormModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BatchFormData>();
  const queryClient = useQueryClient();

  // 物料下拉数据源（取前 100 条，支持本地搜索过滤）
  const { data: materialData } = useQuery({
    queryKey: ['materials', 'for-batch-select'],
    queryFn: () =>
      getMaterials({ page: 1, pageSize: 100 }),
    enabled: visible,
  });

  const materialOptions = useMemo(
    () =>
      (materialData?.list ?? []).map((m) => ({
        value: m.id,
        label: `${m.code} ${m.name}（${m.specification}）`,
      })),
    [materialData],
  );

  // 打开时初始化表单
  useEffect(() => {
    if (visible) {
      form.resetFields();
      if (editing) {
        form.setFieldsValue({
          materialId: editing.materialId,
          batchNo: editing.batchNo,
          supplier: editing.supplier,
          receivedDate: dayjs(editing.receivedDate),
          quantity: editing.quantity,
          status: editing.status,
        });
      } else {
        form.setFieldsValue({
          status: 'active',
          quantity: 0,
          receivedDate: dayjs(),
        });
      }
    }
  }, [visible, editing, form]);

  // 提交（新建 / 更新）
  const mutation = useMutation({
    mutationFn: async (values: BatchFormData) => {
      const receivedDate = values.receivedDate.format('YYYY-MM-DD');
      if (editing) {
        const data: UpdateBatchRequest = {
          batchNo: values.batchNo,
          supplier: values.supplier,
          receivedDate,
          quantity: values.quantity,
          status: values.status,
        };
        return updateBatch(editing.id, data);
      }
      const data: CreateBatchRequest = {
        materialId: values.materialId,
        batchNo: values.batchNo,
        supplier: values.supplier,
        receivedDate,
        quantity: values.quantity,
        status: values.status,
      };
      return createBatch(data);
    },
    onSuccess: () => {
      message.success(editing ? '更新批次成功' : '创建批次成功');
      queryClient.invalidateQueries({ queryKey: ['material-batches'] });
      onSuccess();
      onClose();
    },
    // 接口错误（409 批次号重复 / 404 物料不存在）由 request.ts 统一提示
  });

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      mutation.mutate(values);
    } catch {
      // 表单校验失败
    }
  };

  return (
    <Modal
      title={editing ? `编辑批次 - ${editing.batchNo}` : '新建批次'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={mutation.isPending}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
      width={560}
    >
      <Form<BatchFormData> form={form} layout="vertical">
        <Form.Item
          label="物料"
          name="materialId"
          rules={[{ required: true, message: '请选择物料' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="请选择物料"
            options={materialOptions}
            disabled={!!editing}
          />
        </Form.Item>

        <Form.Item
          label="批次号"
          name="batchNo"
          rules={[
            { required: true, message: '请输入批次号' },
            { max: 50, message: '批次号最多 50 个字符' },
          ]}
          extra="批次号全局唯一，重复保存将被拒绝（409）"
        >
          <Input placeholder="如：B20260801-001" />
        </Form.Item>

        <Form.Item
          label="供应商"
          name="supplier"
          rules={[
            { required: true, message: '请输入供应商' },
            { max: 100, message: '供应商最多 100 个字符' },
          ]}
        >
          <Input placeholder="供应商名称" />
        </Form.Item>

        <Form.Item
          label="入库日期"
          name="receivedDate"
          rules={[{ required: true, message: '请选择入库日期' }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          label="批次数量"
          name="quantity"
          rules={[{ required: true, message: '请输入批次数量' }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            precision={2}
            placeholder="入库批次数量"
          />
        </Form.Item>

        <Form.Item
          label="状态"
          name="status"
          rules={[{ required: true, message: '请选择状态' }]}
          extra="P1.0 状态由手工维护（自动过期依赖保质期字段，列 P1.1）"
        >
          <Select
            options={(Object.keys(BATCH_STATUS_MAP) as BatchStatus[]).map(
              (value) => ({
                value,
                label: BATCH_STATUS_MAP[value].label,
              }),
            )}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default BatchFormModal;

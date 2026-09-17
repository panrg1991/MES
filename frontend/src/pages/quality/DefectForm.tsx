/**
 * MES 系统 - 不良品登记/处理表单组件
 * 双模式：
 *   - mode="create"：登记不良品（选择工单+设备+不良类型+不良原因+数量+备注）
 *   - mode="handle"：处理不良品（处理方式+备注）
 * 作为弹窗被 DefectList 调用
 *
 * 【交互约定】工单与设备均为**下拉搜索选择**（展示编号/名称，提交对应的 ID），
 * 不让操作员手工输入 ID —— 现场人员无法知晓数据库主键，手输 ID 极易出错。
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  App,
  Descriptions,
} from 'antd';
import type { DefectHandlingMethod } from '@/types';
import {
  createDefect,
  updateDefect,
  type DefectListItem,
  type CreateDefectRequest,
  type UpdateDefectRequest,
} from '@/api/quality.api';
import { getWorkOrders } from '@/api/production.api';
import { getEquipments } from '@/api/equipment.api';
import { DROPDOWN_PAGE_SIZE, WORK_ORDER_STATUS_MAP } from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';

const { TextArea } = Input;

/** 处理方式选项 */
const HANDLING_OPTIONS = [
  { label: '返工', value: 'rework' },
  { label: '报废', value: 'scrap' },
  { label: '让步接收', value: 'concession' },
];

/** 不良类型预设选项 */
const DEFECT_TYPE_OPTIONS = [
  { label: '尺寸超差', value: '尺寸超差' },
  { label: '外观缺陷', value: '外观缺陷' },
  { label: '功能不良', value: '功能不良' },
  { label: '装配不良', value: '装配不良' },
  { label: '材料缺陷', value: '材料缺陷' },
  { label: '其他', value: '其他' },
];

/** 创建表单数据 */
interface CreateFormData {
  workOrderId: number;
  equipmentId?: number;
  defectType: string;
  defectReason?: string;
  quantity: number;
  remark?: string;
}

/** 处理表单数据 */
interface HandleFormData {
  handlingMethod: DefectHandlingMethod;
  remark?: string;
}

interface DefectFormProps {
  /** 模式：create=登记，handle=处理 */
  mode: 'create' | 'handle';
  /** 处理模式下传入的不良品记录 */
  defect?: DefectListItem | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 不良品表单弹窗组件 */
function DefectForm({
  mode,
  defect,
  visible,
  onClose,
  onSuccess,
}: DefectFormProps) {
  const { message } = App.useApp();
  const [createForm] = Form.useForm<CreateFormData>();
  const [handleForm] = Form.useForm<HandleFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const isCreate = mode === 'create';

  // 工单下拉：仅登记模式且弹窗打开时拉取
  const { data: workOrderData, isLoading: workOrderLoading } = useQuery({
    queryKey: ['workOrders', 'defect-form-options'],
    queryFn: () => getWorkOrders({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible && isCreate,
  });

  // 设备下拉：同上
  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ['equipments', 'defect-form-options'],
    queryFn: () => getEquipments({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible && isCreate,
  });

  /** 工单下拉选项：展示「工单号 · 产品名（状态）」，提交值为工单 ID */
  const workOrderOptions = (workOrderData?.list ?? []).map((order) => ({
    value: order.id,
    label: `${order.orderNo} · ${order.productName}（${
      WORK_ORDER_STATUS_MAP[order.status]?.label ?? order.status
    }）`,
  }));

  /** 设备下拉选项：展示「设备编码 · 设备名称」，提交值为设备 ID */
  const equipmentOptions = (equipmentData?.list ?? []).map((equipment) => ({
    value: equipment.id,
    label: `${equipment.code} · ${equipment.name}`,
  }));

  /** 弹窗打开时重置/填充表单 */
  useEffect(() => {
    if (visible) {
      if (isCreate) {
        createForm.resetFields();
      } else {
        handleForm.resetFields();
      }
    }
  }, [visible, isCreate, createForm, handleForm]);

  /** 提交创建 */
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      const data: CreateDefectRequest = {
        workOrderId: values.workOrderId,
        equipmentId: values.equipmentId || undefined,
        defectType: values.defectType,
        defectReason: values.defectReason || '',
        quantity: values.quantity,
        remark: values.remark || '',
      };
      await createDefect(data);
      message.success('登记不良品成功');
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误
    }
  };

  /** 提交处理 */
  const handleHandleSubmit = async () => {
    if (!defect) return;
    try {
      const values = await handleForm.validateFields();
      const data: UpdateDefectRequest = {
        handlingMethod: values.handlingMethod,
        remark: values.remark || '',
      };
      await updateDefect(defect.id, data);
      message.success('处理不良品成功');
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误
    }
  };

  // ==================== 创建模式弹窗 ====================

  if (isCreate) {
    return (
      <Modal
        title="登记不良品"
        open={visible}
        onOk={handleCreateSubmit}
        onCancel={onClose}
        okButtonProps={{
          disabled: !hasPermission('quality:defect:create'),
        }}
        okText="提交"
        cancelText="取消"
        destroyOnHidden
        width={550}
      >
        <Form<CreateFormData> form={createForm} layout="vertical">
          <Form.Item
            label="关联工单"
            name="workOrderId"
            rules={[{ required: true, message: '请选择关联工单' }]}
          >
            <Select
              showSearch
              placeholder="按工单号 / 产品名搜索"
              optionFilterProp="label"
              loading={workOrderLoading}
              options={workOrderOptions}
            />
          </Form.Item>

          <Form.Item label="关联设备（可选）" name="equipmentId">
            <Select
              showSearch
              allowClear
              placeholder="按设备编码 / 名称搜索（可选）"
              optionFilterProp="label"
              loading={equipmentLoading}
              options={equipmentOptions}
            />
          </Form.Item>

          <Form.Item
            label="不良类型"
            name="defectType"
            rules={[{ required: true, message: '请选择不良类型' }]}
          >
            <Select
              options={DEFECT_TYPE_OPTIONS}
              placeholder="请选择不良类型"
              showSearch
            />
          </Form.Item>

          <Form.Item
            label="不良原因"
            name="defectReason"
            rules={[{ max: 500, message: '不良原因最多 500 个字符' }]}
          >
            <TextArea rows={2} placeholder="请输入不良原因" />
          </Form.Item>

          <Form.Item
            label="不良数量"
            name="quantity"
            rules={[
              { required: true, message: '请输入不良数量' },
              {
                type: 'number',
                min: 1,
                message: '不良数量必须大于 0',
              },
            ]}
          >
            <InputNumber
              placeholder="请输入不良数量"
              min={1}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            label="备注"
            name="remark"
            rules={[{ max: 500, message: '备注最多 500 个字符' }]}
          >
            <TextArea rows={2} placeholder="请输入备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    );
  }

  // ==================== 处理模式弹窗 ====================

  return (
    <Modal
      title="处理不良品"
      open={visible}
      onOk={handleHandleSubmit}
      onCancel={onClose}
      okButtonProps={{
        disabled: !hasPermission('quality:defect:handle'),
      }}
      okText="确认处理"
      cancelText="取消"
      destroyOnHidden
      width={500}
    >
      {defect && (
        <Descriptions
          column={1}
          size="small"
          bordered
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'orderNo',
              label: '工单号',
              children: defect.workOrder?.orderNo || '-',
            },
            {
              key: 'defectType',
              label: '不良类型',
              children: defect.defectType,
            },
            {
              key: 'quantity',
              label: '不良数量',
              children: defect.quantity,
            },
            {
              key: 'reason',
              label: '不良原因',
              children: defect.defectReason || '-',
            },
          ]}
        />
      )}

      <Form<HandleFormData> form={handleForm} layout="vertical">
        <Form.Item
          label="处理方式"
          name="handlingMethod"
          rules={[{ required: true, message: '请选择处理方式' }]}
        >
          <Select options={HANDLING_OPTIONS} placeholder="请选择处理方式" />
        </Form.Item>

        <Form.Item
          label="处理备注"
          name="remark"
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <TextArea rows={3} placeholder="请输入处理备注" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default DefectForm;

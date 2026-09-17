/**
 * MES 系统 - 检验录入表单组件
 * 功能：选择关联工单 + 检验类型 + 动态检验项明细列表（含标准值/实测值/判定结果）
 * 作为弹窗被 InspectionList 调用
 */

import { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Divider,
  App,
  Spin,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { InspectionResult } from '@/types';
import { createInspection, type CreateInspectionRequest } from '@/api/quality.api';
import { getWorkOrders, type WorkOrderListItem } from '@/api/production.api';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_PAGE_SIZE } from '@/utils/constants';

const { TextArea } = Input;

/** 检验类型选项 */
const INSPECTION_TYPE_OPTIONS = [
  { label: '首件检验', value: 'first_article' },
  { label: '过程检验', value: 'process' },
  { label: '成品检验', value: 'final' },
];

/** 检验项判定结果选项 */
const RESULT_OPTIONS = [
  { label: '合格', value: 'pass' },
  { label: '不合格', value: 'fail' },
  { label: '让步接收', value: 'concession' },
];

/** 检验表单数据 */
interface InspectionFormData {
  workOrderId: number;
  inspectionType: 'first_article' | 'process' | 'final';
  remark?: string;
  items: Array<{
    itemName: string;
    standardValue: string;
    actualValue: string;
    unit?: string;
    result: InspectionResult;
    remark?: string;
  }>;
}

interface InspectionFormProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 检验录入弹窗组件 */
function InspectionForm({ visible, onClose, onSuccess }: InspectionFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<InspectionFormData>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // 工单列表数据
  const [workOrders, setWorkOrders] = useState<WorkOrderListItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  /** 弹窗打开时加载工单列表 + 重置表单 */
  useEffect(() => {
    if (visible) {
      form.resetFields();
      // 加载工单列表（取前100条）
      setLoadingOrders(true);
      getWorkOrders({ page: 1, pageSize: DEFAULT_PAGE_SIZE * 5 })
        .then((res) => setWorkOrders(res.list))
        .catch(() => {
          message.error('加载工单列表失败');
        })
        .finally(() => setLoadingOrders(false));
    }
  }, [visible, form, message]);

  /** 提交检验 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data: CreateInspectionRequest = {
        workOrderId: values.workOrderId,
        inspectionType: values.inspectionType,
        remark: values.remark || '',
        items: values.items.map((item) => ({
          itemName: item.itemName,
          standardValue: item.standardValue,
          actualValue: item.actualValue,
          unit: item.unit || '',
          result: item.result,
          remark: item.remark || '',
        })),
      };
      await createInspection(data);
      message.success('创建检验记录成功');
      onSuccess();
      onClose();
    } catch {
      // 校验失败或接口错误
    }
  };

  /** 工单选项 */
  const workOrderOptions = workOrders.map((wo) => ({
    label: `${wo.orderNo} - ${wo.productName}`,
    value: wo.id,
  }));

  return (
    <Modal
      title="录入检验记录"
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      okButtonProps={{ disabled: !hasPermission('quality:inspection:create') }}
      okText="提交"
      cancelText="取消"
      destroyOnClose
      width={800}
    >
      <Form<InspectionFormData>
        form={form}
        layout="vertical"
        initialValues={{ inspectionType: 'process' }}
      >
        <Form.Item
          label="关联工单"
          name="workOrderId"
          rules={[{ required: true, message: '请选择关联工单' }]}
        >
          {loadingOrders ? (
            <Spin size="small" />
          ) : (
            <Select
              showSearch
              placeholder="选择关联工单"
              options={workOrderOptions}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          )}
        </Form.Item>

        <Form.Item
          label="检验类型"
          name="inspectionType"
          rules={[{ required: true, message: '请选择检验类型' }]}
        >
          <Select options={INSPECTION_TYPE_OPTIONS} />
        </Form.Item>

        <Divider>检验项明细</Divider>

        <Form.List name="items" initialValue={[{}]}>
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    border: '1px solid #f0f0f0',
                    padding: 12,
                    marginBottom: 12,
                    borderRadius: 4,
                  }}
                >
                  <Space align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'itemName']}
                      rules={[{ required: true, message: '请输入检验项名称' }]}
                      style={{ flex: 1, minWidth: 200 }}
                    >
                      <Input placeholder="检验项名称" />
                    </Form.Item>
                    {fields.length > 1 ? (
                      <MinusCircleOutlined
                        onClick={() => remove(field.name)}
                        style={{ color: '#ff4d4f', fontSize: 18 }}
                      />
                    ) : null}
                  </Space>

                  <Space wrap align="baseline">
                    <Form.Item
                      {...field}
                      name={[field.name, 'standardValue']}
                      rules={[{ required: true, message: '请输入标准值' }]}
                    >
                      <Input placeholder="标准值" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'actualValue']}
                      rules={[{ required: true, message: '请输入实测值' }]}
                    >
                      <Input placeholder="实测值" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'unit']}>
                      <Input placeholder="单位" style={{ width: 80 }} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'result']}
                      rules={[{ required: true, message: '请选择判定结果' }]}
                    >
                      <Select
                        options={RESULT_OPTIONS}
                        placeholder="判定结果"
                        style={{ width: 130 }}
                      />
                    </Form.Item>
                  </Space>

                  <Form.Item {...field} name={[field.name, 'remark']}>
                    <TextArea
                      rows={1}
                      placeholder="备注（可选）"
                      style={{ marginTop: 4 }}
                    />
                  </Form.Item>
                </div>
              ))}

              <Button
                type="dashed"
                onClick={() => add({ result: 'pass' })}
                icon={<PlusOutlined />}
                block
              >
                添加检验项
              </Button>
            </>
          )}
        </Form.List>

        <Form.Item
          label="备注"
          name="remark"
          style={{ marginTop: 16 }}
          rules={[{ max: 500, message: '备注最多 500 个字符' }]}
        >
          <TextArea rows={2} placeholder="请输入备注（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default InspectionForm;

/**
 * MES 系统 - 班次新增 / 编辑弹窗（P1-09，T08）
 * 起止时间 HH:mm，支持跨夜班次（如 22:00 - 06:00）；开始 == 结束由校验拒绝
 */

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { createShift, updateShift, type SaveShiftRequest } from '@/api/personnel.api';
import type { Shift } from '@/types';

/** 表单值类型 */
interface ShiftFormValues {
  name: string;
  startTime: Dayjs;
  endTime: Dayjs;
  description?: string;
}

interface ShiftFormModalProps {
  visible: boolean;
  /** 编辑时传入既有班次 */
  editingShift?: Shift | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** Dayjs → 'HH:mm' 字符串 */
const toHHmm = (value: Dayjs): string => value.format('HH:mm');

/** 班次表单弹窗组件 */
function ShiftFormModal({ visible, editingShift, onClose, onSuccess }: ShiftFormModalProps) {
  const [form] = Form.useForm<ShiftFormValues>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        name: editingShift?.name,
        startTime: editingShift ? dayjs(editingShift.startTime, 'HH:mm') : undefined,
        endTime: editingShift ? dayjs(editingShift.endTime, 'HH:mm') : undefined,
        description: editingShift?.description,
      });
    }
  }, [visible, editingShift, form]);

  const saveMutation = useMutation({
    mutationFn: (values: ShiftFormValues) => {
      const payload: SaveShiftRequest = {
        name: values.name,
        startTime: toHHmm(values.startTime),
        endTime: toHHmm(values.endTime),
        description: values.description || '',
      };
      return editingShift
        ? updateShift(editingShift.id, payload)
        : createShift(payload);
    },
    onSuccess: () => {
      message.success(editingShift ? '更新班次成功' : '创建班次成功');
      // 班次下拉选项在排班/工时页复用，一并失效
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      onSuccess();
    },
  });

  /** 提交（开始 == 结束 前端先校验，后端兜底 400） */
  const handleOk = async () => {
    const values = await form.validateFields();
    if (toHHmm(values.startTime) === toHHmm(values.endTime)) {
      message.error('班次开始时间与结束时间不能相同');
      return;
    }
    await saveMutation.mutateAsync(values);
  };

  return (
    <Modal
      open={visible}
      title={editingShift ? '编辑班次' : '新增班次'}
      okText={editingShift ? '保存' : '创建'}
      cancelText="取消"
      confirmLoading={saveMutation.isPending}
      onOk={() => {
        void handleOk();
      }}
      onCancel={onClose}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="班次名称"
          rules={[{ required: true, message: '请输入班次名称' }]}
        >
          <Input maxLength={50} placeholder="如：早班 / 中班 / 夜班" />
        </Form.Item>
        <Form.Item
          name="startTime"
          label="开始时间"
          rules={[{ required: true, message: '请选择开始时间' }]}
        >
          <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="endTime"
          label="结束时间"
          dependencies={['startTime']}
          rules={[
            { required: true, message: '请选择结束时间' },
            ({ getFieldValue }) => ({
              validator(_, value: Dayjs) {
                const start = getFieldValue('startTime') as Dayjs | undefined;
                if (!value || !start || toHHmm(value) !== toHHmm(start)) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('结束时间不能与开始时间相同'));
              },
            }),
          ]}
        >
          <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} maxLength={200} placeholder="班次描述（可选）" />
        </Form.Item>
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          提示：结束时间早于开始时间表示跨夜班次（如 22:00 - 06:00），排班与工时将按跨夜规则处理。
        </div>
      </Form>
    </Modal>
  );
}

export default ShiftFormModal;

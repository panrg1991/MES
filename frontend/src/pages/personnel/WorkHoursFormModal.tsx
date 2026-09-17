/**
 * MES 系统 - 工时录入 / 编辑弹窗（P1-10，T08）
 * hours 由服务端自动计算（跨夜 endTime <= startTime 按 +24h；endTime 为空 → 0），前端只填起止
 */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  createWorkHours,
  getShifts,
  updateWorkHours,
  type SaveWorkHoursRequest,
  type WorkHoursItem,
} from '@/api/personnel.api';
import { getWorkOrders } from '@/api/production.api';
import { getUsers } from '@/api/user.api';
import { DROPDOWN_PAGE_SIZE } from '@/utils/constants';

/** 表单值类型 */
interface WorkHoursFormValues {
  userId?: number;
  workOrderId: number;
  shiftId?: number;
  workDate: Dayjs;
  startTime: Dayjs;
  endTime?: Dayjs | null;
}

interface WorkHoursFormModalProps {
  visible: boolean;
  /** 编辑时传入既有记录 */
  editingRecord?: WorkHoursItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** Dayjs → 'YYYY-MM-DD HH:mm'（后端可解析） */
const toDateTimeString = (value: Dayjs): string => value.format('YYYY-MM-DD HH:mm');

/** 工时表单弹窗组件 */
function WorkHoursFormModal({
  visible,
  editingRecord,
  onClose,
  onSuccess,
}: WorkHoursFormModalProps) {
  const [form] = Form.useForm<WorkHoursFormValues>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  // 下拉数据：人员（启用）/ 工单 / 班次
  const { data: userData } = useQuery({
    queryKey: ['users', 'workhours-form-options'],
    queryFn: () => getUsers({ page: 1, pageSize: DROPDOWN_PAGE_SIZE, status: 'true' }),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });
  const { data: workOrderData } = useQuery({
    queryKey: ['workOrders', 'workhours-form-options'],
    queryFn: () => getWorkOrders({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    enabled: visible,
  });
  const { data: shiftData } = useQuery({
    queryKey: ['shifts', 'workhours-form-options'],
    queryFn: () => getShifts(),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        userId: editingRecord?.userId ?? undefined,
        workOrderId: editingRecord?.workOrderId,
        shiftId: editingRecord?.shiftId ?? undefined,
        workDate: editingRecord ? dayjs(editingRecord.workDate) : dayjs(),
        startTime: editingRecord ? dayjs(editingRecord.startTime) : undefined,
        endTime: editingRecord?.endTime ? dayjs(editingRecord.endTime) : null,
      });
    }
  }, [visible, editingRecord, form]);

  const saveMutation = useMutation({
    mutationFn: (values: WorkHoursFormValues) => {
      const payload: SaveWorkHoursRequest = {
        userId: values.userId ?? null,
        workOrderId: values.workOrderId,
        shiftId: values.shiftId ?? null,
        workDate: values.workDate.format('YYYY-MM-DD'),
        startTime: toDateTimeString(values.startTime),
        endTime: values.endTime ? toDateTimeString(values.endTime) : null,
      };
      return editingRecord
        ? updateWorkHours(editingRecord.id, payload)
        : createWorkHours(payload);
    },
    onSuccess: () => {
      message.success(editingRecord ? '更新工时成功' : '录入工时成功');
      queryClient.invalidateQueries({ queryKey: ['workHours'] });
      queryClient.invalidateQueries({ queryKey: ['workHoursSummary'] });
      onSuccess();
    },
  });

  /** 提交 */
  const handleOk = async () => {
    const values = await form.validateFields();
    await saveMutation.mutateAsync(values);
  };

  return (
    <Modal
      open={visible}
      title={editingRecord ? '编辑工时记录' : '录入工时'}
      okText={editingRecord ? '保存' : '录入'}
      cancelText="取消"
      confirmLoading={saveMutation.isPending}
      onOk={() => {
        void handleOk();
      }}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="userId" label="人员（可选）">
          <Select
            showSearch
            allowClear
            placeholder="按姓名搜索（仅启用用户）"
            optionFilterProp="label"
            options={(userData?.list ?? []).map((user) => ({
              value: user.id,
              label: `${user.name}（${user.department}）`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="workOrderId"
          label="关联工单"
          rules={[{ required: true, message: '请选择工单' }]}
        >
          <Select
            showSearch
            placeholder="按工单号 / 产品名搜索"
            optionFilterProp="label"
            options={(workOrderData?.list ?? []).map((order) => ({
              value: order.id,
              label: `${order.orderNo} · ${order.productName}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="shiftId" label="班次（可选）">
          <Select
            allowClear
            placeholder="请选择班次"
            options={(shiftData?.list ?? []).map((shift) => ({
              value: shift.id,
              label: `${shift.name}（${shift.startTime}-${shift.endTime}）`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="workDate"
          label="工作日期"
          rules={[{ required: true, message: '请选择工作日期' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          name="startTime"
          label="开始时间"
          rules={[{ required: true, message: '请选择开始时间' }]}
        >
          <DatePicker
            needConfirm={false}
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Form.Item name="endTime" label="结束时间（可选，为空表示进行中）">
          <DatePicker
            needConfirm={false}
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
          />
        </Form.Item>
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          提示：工时由服务端自动计算（保留 2 位小数）；跨夜（如 20:00 → 04:00）按次日计算记 8 小时；
          结束时间为空时工时记 0。
        </div>
      </Form>
    </Modal>
  );
}

export default WorkHoursFormModal;

/**
 * MES 系统 - 排班新增 / 调班弹窗（P1-09，T08）
 * 冲突（同人 + 同日 + 同班次重复）由后端校验，409 提示由拦截器弹出
 */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  createPersonnelSchedule,
  getShifts,
  updatePersonnelSchedule,
  type PersonnelScheduleItem,
} from '@/api/personnel.api';
import { getUsers } from '@/api/user.api';
import { DROPDOWN_PAGE_SIZE } from '@/utils/constants';

/** 表单值类型 */
interface ScheduleFormValues {
  userId: number;
  shiftId: number;
  scheduleDate: Dayjs;
  workStation?: string;
  remark?: string;
}

interface ScheduleFormModalProps {
  visible: boolean;
  /** 默认排班日期（YYYY-MM-DD，日历点击带入） */
  scheduleDate: string;
  /** 编辑（调班）时传入既有记录 */
  editingRecord?: PersonnelScheduleItem;
  onClose: () => void;
  onSuccess: () => void;
}

/** 排班表单弹窗组件 */
function ScheduleFormModal({
  visible,
  scheduleDate,
  editingRecord,
  onClose,
  onSuccess,
}: ScheduleFormModalProps) {
  const [form] = Form.useForm<ScheduleFormValues>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  // 人员下拉（仅启用用户）与班次下拉
  const { data: userData } = useQuery({
    queryKey: ['users', 'schedule-form-options'],
    queryFn: () => getUsers({ page: 1, pageSize: DROPDOWN_PAGE_SIZE, status: 'true' }),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });
  const { data: shiftData } = useQuery({
    queryKey: ['shifts', 'schedule-form-options'],
    queryFn: () => getShifts(),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        userId: editingRecord?.userId,
        shiftId: editingRecord?.shiftId,
        scheduleDate: dayjs(editingRecord?.scheduleDate || scheduleDate),
        workStation: editingRecord?.workStation,
        remark: editingRecord?.remark,
      });
    }
  }, [visible, editingRecord, scheduleDate, form]);

  const saveMutation = useMutation({
    mutationFn: (values: ScheduleFormValues) => {
      const payload = {
        userId: values.userId,
        shiftId: values.shiftId,
        scheduleDate: values.scheduleDate.format('YYYY-MM-DD'),
        workStation: values.workStation || '',
        remark: values.remark || '',
      };
      return editingRecord
        ? updatePersonnelSchedule(editingRecord.id, payload)
        : createPersonnelSchedule(payload);
    },
    onSuccess: () => {
      message.success(editingRecord ? '调班成功' : '新增排班成功');
      queryClient.invalidateQueries({ queryKey: ['scheduleCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['personnelSchedules'] });
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
      title={editingRecord ? '调班 / 换班' : '新增排班'}
      okText={editingRecord ? '保存' : '新增'}
      cancelText="取消"
      confirmLoading={saveMutation.isPending}
      onOk={() => {
        void handleOk();
      }}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="userId"
          label="人员"
          rules={[{ required: true, message: '请选择人员' }]}
        >
          <Select
            showSearch
            placeholder="按姓名搜索（仅启用用户）"
            optionFilterProp="label"
            options={(userData?.list ?? []).map((user) => ({
              value: user.id,
              label: `${user.name}（${user.department}）`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="shiftId"
          label="班次"
          rules={[{ required: true, message: '请选择班次' }]}
        >
          <Select
            placeholder="请选择班次"
            options={(shiftData?.list ?? []).map((shift) => ({
              value: shift.id,
              label: `${shift.name}（${shift.startTime}-${shift.endTime}）`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="scheduleDate"
          label="排班日期"
          rules={[{ required: true, message: '请选择排班日期' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="workStation" label="工位">
          <Input maxLength={50} placeholder="工位（可选，自由文本）" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={200} placeholder="备注（可选）" />
        </Form.Item>
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          提示：同一人员同一天同一班次仅可排班一次（重复将被拒绝）；跨夜班次归属排班日当天。
        </div>
      </Form>
    </Modal>
  );
}

export default ScheduleFormModal;

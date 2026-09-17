/**
 * MES 系统 - 人员排班日历页面（P1-09，T08 实现，替换 T06 占位）
 *
 * 功能：antd Calendar 按月排班 + 人员/班次筛选 + 点击日期查看当日排班 / 新增 / 换班调班 / 删除。
 * 权限：personnel:schedule:view / :create / :edit / :delete
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import ScheduleCalendar from '@/components/personnel/ScheduleCalendar';
import ScheduleFormModal from './ScheduleFormModal';
import {
  deletePersonnelSchedule,
  getScheduleCalendar,
  getShifts,
  type PersonnelScheduleItem,
} from '@/api/personnel.api';
import { getUsers } from '@/api/user.api';
import { useAuthStore } from '@/stores/authStore';
import { DROPDOWN_PAGE_SIZE } from '@/utils/constants';

/** 排班管理页面组件 */
function ScheduleManagement() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // ==================== 状态 ====================
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined);
  const [filterShiftId, setFilterShiftId] = useState<number | undefined>(undefined);
  /** 点击的日期（打开当日排班弹窗） */
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  /** 新增/编辑排班弹窗：null=关闭；{scheduleDate}=新增；{record}=编辑 */
  const [formState, setFormState] = useState<{
    scheduleDate: string;
    record?: PersonnelScheduleItem;
  } | null>(null);

  // ==================== 数据查询 ====================

  const calendarRange = useMemo(() => {
    const start = month.startOf('month').subtract(7, 'day');
    const end = month.endOf('month').add(7, 'day');
    return {
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
      userId: filterUserId,
      shiftId: filterShiftId,
    };
  }, [month, filterUserId, filterShiftId]);

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['scheduleCalendar', calendarRange],
    queryFn: () => getScheduleCalendar(calendarRange),
  });

  // 人员 / 班次下拉（人员仅启用状态）
  const { data: userData } = useQuery({
    queryKey: ['users', 'schedule-options'],
    queryFn: () => getUsers({ page: 1, pageSize: DROPDOWN_PAGE_SIZE, status: 'true' }),
    staleTime: 5 * 60 * 1000,
  });
  const { data: shiftData } = useQuery({
    queryKey: ['shifts', 'schedule-options'],
    queryFn: () => getShifts(),
    staleTime: 5 * 60 * 1000,
  });

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePersonnelSchedule(id),
    onSuccess: () => {
      message.success('删除排班成功');
      queryClient.invalidateQueries({ queryKey: ['scheduleCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['personnelSchedules'] });
    },
  });

  /** 当日排班列表（弹窗内表格） */
  const dayItems =
    calendarData?.matrix.find((cell) => cell.date === selectedDate?.format('YYYY-MM-DD'))
      ?.items ?? [];

  /** 当日排班表格列 */
  const dayColumns: ColumnsType<typeof dayItems[number]> = [
    { title: '人员', dataIndex: 'userName', key: 'userName', width: 100 },
    {
      title: '班次',
      key: 'shift',
      width: 160,
      render: (_, record) => (
        <Tag color="blue">
          {record.shiftName}（{record.shiftTimeRange}）
        </Tag>
      ),
    },
    { title: '工位', dataIndex: 'workStation', key: 'workStation', width: 100 },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            disabled={!hasPermission('personnel:schedule:edit')}
            onClick={() => {
              // 【BugFix】避免空串日期提交：未选中日期时不进入调班弹窗（空串会触发后端参数校验失败）
              const dateText = selectedDate?.format('YYYY-MM-DD');
              if (!dateText) {
                message.warning('请先选择排班日期');
                return;
              }
              setFormState({
                scheduleDate: dateText,
                record: {
                  id: record.id,
                  userId: record.userId,
                  shiftId: record.shiftId,
                  workStation: record.workStation,
                  scheduleDate: dateText,
                  remark: '',
                  createdAt: '',
                  updatedAt: '',
                },
              });
            }}
          >
            调班
          </Button>
          <Popconfirm
            title="确认删除该排班？"
            okText="删除"
            cancelText="取消"
            disabled={!hasPermission('personnel:schedule:delete')}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              disabled={!hasPermission('personnel:schedule:delete')}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span>人员：</span>
          <Select
            placeholder="全部人员"
            style={{ width: 160 }}
            allowClear
            value={filterUserId}
            onChange={(value) => setFilterUserId(value)}
            options={(userData?.list ?? []).map((user) => ({
              value: user.id,
              label: user.name,
            }))}
          />
          <span>班次：</span>
          <Select
            placeholder="全部班次"
            style={{ width: 160 }}
            allowClear
            value={filterShiftId}
            onChange={(value) => setFilterShiftId(value)}
            options={(shiftData?.list ?? []).map((shift) => ({
              value: shift.id,
              label: `${shift.name}（${shift.startTime}-${shift.endTime}）`,
            }))}
          />
          {hasPermission('personnel:schedule:create') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormState({ scheduleDate: dayjs().format('YYYY-MM-DD') })}
            >
              新增排班
            </Button>
          )}
        </Space>
      </Card>

      {/* 排班日历 */}
      <Card size="small" loading={isLoading}>
        <ScheduleCalendar
          month={month}
          onMonthChange={(value) => setMonth(value.startOf('month'))}
          matrix={calendarData?.matrix ?? []}
          onDateSelect={(date) => setSelectedDate(date)}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          提示：点击日期查看当日排班并支持换班调班；跨夜班次（如 22:00-06:00）排班归属排班日当天。
        </Typography.Text>
      </Card>

      {/* 当日排班弹窗 */}
      <Modal
        open={selectedDate !== null}
        title={`${selectedDate?.format('YYYY-MM-DD dddd') ?? ''} 排班明细`}
        onCancel={() => setSelectedDate(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedDate(null)}>
            关闭
          </Button>,
          hasPermission('personnel:schedule:create') && selectedDate && (
            <Button
              key="add"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() =>
                setFormState({ scheduleDate: selectedDate.format('YYYY-MM-DD') })
              }
            >
              新增排班
            </Button>
          ),
        ].filter(Boolean)}
        width={640}
      >
        <Table
          rowKey="id"
          size="small"
          columns={dayColumns}
          dataSource={dayItems}
          pagination={false}
          locale={{ emptyText: '当日暂无排班' }}
        />
      </Modal>

      {/* 新增 / 调班弹窗 */}
      {formState && (
        <ScheduleFormModal
          visible
          scheduleDate={formState.scheduleDate}
          editingRecord={formState.record}
          onClose={() => setFormState(null)}
          onSuccess={() => {
            setFormState(null);
            queryClient.invalidateQueries({ queryKey: ['scheduleCalendar'] });
            queryClient.invalidateQueries({ queryKey: ['personnelSchedules'] });
          }}
        />
      )}
    </div>
  );
}

export default ScheduleManagement;

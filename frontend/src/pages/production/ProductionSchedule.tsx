/**
 * MES 系统 - 生产排程（甘特图）页面（P1-01，T08 实现，替换 T06 占位）
 *
 * 功能：时间窗/设备/状态筛选 + 自绘 SimpleGantt + 拖拽调整时段（前后端双校验冲突）
 *      + 创建/删除排程 + 状态流转。
 * 权限：production:schedule:view / :create / :edit / :delete
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Modal,
  Select,
  Space,
  Tag,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import SimpleGantt from '@/components/gantt/SimpleGantt';
import ScheduleFormModal from './ScheduleFormModal';
import {
  deleteSchedule,
  getSchedules,
  updateSchedule,
  updateScheduleStatus,
  type ScheduleListItem,
} from '@/api/schedule.api';
import { getEquipments } from '@/api/equipment.api';
import type { GanttRow, GanttTask, ScheduleStatus } from '@/types';
import {
  DROPDOWN_PAGE_SIZE,
  SCHEDULE_STATUS_MAP,
  SCHEDULE_STATUS_TRANSITIONS,
} from '@/utils/constants';
import { formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';

/** 默认时间窗：今天起 14 天 */
const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().startOf('day'), dayjs().add(14, 'day').endOf('day')];

/** 排程页面组件 */
function ProductionSchedule() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // ==================== 筛选状态 ====================
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(DEFAULT_RANGE);
  const [equipmentId, setEquipmentId] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<ScheduleStatus | undefined>(undefined);
  const [createVisible, setCreateVisible] = useState(false);
  /** 点击条块打开的排程详情 */
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);

  // ==================== 数据查询 ====================

  const queryParams = useMemo(
    () => ({
      startDate: dateRange[0].startOf('day').toISOString(),
      endDate: dateRange[1].endOf('day').toISOString(),
      equipmentId,
      status,
    }),
    [dateRange, equipmentId, status],
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['schedules', queryParams],
    queryFn: () => getSchedules(queryParams),
  });

  // 设备列表（甘特行标签 + 创建弹窗下拉）
  const { data: equipmentData } = useQuery({
    queryKey: ['equipments', 'all-for-gantt'],
    queryFn: () => getEquipments({ page: 1, pageSize: DROPDOWN_PAGE_SIZE }),
    staleTime: 5 * 60 * 1000,
  });

  // ==================== 甘特行构建（行 = 设备） ====================

  const ganttRows: GanttRow[] = useMemo(() => {
    const schedules = data?.list ?? [];
    const equipments = equipmentData?.list ?? [];

    const tasksByEquipment = new Map<number, GanttTask[]>();
    const unspecifiedTasks: GanttTask[] = [];

    for (const item of schedules) {
      const task: GanttTask = {
        id: item.id,
        workOrderId: item.workOrderId,
        orderNo: item.workOrder?.orderNo ?? `工单#${item.workOrderId}`,
        productName: item.workOrder?.productName ?? '-',
        equipmentId: item.equipmentId,
        equipmentCode: item.equipment?.code ?? '',
        plannedStart: item.plannedStart,
        plannedEnd: item.plannedEnd,
        status: item.status,
        conflicts: item.conflicts,
      };
      if (item.equipmentId === null) {
        unspecifiedTasks.push(task);
      } else {
        const bucket = tasksByEquipment.get(item.equipmentId) ?? [];
        bucket.push(task);
        tasksByEquipment.set(item.equipmentId, bucket);
      }
    }

    const rows: GanttRow[] = equipments.map((equipment) => ({
      equipmentId: equipment.id,
      label: `${equipment.code} · ${equipment.name}`,
      tasks: tasksByEquipment.get(equipment.id) ?? [],
    }));

    if (unspecifiedTasks.length > 0) {
      rows.push({ equipmentId: -1, label: '未指定设备', tasks: unspecifiedTasks });
    }
    return rows;
  }, [data, equipmentData]);

  // ==================== Mutation ====================

  const invalidateSchedules = () => {
    queryClient.invalidateQueries({ queryKey: ['schedules'] });
  };

  /** 拖拽提交（SimpleGantt 回调；失败由组件回弹，错误提示由拦截器弹出） */
  const moveMutation = useMutation({
    mutationFn: ({ id, plannedStart, plannedEnd }: { id: number; plannedStart: string; plannedEnd: string }) =>
      updateSchedule(id, { plannedStart, plannedEnd }),
    onSuccess: (result) => {
      message.success('排程调整成功');
      if (result.conflicts.length > 0) {
        message.warning(
          `冲突检测：与工单 ${result.conflicts.map((c) => c.workOrder?.orderNo ?? c.id).join('、')} 时段重叠`,
        );
      }
      invalidateSchedules();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, target }: { id: number; target: ScheduleStatus }) =>
      updateScheduleStatus(id, target),
    onSuccess: () => {
      message.success('排程状态流转成功');
      invalidateSchedules();
      setSelectedTask(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSchedule(id),
    onSuccess: () => {
      message.success('删除排程成功');
      invalidateSchedules();
      setSelectedTask(null);
    },
  });

  /** 删除确认 */
  const handleDelete = (task: GanttTask) => {
    modal.confirm({
      title: '确认删除该排程？',
      content: `工单 ${task.orderNo} 在 ${task.equipmentCode || '未指定设备'} 上的排程将被删除`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteMutation.mutateAsync(task.id),
    });
  };

  // ==================== 渲染 ====================

  const selectedDetail: ScheduleListItem | undefined = (data?.list ?? []).find(
    (item) => item.id === selectedTask?.id,
  );
  const selectedStatus: ScheduleStatus | undefined =
    selectedDetail?.status ?? selectedTask?.status;
  const allowedTargets: ScheduleStatus[] =
    (selectedStatus && SCHEDULE_STATUS_TRANSITIONS[selectedStatus]) || [];

  return (
    <div>
      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span>时间窗：</span>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(values) => {
              if (values && values[0] && values[1]) {
                setDateRange([values[0], values[1]]);
              }
            }}
            allowClear={false}
          />
          <Select
            placeholder="全部设备"
            style={{ width: 200 }}
            allowClear
            value={equipmentId}
            onChange={(value) => setEquipmentId(value)}
            options={(equipmentData?.list ?? []).map((equipment) => ({
              value: equipment.id,
              label: `${equipment.code} · ${equipment.name}`,
            }))}
          />
          <Select
            placeholder="全部状态"
            style={{ width: 140 }}
            allowClear
            value={status}
            onChange={(value) => setStatus(value)}
            options={Object.entries(SCHEDULE_STATUS_MAP).map(([value, info]) => ({
              value,
              label: info.label,
            }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            刷新
          </Button>
          {hasPermission('production:schedule:create') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateVisible(true)}
            >
              新增排程
            </Button>
          )}
        </Space>
      </Card>

      {/* 甘特图 */}
      <Card size="small" loading={isLoading}>
        <SimpleGantt
          viewStart={dateRange[0].startOf('day').toDate()}
          viewEnd={dateRange[1].endOf('day').toDate()}
          rows={ganttRows}
          onTaskMove={async (id, start, end) => {
            // 提交 PATCH（返回值丢弃以满足 Promise<void> 契约；失败由 SimpleGantt 回弹）
            await moveMutation.mutateAsync({
              id,
              plannedStart: start.toISOString(),
              plannedEnd: end.toISOString(),
            });
          }}
          onTaskClick={(task) => setSelectedTask(task)}
        />
        <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
          提示：拖动条块整体移动、拖动右端缩放时段（整点对齐）；与同设备其他排程重叠时条块变红且不可提交；
          端点相接不算冲突；点击条块查看详情与状态操作。
        </div>
      </Card>

      {/* 条块详情 / 操作弹窗 */}
      <Modal
        open={selectedTask !== null}
        title="排程详情"
        onCancel={() => setSelectedTask(null)}
        footer={null}
        width={520}
      >
        {selectedTask && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="工单">
                {selectedTask.orderNo} · {selectedTask.productName}
              </Descriptions.Item>
              <Descriptions.Item label="设备">
                {selectedTask.equipmentCode || '未指定设备'}
              </Descriptions.Item>
              <Descriptions.Item label="计划开始">
                {formatDateTime(selectedDetail?.plannedStart ?? selectedTask.plannedStart)}
              </Descriptions.Item>
              <Descriptions.Item label="计划结束">
                {formatDateTime(selectedDetail?.plannedEnd ?? selectedTask.plannedEnd)}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {selectedStatus && (
                  <Tag color={SCHEDULE_STATUS_MAP[selectedStatus].color}>
                    {SCHEDULE_STATUS_MAP[selectedStatus].label}
                  </Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
            <Space wrap style={{ marginTop: 16 }}>
              {allowedTargets.map((target) => (
                <Button
                  key={target}
                  type={target === 'completed' ? 'primary' : 'default'}
                  danger={target === 'cancelled'}
                  disabled={!hasPermission('production:schedule:edit')}
                  loading={statusMutation.isPending}
                  onClick={() =>
                    selectedTask && statusMutation.mutate({ id: selectedTask.id, target })
                  }
                >
                  流转为{SCHEDULE_STATUS_MAP[target].label}
                </Button>
              ))}
              {hasPermission('production:schedule:delete') && (
                <Button danger onClick={() => selectedTask && handleDelete(selectedTask)}>
                  删除排程
                </Button>
              )}
            </Space>
          </>
        )}
      </Modal>

      {/* 新增排程弹窗 */}
      <ScheduleFormModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSuccess={() => {
          setCreateVisible(false);
          invalidateSchedules();
        }}
      />
    </div>
  );
}

export default ProductionSchedule;

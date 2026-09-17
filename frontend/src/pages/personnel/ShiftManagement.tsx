/**
 * MES 系统 - 班次管理页面（P1-09，T08 实现，替换 T06 占位）
 *
 * 功能：班次列表 + 新增/编辑弹窗（起止时间 HH:mm，支持跨夜如 22:00-06:00）+ 删除。
 * 权限：personnel:shift:view / :create / :edit / :delete
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { deleteShift, getShifts } from '@/api/personnel.api';
import type { Shift } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import ShiftFormModal from './ShiftFormModal';

/** 判断是否跨夜班次（endTime < startTime） */
function isOvernight(shift: Shift): boolean {
  return shift.endTime < shift.startTime;
}

/** 班次管理页面组件 */
function ShiftManagement() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [formVisible, setFormVisible] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // ==================== 数据查询 ====================

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['shifts', 'list'],
    queryFn: () => getShifts(),
  });

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteShift(id),
    onSuccess: () => {
      message.success('删除班次成功');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
  });

  /** 删除确认 */
  const handleDelete = (shift: Shift) => {
    modal.confirm({
      title: '确认删除该班次？',
      content: `删除后该班次下的排班记录将被级联删除`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteMutation.mutateAsync(shift.id),
    });
  };

  // ==================== 表格列 ====================

  const columns: ColumnsType<Shift> = [
    { title: '班次名称', dataIndex: 'name', key: 'name', width: 140 },
    {
      title: '起止时间',
      key: 'timeRange',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tag color={record.endTime < record.startTime ? 'purple' : 'blue'}>
            {record.startTime} - {record.endTime}
          </Tag>
          {isOvernight(record) && <Tag color="gold">跨夜</Tag>}
        </Space>
      ),
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            disabled={!hasPermission('personnel:shift:edit')}
            onClick={() => {
              setEditingShift(record);
              setFormVisible(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={!hasPermission('personnel:shift:delete')}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="班次管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
              刷新
            </Button>
            {hasPermission('personnel:shift:create') && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingShift(null);
                  setFormVisible(true);
                }}
              >
                新增班次
              </Button>
            )}
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.list ?? []}
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: '暂无班次，请先创建班次' }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          提示：班次时间格式为 HH:mm；结束时间早于开始时间表示跨夜班次（如 22:00 - 06:00）。
        </Typography.Text>
      </Card>

      {/* 新增 / 编辑弹窗 */}
      <ShiftFormModal
        visible={formVisible}
        editingShift={editingShift}
        onClose={() => setFormVisible(false)}
        onSuccess={() => setFormVisible(false)}
      />
    </div>
  );
}

export default ShiftManagement;

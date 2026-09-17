/**
 * MES 系统 - 不良品记录列表页面
 * 功能：不良品列表（分页+搜索+筛选）、创建弹窗、处理弹窗、删除
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Button,
  Space,
  Input,
  Select,
  Popconfirm,
  Tag,
  Card,
  App,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DefectHandlingMethod } from '@/types';
import {
  getDefects,
  deleteDefect,
  type DefectListItem,
  type DefectQueryParams,
} from '@/api/quality.api';
import { formatDateTime, getDefectHandlingInfo } from '@/utils/format';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';
import DefectForm from './DefectForm';

/** 处理方式筛选选项 */
const HANDLING_OPTIONS = [
  { label: '返工', value: 'rework' },
  { label: '报废', value: 'scrap' },
  { label: '让步', value: 'concession' },
];

/** 不良品列表页面组件 */
function DefectList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [queryParams, setQueryParams] = useState<DefectQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
    defectType: undefined,
    handlingMethod: undefined,
  });

  // 弹窗状态
  const [createVisible, setCreateVisible] = useState(false);
  const [handleTarget, setHandleTarget] =
    useState<DefectListItem | null>(null);

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['defects', queryParams],
    queryFn: () => getDefects(queryParams),
  });

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDefect(id),
    onSuccess: () => {
      message.success('删除不良品记录成功');
      queryClient.invalidateQueries({ queryKey: ['defects'] });
    },
  });

  // ==================== 事件处理 ====================

  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  const handleMethodFilter = useCallback(
    (value: DefectHandlingMethod | undefined) => {
      setQueryParams((prev) => ({ ...prev, page: 1, handlingMethod: value }));
    },
    [],
  );

  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      setQueryParams((prev) => ({ ...prev, page, pageSize }));
    },
    [],
  );

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<DefectListItem> = [
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '工单号',
      key: 'orderNo',
      width: 140,
      render: (_, record: DefectListItem) =>
        record.workOrder?.orderNo || '-',
    },
    {
      title: '产品名称',
      key: 'productName',
      width: 140,
      ellipsis: true,
      render: (_, record: DefectListItem) =>
        record.workOrder?.productName || '-',
    },
    {
      title: '不良类型',
      dataIndex: 'defectType',
      key: 'defectType',
      width: 120,
      ellipsis: true,
    },
    {
      title: '不良原因',
      dataIndex: 'defectReason',
      key: 'defectReason',
      width: 180,
      ellipsis: true,
      render: (val: string) => val || '-',
    },
    {
      title: '不良数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'center',
    },
    {
      title: '处理方式',
      dataIndex: 'handlingMethod',
      key: 'handlingMethod',
      width: 100,
      render: (val: DefectHandlingMethod | null) =>
        val ? (
          <Tag color={getDefectHandlingInfo(val).color}>
            {getDefectHandlingInfo(val).label}
          </Tag>
        ) : (
          <Tag color="default">待处理</Tag>
        ),
    },
    {
      title: '处理人',
      key: 'handler',
      width: 100,
      render: (_, record: DefectListItem) => record.handler?.name || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: DefectListItem) => (
        <Space size="small">
          {!record.handlingMethod && (
            <Button
              type="link"
              size="small"
              icon={<ToolOutlined />}
              onClick={() => setHandleTarget(record)}
              disabled={!hasPermission('quality:defect:handle')}
            >
              处理
            </Button>
          )}
          <Popconfirm
            title="确认删除"
            description="确定要删除该不良品记录吗？"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={!hasPermission('quality:defect:delete')}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!hasPermission('quality:defect:delete')}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ==================== 渲染 ====================

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索工单号/不良类型/原因"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
            onPressEnter={(e) =>
              handleSearch((e.target as HTMLInputElement).value)
            }
          />
          <Select
            placeholder="处理方式筛选"
            allowClear
            style={{ width: 130 }}
            options={HANDLING_OPTIONS}
            onChange={(v: DefectHandlingMethod | undefined) =>
              handleMethodFilter(v)
            }
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateVisible(true)}
            disabled={!hasPermission('quality:defect:create')}
          >
            登记不良品
          </Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.list || []}
        loading={isLoading}
        pagination={{
          current: data?.page || queryParams.page,
          pageSize: data?.pageSize || queryParams.pageSize,
          total: data?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          onChange: handlePageChange,
        }}
        scroll={{ x: 1200 }}
      />

      {/* 创建不良品弹窗 */}
      <DefectForm
        mode="create"
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['defects'] })
        }
      />

      {/* 处理不良品弹窗 */}
      <DefectForm
        mode="handle"
        defect={handleTarget}
        visible={!!handleTarget}
        onClose={() => setHandleTarget(null)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['defects'] })
        }
      />
    </div>
  );
}

export default DefectList;

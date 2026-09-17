/**
 * MES 系统 - 质量检验记录列表页面
 * 功能：检验记录列表（分页+搜索+筛选）、创建弹窗、删除、展开查看检验项明细
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
  Descriptions,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { InspectionResult } from '@/types';
import {
  getInspections,
  deleteInspection,
  type InspectionListItem,
  type InspectionQueryParams,
} from '@/api/quality.api';
import {
  formatDateTime,
  getInspectionResultInfo,
} from '@/utils/format';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants';
import { useAuthStore } from '@/stores/authStore';
import InspectionForm from './InspectionForm';

/** 检验类型映射 */
const INSPECTION_TYPE_MAP: Record<
  'first_article' | 'process' | 'final',
  { label: string; color: string }
> = {
  first_article: { label: '首件检验', color: 'blue' },
  process: { label: '过程检验', color: 'cyan' },
  final: { label: '成品检验', color: 'purple' },
};

/** 检验结果筛选选项 */
const RESULT_OPTIONS = [
  { label: '合格', value: 'pass' },
  { label: '不合格', value: 'fail' },
  { label: '让步接收', value: 'concession' },
];

/** 检验类型筛选选项 */
const TYPE_OPTIONS = [
  { label: '首件检验', value: 'first_article' },
  { label: '过程检验', value: 'process' },
  { label: '成品检验', value: 'final' },
];

/** 检验记录列表页面组件 */
function InspectionList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [queryParams, setQueryParams] = useState<InspectionQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
    result: undefined,
    inspectionType: undefined,
  });

  const [formVisible, setFormVisible] = useState(false);

  // ==================== 数据查询 ====================

  const { data, isLoading } = useQuery({
    queryKey: ['inspections', queryParams],
    queryFn: () => getInspections(queryParams),
  });

  // ==================== Mutation ====================

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteInspection(id),
    onSuccess: () => {
      message.success('删除检验记录成功');
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
    },
  });

  // ==================== 事件处理 ====================

  const handleSearch = useCallback((value: string) => {
    setQueryParams((prev) => ({ ...prev, page: 1, keyword: value }));
  }, []);

  const handleResultFilter = useCallback(
    (value: InspectionResult | undefined) => {
      setQueryParams((prev) => ({ ...prev, page: 1, result: value }));
    },
    [],
  );

  const handleTypeFilter = useCallback(
    (value: 'first_article' | 'process' | 'final' | undefined) => {
      setQueryParams((prev) => ({ ...prev, page: 1, inspectionType: value }));
    },
    [],
  );

  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      setQueryParams((prev) => ({ ...prev, page, pageSize }));
    },
    [],
  );

  // ==================== 展开行配置（检验项明细） ====================

  const expandConfig = {
    expandedRowRender: (record: InspectionListItem) => {
      if (!record.items || record.items.length === 0) {
        return <span style={{ color: '#8c8c8c' }}>暂无检验项明细</span>;
      }
      return (
        <Descriptions
          column={1}
          size="small"
          bordered
          items={record.items.map((item) => ({
            key: item.id,
            label: item.itemName,
            children: (
              <Space>
                <span>标准值: {item.standardValue} {item.unit}</span>
                <span>→</span>
                <span>实测值: {item.actualValue} {item.unit}</span>
                <Tag color={getInspectionResultInfo(item.result).color}>
                  {getInspectionResultInfo(item.result).label}
                </Tag>
              </Space>
            ),
          }))}
        />
      );
    },
  };

  // ==================== 表格列定义 ====================

  const columns: ColumnsType<InspectionListItem> = [
    {
      title: '检验时间',
      dataIndex: 'inspectionTime',
      key: 'inspectionTime',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: '工单号',
      key: 'orderNo',
      width: 140,
      render: (_, record: InspectionListItem) =>
        record.workOrder?.orderNo || '-',
    },
    {
      title: '产品名称',
      key: 'productName',
      width: 150,
      ellipsis: true,
      render: (_, record: InspectionListItem) =>
        record.workOrder?.productName || '-',
    },
    {
      title: '检验类型',
      dataIndex: 'inspectionType',
      key: 'inspectionType',
      width: 100,
      render: (val: 'first_article' | 'process' | 'final') => {
        const info = INSPECTION_TYPE_MAP[val] ?? { label: val, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '检验结果',
      dataIndex: 'result',
      key: 'result',
      width: 100,
      render: (val: InspectionResult) => {
        const info = getInspectionResultInfo(val);
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '检验项数',
      key: 'itemCount',
      width: 90,
      align: 'center',
      render: (_, record: InspectionListItem) => record.items?.length || 0,
    },
    {
      title: '检验员',
      key: 'inspector',
      width: 100,
      render: (_, record: InspectionListItem) =>
        record.inspector?.name || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: InspectionListItem) => (
        <Popconfirm
          title="确认删除"
          description={`确定要删除该检验记录吗？`}
          onConfirm={() => deleteMutation.mutate(record.id)}
          okText="确定"
          cancelText="取消"
          disabled={!hasPermission('quality:inspection:delete')}
        >
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!hasPermission('quality:inspection:delete')}
          >
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  // ==================== 渲染 ====================

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索工单号/产品名称"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 240 }}
            onPressEnter={(e) =>
              handleSearch((e.target as HTMLInputElement).value)
            }
          />
          <Select
            placeholder="检验结果筛选"
            allowClear
            style={{ width: 130 }}
            options={RESULT_OPTIONS}
            onChange={(v: InspectionResult | undefined) =>
              handleResultFilter(v)
            }
          />
          <Select
            placeholder="检验类型筛选"
            allowClear
            style={{ width: 130 }}
            options={TYPE_OPTIONS}
            onChange={(
              v: 'first_article' | 'process' | 'final' | undefined,
            ) => handleTypeFilter(v)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setFormVisible(true)}
            disabled={!hasPermission('quality:inspection:create')}
          >
            录入检验
          </Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.list || []}
        loading={isLoading}
        expandable={expandConfig}
        pagination={{
          current: data?.page || queryParams.page,
          pageSize: data?.pageSize || queryParams.pageSize,
          total: data?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          onChange: handlePageChange,
        }}
        scroll={{ x: 1000 }}
      />

      <InspectionForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ['inspections'] })
        }
      />
    </div>
  );
}

export default InspectionList;

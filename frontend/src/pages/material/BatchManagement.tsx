/**
 * MES 系统 - 物料批次管理页面【T09 实现，替换 T06 占位页】
 * 路由：/material/batches 菜单：物料管理
 * 功能：批次列表（物料/批次号/供应商/状态筛选）+ 新建/编辑/删除（batchNo 全局唯一 409）
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Select,
  Tag,
  App,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getBatches,
  deleteBatch,
  type BatchListItem,
  type BatchQueryParams,
} from '@/api/material.api';
import { BATCH_STATUS_MAP, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/utils/constants';
import { formatDate, formatNumber } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import type { BatchStatus } from '@/types';
import BatchFormModal from './BatchFormModal';

/** 物料批次管理页面组件 */
function BatchManagement() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  /** 列表查询参数 */
  const [queryParams, setQueryParams] = useState<BatchQueryParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  /** 筛选输入（未提交） */
  const [filterInput, setFilterInput] = useState<{ batchNo: string; supplier: string }>({
    batchNo: '',
    supplier: '',
  });
  /** 弹窗状态 */
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<BatchListItem | null>(null);

  // 批次列表查询
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['material-batches', queryParams],
    queryFn: () => getBatches(queryParams),
  });

  // 删除批次
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBatch(id),
    onSuccess: () => {
      message.success('删除批次成功');
      queryClient.invalidateQueries({ queryKey: ['material-batches'] });
    },
  });

  /** 提交筛选（重置到第一页） */
  const handleSearch = useCallback(() => {
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      batchNo: filterInput.batchNo.trim() || undefined,
      supplier: filterInput.supplier.trim() || undefined,
    }));
  }, [filterInput]);

  /** 重置筛选 */
  const handleReset = useCallback(() => {
    setFilterInput({ batchNo: '', supplier: '' });
    setQueryParams({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  }, []);

  /** 确认删除（二次确认） */
  const handleDelete = (record: BatchListItem) => {
    modal.confirm({
      title: '确认删除该批次？',
      content: `批次号：${record.batchNo}。删除批次档案不影响出入库流水，但追溯将无法补全供应商信息。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteMutation.mutateAsync(record.id),
    });
  };

  // 表格列定义
  const columns: ColumnsType<BatchListItem> = [
    {
      title: '批次号',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 150,
      ellipsis: true,
    },
    {
      title: '物料编码',
      key: 'materialCode',
      width: 120,
      render: (_, record) => record.material?.code ?? '-',
    },
    {
      title: '物料名称',
      key: 'materialName',
      width: 150,
      ellipsis: true,
      render: (_, record) =>
        record.material ? `${record.material.name}（${record.material.specification}）` : '-',
    },
    {
      title: '单位',
      key: 'unit',
      width: 60,
      align: 'center',
      render: (_, record) => record.material?.unit ?? '-',
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 140,
      ellipsis: true,
    },
    {
      title: '入库日期',
      dataIndex: 'receivedDate',
      key: 'receivedDate',
      width: 110,
      render: (val: string) => formatDate(val),
    },
    {
      title: '批次数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (val: number) => formatNumber(val, 2),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      align: 'center',
      render: (val: BatchStatus) => {
        const info = BATCH_STATUS_MAP[val] ?? { label: val, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            disabled={!hasPermission('material:batch:edit')}
            onClick={() => {
              setEditing(record);
              setFormVisible(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={!hasPermission('material:batch:delete')}
            loading={deleteMutation.isPending && deleteMutation.variables === record.id}
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
      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="批次号"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 180 }}
            value={filterInput.batchNo}
            onChange={(e) =>
              setFilterInput((prev) => ({ ...prev, batchNo: e.target.value }))
            }
            onPressEnter={handleSearch}
          />
          <Input
            placeholder="供应商"
            allowClear
            style={{ width: 160 }}
            value={filterInput.supplier}
            onChange={(e) =>
              setFilterInput((prev) => ({ ...prev, supplier: e.target.value }))
            }
            onPressEnter={handleSearch}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            value={queryParams.status}
            onChange={(value) =>
              setQueryParams((prev) => ({ ...prev, page: 1, status: value }))
            }
            options={(Object.keys(BATCH_STATUS_MAP) as BatchStatus[]).map(
              (value) => ({
                value,
                label: BATCH_STATUS_MAP[value].label,
              }),
            )}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            查询
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
          <Button
            type="primary"
            ghost
            icon={<PlusOutlined />}
            disabled={!hasPermission('material:batch:create')}
            onClick={() => {
              setEditing(null);
              setFormVisible(true);
            }}
          >
            新建批次
          </Button>
        </Space>
      </Card>

      {/* 批次列表 */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.list || []}
        loading={isLoading || isFetching}
        pagination={{
          current: data?.page || queryParams.page,
          pageSize: data?.pageSize || queryParams.pageSize,
          total: data?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          onChange: (page, pageSize) =>
            setQueryParams((prev) => ({ ...prev, page, pageSize })),
        }}
        scroll={{ x: 1150 }}
      />

      {/* 新建/编辑弹窗 */}
      <BatchFormModal
        visible={formVisible}
        editing={editing}
        onClose={() => setFormVisible(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

export default BatchManagement;

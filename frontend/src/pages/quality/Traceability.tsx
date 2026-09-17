/**
 * MES 系统 - 质量追溯页面【T09 实现】
 * 路由：/quality/traceability 菜单：质量管理
 * 功能：工单号 / 批次号双入口搜索 + 追溯链路展示（Steps + Descriptions + Table）
 * 支持 ?workOrderNo=xxx 带参跳入（P0 工单详情页「追溯入口」按钮的目标）
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Space,
  Input,
  Button,
  Radio,
  Typography,
  Spin,
  Alert,
} from 'antd';
import { SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { getTraceability } from '@/api/trace.api';
import TraceChainView from '@/components/trace/TraceChain';
import type { TraceabilityQueryParams } from '@/api/trace.api';

/** 追溯入口类型 */
type TraceMode = 'workOrder' | 'batch';

/** 已提交的查询状态（null 表示尚未发起查询） */
interface SubmittedQuery {
  mode: TraceMode;
  value: string;
}

/** 质量追溯页面组件 */
function Traceability() {
  const [searchParams] = useSearchParams();

  /** 输入框内容 */
  const [inputValue, setInputValue] = useState('');
  /** 入口类型（工单号 / 批次号） */
  const [mode, setMode] = useState<TraceMode>('workOrder');
  /** 已提交的查询（驱动 React Query） */
  const [submitted, setSubmitted] = useState<SubmittedQuery | null>(null);

  // 支持 ?workOrderNo= 带参跳入：初始化输入框并自动查询
  useEffect(() => {
    const workOrderNo = searchParams.get('workOrderNo');
    if (workOrderNo) {
      setMode('workOrder');
      setInputValue(workOrderNo);
      setSubmitted({ mode: 'workOrder', value: workOrderNo });
    }
  }, [searchParams]);

  // 追溯链路查询（仅在已提交时启用）
  const queryParams: TraceabilityQueryParams | null = submitted
    ? submitted.mode === 'workOrder'
      ? { workOrderNo: submitted.value }
      : { batchNo: submitted.value }
    : null;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['traceability', submitted?.mode, submitted?.value],
    queryFn: () => getTraceability(queryParams as TraceabilityQueryParams),
    enabled: queryParams !== null,
  });

  /** 发起搜索 */
  const handleSearch = () => {
    const value = inputValue.trim();
    if (!value) {
      return;
    }
    setSubmitted({ mode, value });
  };

  /** 重置 */
  const handleReset = () => {
    setInputValue('');
    setSubmitted(null);
  };

  /** 查询错误信息（后端 404：未找到工单/批次） */
  const errorMessage =
    isError && error instanceof Error ? error.message : '追溯查询失败';

  return (
    <div>
      {/* 搜索入口卡片：工单号 / 批次号 双入口 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value as TraceMode)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '按工单号', value: 'workOrder' },
              { label: '按批次号', value: 'batch' },
            ]}
          />
          <Input
            style={{ width: 280 }}
            placeholder={
              mode === 'workOrder'
                ? '请输入工单号，如 WO20260819001'
                : '请输入批次号，如 B20260801-001'
            }
            allowClear
            prefix={<SearchOutlined />}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleSearch}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            disabled={!inputValue.trim()}
          >
            追溯查询
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleReset}>
            重置
          </Button>
        </Space>
        <Typography.Text
          type="secondary"
          style={{ display: 'block', marginTop: 8 }}
        >
          追溯基于批次号精确匹配（MaterialBatch.batchNo ↔ 出入库流水.batchNo 字符串关联）；
          批次号入口将列出该批次流向的全部工单及其完整链路。
        </Typography.Text>
      </Card>

      {/* 查询结果 */}
      {!submitted ? (
        <Card>
          <Alert
            type="info"
            showIcon
            message="请输入工单号或批次号发起追溯查询"
            description="链路包含：领料批次 → 生产排程与设备 → 报工与人员 → 质量检验 → 不良处理 五段信息。"
          />
        </Card>
      ) : isLoading || isFetching ? (
        <Card>
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" tip="正在组装追溯链路...">
              <div style={{ height: 80 }} />
            </Spin>
          </div>
        </Card>
      ) : isError ? (
        <Card>
          <Alert type="error" showIcon message="追溯查询失败" description={errorMessage} />
        </Card>
      ) : data && data.entries.length > 0 ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {data.entries.map((chain) => (
            <Card key={chain.workOrder.id} title={`追溯链路 - ${chain.workOrder.orderNo}`}>
              <TraceChainView chain={chain} />
            </Card>
          ))}
        </Space>
      ) : (
        <Card>
          <Alert
            type="warning"
            showIcon
            message="该批次已建档但暂无领用记录"
            description="批次存在于批次档案中，但尚未发生任何出库领用，因此没有关联工单链路。"
          />
        </Card>
      )}

      {/* 手动刷新按钮（保持 queryClient 失效机制之外的用户主动刷新入口） */}
      {submitted && !isError && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button type="link" onClick={() => refetch()}>
            刷新链路数据
          </Button>
        </div>
      )}
    </div>
  );
}

export default Traceability;

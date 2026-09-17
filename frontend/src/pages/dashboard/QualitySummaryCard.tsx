/**
 * MES 系统 - 质量摘要卡片组件
 * 展示当日质量统计指标：总产量、不良数、不良率、合格率
 */

import { Card, Row, Col, Progress, Statistic, Empty } from 'antd';
import {
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { DashboardQualitySummary } from '@/types';

interface QualitySummaryCardProps {
  /** 质量摘要数据 */
  data: DashboardQualitySummary | undefined;
  /** 是否加载中 */
  loading: boolean;
}

/**
 * 质量摘要卡片组件
 */
function QualitySummaryCard({
  data,
  loading,
}: QualitySummaryCardProps) {
  const hasData = data && data.totalOutput + data.defectCount > 0;

  return (
    <Card
      title={
        <span>
          <SafetyCertificateOutlined style={{ marginRight: 8 }} />
          质量摘要
        </span>
      }
      loading={loading}
      bodyStyle={{ padding: '16px' }}
      style={{ height: '100%' }}
    >
      {!hasData && !loading ? (
        <Empty description="暂无质量数据" />
      ) : (
        <>
          {/* 统计指标 */}
          <Row gutter={[8, 16]}>
            <Col span={12}>
              <Statistic
                title="总产量"
                value={data?.totalOutput ?? 0}
                valueStyle={{ color: '#1890ff', fontSize: 24 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="不良数"
                value={data?.defectCount ?? 0}
                valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
                prefix={<WarningOutlined />}
              />
            </Col>
          </Row>

          {/* 合格率环形进度 */}
          <div
            style={{
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            <Progress
              type="circle"
              percent={data?.passRate ?? 0}
              size={120}
              strokeColor={{
                '0%': '#52c41a',
                '100%': '#1890ff',
              }}
              format={(percent) => (
                <div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>
                    {percent}%
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>合格率</div>
                </div>
              )}
            />
          </div>

          {/* 不良率文字提示 */}
          <div
            style={{
              textAlign: 'center',
              marginTop: 12,
              fontSize: 13,
              color: '#8c8c8c',
            }}
          >
            不良率：
            <span
              style={{
                color: (data?.defectRate ?? 0) > 5 ? '#ff4d4f' : '#52c41a',
                fontWeight: 'bold',
              }}
            >
              {data?.defectRate ?? 0}%
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export default QualitySummaryCard;

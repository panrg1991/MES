/**
 * MES 系统 - 产量趋势图组件
 * 使用 ECharts 折线图展示近N天的产量和不良数量趋势
 */

import { Card, Empty } from 'antd';
import LineChart from '@/components/charts/LineChart';
import type { EChartsOption } from 'echarts';
import type { DashboardOutputTrend } from '@/types';

interface OutputTrendChartProps {
  /** 产量趋势数据 */
  data: DashboardOutputTrend | undefined;
  /** 是否加载中 */
  loading: boolean;
}

/**
 * 根据趋势数据构建 ECharts 折线图配置
 */
function buildOption(data: DashboardOutputTrend | undefined): EChartsOption {
  if (!data || data.dates.length === 0) {
    return {} as EChartsOption;
  }

  return {
    title: {
      text: '产量趋势',
      left: 'left',
      textStyle: { fontSize: 14, fontWeight: 500 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      data: ['产量', '不良'],
      right: 0,
      top: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    toolbox: {
      feature: {
        saveAsImage: { title: '保存为图片' },
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.dates,
      axisLabel: {
        rotate: data.dates.length > 7 ? 30 : 0,
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
    },
    series: [
      {
        name: '产量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.outputs,
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24,144,255,0.3)' },
              { offset: 1, color: 'rgba(24,144,255,0.02)' },
            ],
          },
        },
      },
      {
        name: '不良',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.defects,
        itemStyle: { color: '#ff4d4f' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255,77,79,0.3)' },
              { offset: 1, color: 'rgba(255,77,79,0.02)' },
            ],
          },
        },
      },
    ],
  };
}

/**
 * 产量趋势图组件
 */
function OutputTrendChart({ data, loading }: OutputTrendChartProps) {
  const hasData = data && data.dates.length > 0;

  return (
    <Card loading={loading} bodyStyle={{ padding: '12px 16px' }}>
      {hasData ? (
        <LineChart option={buildOption(data)} height={280} />
      ) : (
        !loading && (
          <Empty
            description="暂无产量数据"
            style={{ height: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
          />
        )
      )}
    </Card>
  );
}

export default OutputTrendChart;

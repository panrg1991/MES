/**
 * MES 系统 - ECharts 仪表盘封装组件【T10 新增】
 * 用于 OEE 总值展示（P0 规划未实现，T10 补齐）。
 * value 为百分数（0~100）；null 时展示 '-'（对应 OEE 无数据口径，避免 NaN/Infinity）。
 */

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { CSSProperties } from 'react';

interface GaugeChartProps {
  /** 仪表盘数值（百分数 0~100；null 展示 '-'） */
  value: number | null;
  /** 仪表盘标题（显示在指针下方） */
  title?: string;
  /** 图表高度（数字为像素，字符串为 CSS 值） */
  height?: number | string;
  /** 是否显示加载动画 */
  loading?: boolean;
  /** 自定义样式 */
  style?: CSSProperties;
}

/**
 * 仪表盘组件
 * 基于 echarts-for-react 封装，自动响应窗口 resize
 */
function GaugeChart({
  value,
  title = '',
  height = 260,
  loading = false,
  style,
}: GaugeChartProps) {
  const hasValue = value !== null && Number.isFinite(value);

  /** OEE 分级配色（>=85 优秀 / >=60 良好 / <60 待改进） */
  const color = hasValue
    ? value >= 85
      ? '#52c41a'
      : value >= 60
        ? '#1677ff'
        : '#faad14'
    : '#d9d9d9';

  const option: EChartsOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        splitNumber: 10,
        itemStyle: { color },
        progress: { show: true, width: 14 },
        pointer: { show: hasValue, length: '60%', width: 5 },
        axisLine: { lineStyle: { width: 14, color: [[1, '#f0f0f0']] } },
        axisTick: { distance: -22, lineStyle: { color: '#d9d9d9' } },
        splitLine: {
          distance: -26,
          length: 12,
          lineStyle: { color: '#d9d9d9', width: 2 },
        },
        axisLabel: {
          distance: -34,
          color: '#8c8c8c',
          fontSize: 11,
          formatter: (val: number) => (val === 0 || val === 50 || val === 100 ? String(val) : ''),
        },
        title: {
          offsetCenter: [0, '88%'],
          fontSize: 13,
          color: '#595959',
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '55%'],
          fontSize: 26,
          fontWeight: 600,
          formatter: () => (hasValue ? `${(value as number).toFixed(2)}%` : '-'),
          color: '#262626',
        },
        data: [{ value: hasValue ? (value as number) : 0, name: title }],
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      showLoading={loading}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: '100%',
        ...style,
      }}
    />
  );
}

export default GaugeChart;

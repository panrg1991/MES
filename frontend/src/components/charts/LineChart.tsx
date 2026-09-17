/**
 * MES 系统 - ECharts 折线图封装组件
 * 通用折线图组件，接收 option prop，支持响应式 resize
 */

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { CSSProperties } from 'react';

interface LineChartProps {
  /** ECharts 配置项 */
  option: EChartsOption;
  /** 图表高度（数字为像素，字符串为 CSS 值） */
  height?: number | string;
  /** 是否显示加载动画 */
  loading?: boolean;
  /** 自定义样式 */
  style?: CSSProperties;
}

/**
 * 折线图组件
 * 基于 echarts-for-react 封装，自动响应窗口 resize
 */
function LineChart({
  option,
  height = 300,
  loading = false,
  style,
}: LineChartProps) {
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

export default LineChart;

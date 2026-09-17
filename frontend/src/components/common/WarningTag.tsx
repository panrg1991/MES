/**
 * MES 系统 - 库存预警等级标签组件
 * 统一展示 critical（严重缺料，红）/ warning（库存预警，橙）两档预警等级（P1-08）
 * 预警文案与颜色取自 WARNING_LEVEL_MAP，与后端 evaluateWarning 口径配套
 */

import { Tag } from 'antd';
import type { WarningLevel } from '@/types';
import { WARNING_LEVEL_MAP } from '@/utils/constants';

interface WarningTagProps {
  /** 预警等级（后端 evaluateWarning 派生字段） */
  level: WarningLevel;
}

/** 预警等级标签 */
function WarningTag({ level }: WarningTagProps) {
  const info = WARNING_LEVEL_MAP[level] ?? { label: level, color: 'default' };
  return <Tag color={info.color}>{info.label}</Tag>;
}

export default WarningTag;

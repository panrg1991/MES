/**
 * MES 系统 - 排班日历组件（P1-09，T08）
 * antd Calendar + cellRender 自定义渲染（零新依赖，决策 D3）：
 * 日期单元格内以 Tag 列出当班人员，超 3 人折叠为「+N」。
 */

import { useMemo } from 'react';
import { Calendar, Tag, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import type { ScheduleCalendarCell } from '@/types';

/** 单元格最多展示的排班 Tag 数（超出折叠 +N） */
const MAX_TAGS = 3;

/** 排班条目（ScheduleCalendarCell.items 元素） */
type CalendarItem = ScheduleCalendarCell['items'][number];

interface ScheduleCalendarProps {
  /** 当前展示月份（受控） */
  month: Dayjs;
  /** 月份变化回调（父组件重新拉取矩阵） */
  onMonthChange: (month: Dayjs) => void;
  /** 日历矩阵数据（后端 /schedules/calendar 返回） */
  matrix: ScheduleCalendarCell[];
  /** 点击日期回调 */
  onDateSelect: (date: Dayjs) => void;
}

/**
 * 排班日历组件
 */
function ScheduleCalendar({
  month,
  onMonthChange,
  matrix,
  onDateSelect,
}: ScheduleCalendarProps) {
  /** date -> items 映射 */
  const cellMap = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const cell of matrix) {
      map.set(cell.date, cell.items);
    }
    return map;
  }, [matrix]);

  /** 日期单元格渲染：当班人员 Tag 列表，超 3 人折叠 */
  const renderDateCell = (current: Dayjs) => {
    const key = current.format('YYYY-MM-DD');
    const items = cellMap.get(key) ?? [];
    if (items.length === 0) {
      return null;
    }
    const visible = items.slice(0, MAX_TAGS);
    const restCount = items.length - visible.length;

    return (
      <Tooltip
        title={items
          .map((item) => `${item.userName}（${item.shiftName} ${item.shiftTimeRange}）`)
          .join('\n')}
      >
        <div style={{ lineHeight: 1.6 }}>
          {visible.map((item) => (
            <Tag
              key={item.id}
              color="blue"
              style={{ marginInlineEnd: 2, fontSize: 12, lineHeight: '18px' }}
            >
              {item.userName}·{item.shiftName}
            </Tag>
          ))}
          {restCount > 0 && (
            <Tag style={{ fontSize: 12, lineHeight: '18px' }}>+{restCount}</Tag>
          )}
        </div>
      </Tooltip>
    );
  };

  return (
    <Calendar
      value={month}
      onSelect={(date: Dayjs) => onDateSelect(date)}
      onPanelChange={(value: Dayjs) => onMonthChange(value)}
      cellRender={(current, info) => {
        if (info.type === 'date') {
          return renderDateCell(current);
        }
        return info.originNode;
      }}
    />
  );
}

export default ScheduleCalendar;

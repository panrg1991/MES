/**
 * MES 系统 - 自绘轻量甘特图组件（P1-01，T08）
 *
 * 架构文档 §8.5 数据结构与交互约定：
 *  ① left% = (start - viewStart) / totalMs，width% = (end - start) / totalMs，行高 36px
 *  ② 拖拽 deltaMs = dxPx / containerWidth × totalMs，释放前 snapToHour（整点对齐）
 *  ③ 拖拽中逐帧本地预判同设备重叠 → 实时红色 + tooltip「与工单 XX 冲突」；冲突时不提交、回弹
 *  ④ 提交 PATCH 失败（409）同样回弹并展示后端冲突明细（message 由 axios 拦截器统一弹出）
 *  ⑤ 刻度：天为主刻度（竖线加粗 + 日期标签）、8 小时为次刻度；条块右上角显示 orderNo
 *  ⑥ 端点相接（newStart == otherEnd）不冲突；cancelled / completed 不参与冲突检测与拖拽
 *
 * 明确能力边界（P1 决策 D1）：不支持依赖关系与关键路径、不支持多视图切换（仅天为主刻度）
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Empty, Tooltip } from 'antd';
import dayjs from 'dayjs';
import type { GanttRow, GanttTask } from '@/types';
import { GANTT_BAR_COLOR_MAP } from '@/utils/constants';
import { formatDateTime } from '@/utils/format';

/** 左侧设备标签列宽度（px） */
const LABEL_WIDTH = 140;
/** 行高（px，架构文档约定） */
const ROW_HEIGHT = 36;
/** 条块高度（px） */
const BAR_HEIGHT = 24;
/** 一小时的毫秒数 */
const HOUR_MS = 60 * 60 * 1000;
/** 次刻度间隔：8 小时 */
const MINOR_TICK_MS = 8 * HOUR_MS;

/** 甘特图组件 Props（架构文档 §8.5 契约） */
export interface SimpleGanttProps {
  /** 时间轴起点 */
  viewStart: Date;
  /** 时间轴终点 */
  viewEnd: Date;
  /** 设备行（每行含该设备的排程条块） */
  rows: GanttRow[];
  /** 拖拽提交（父组件调 PATCH；失败抛错 → 条块回弹） */
  onTaskMove: (id: number, start: Date, end: Date) => Promise<void>;
  /** 条块点击（父组件打开详情/操作弹窗） */
  onTaskClick?: (task: GanttTask) => void;
}

/** 拖拽预览状态（渲染时覆盖对应条块的时间） */
interface DragPreview {
  taskId: number;
  startMs: number;
  endMs: number;
  /** 本地预判到的冲突任务（实时红色高亮） */
  conflictWith: GanttTask | null;
}

/** 拖拽上下文（存 ref，避免 stale closure） */
interface DragContext {
  taskId: number;
  mode: 'move' | 'resize-end';
  startX: number;
  origStartMs: number;
  origEndMs: number;
  /** 拖拽保持的时长（ms，move 模式） */
  durationMs: number;
  /** 同行其他任务（本地冲突预判范围） */
  rowTasks: GanttTask[];
}

/**
 * 本地冲突预判：同设备区间重叠即冲突（端点相接不算冲突）
 * @param tasks - 同行任务列表
 * @param excludeId - 拖拽中的任务 ID
 * @param startMs - 新开始时间（ms）
 * @param endMs - 新结束时间（ms）
 * @returns 冲突任务（无冲突返回 null）
 */
function detectConflict(
  tasks: GanttTask[],
  excludeId: number,
  startMs: number,
  endMs: number,
): GanttTask | null {
  return (
    tasks.find((task) => {
      if (task.id === excludeId || task.status === 'cancelled') {
        return false;
      }
      const otherStart = new Date(task.plannedStart).getTime();
      const otherEnd = new Date(task.plannedEnd).getTime();
      return startMs < otherEnd && otherStart < endMs;
    }) ?? null
  );
}

/**
 * 自绘轻量甘特图组件
 */
function SimpleGantt({ viewStart, viewEnd, rows, onTaskMove, onTaskClick }: SimpleGanttProps) {
  /** 时间轴区域 DOM（测量宽度用） */
  const timelineRef = useRef<HTMLDivElement | null>(null);
  /** 时间轴区域宽度（px） */
  const [timelineWidth, setTimelineWidth] = useState(0);
  /** 拖拽上下文（ref） */
  const dragRef = useRef<DragContext | null>(null);
  /** 拖拽预览（渲染态） */
  const [preview, setPreview] = useState<DragPreview | null>(null);
  /** 预览镜像（供事件监听器读取最新值，避免 stale closure） */
  const previewRef = useRef<DragPreview | null>(null);
  /** 提交中（防止重复提交） */
  const [committing, setCommitting] = useState(false);

  /** 同步更新预览 state 与 ref */
  const applyPreview = useCallback((next: DragPreview | null) => {
    previewRef.current = next;
    setPreview(next);
  }, []);

  // ==================== 时间轴度量 ====================

  useEffect(() => {
    const element = timelineRef.current;
    if (!element) {
      return undefined;
    }
    const updateWidth = () => setTimelineWidth(element.getBoundingClientRect().width);
    updateWidth();

    // 监听容器尺寸变化（侧边栏折叠 / 窗口缩放）
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** 时间轴总跨度（ms） */
  const totalMs = useMemo(
    () => Math.max(viewEnd.getTime() - viewStart.getTime(), HOUR_MS),
    [viewStart, viewEnd],
  );

  /** 百分比 → 时间换算系数（ms / px） */
  const msPerPx = totalMs / Math.max(timelineWidth, 1);

  /** 主刻度（天）：从 viewStart 所在日的 00:00 开始 */
  const dayTicks = useMemo(() => {
    const ticks: Array<{ time: number; label: string }> = [];
    let cursor = dayjs(viewStart).startOf('day');
    const end = dayjs(viewEnd);
    while (cursor.isBefore(end) || cursor.isSame(end)) {
      ticks.push({
        time: cursor.valueOf(),
        label: cursor.format('MM-DD ddd'),
      });
      cursor = cursor.add(1, 'day');
    }
    return ticks;
  }, [viewStart, viewEnd]);

  /** 次刻度（8 小时） */
  const minorTicks = useMemo(() => {
    const ticks: number[] = [];
    const viewStartMs = viewStart.getTime();
    const count = Math.floor(totalMs / MINOR_TICK_MS);
    for (let i = 0; i <= count; i += 1) {
      ticks.push(viewStartMs + i * MINOR_TICK_MS);
    }
    return ticks;
  }, [viewStart, totalMs]);

  /** 时间 → 百分比 */
  const toPercent = useCallback(
    (timeMs: number) => ((timeMs - viewStart.getTime()) / totalMs) * 100,
    [viewStart, totalMs],
  );

  // ==================== 拖拽实现（pointer events + setPointerCapture） ====================

  /** 拖拽中逐帧计算预览位置（pointermove 监听器内调用） */
  const updatePreview = useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      // 百分比 ↔ 时间换算：deltaMs = dxPx / containerWidth × totalMs
      const deltaMs = (clientX - drag.startX) * msPerPx;

      let nextStartMs: number;
      let nextEndMs: number;

      if (drag.mode === 'move') {
        // 整体移动：保持时长，snapToHour
        nextStartMs = Math.round((drag.origStartMs + deltaMs) / HOUR_MS) * HOUR_MS;
        nextEndMs = nextStartMs + drag.durationMs;
      } else {
        // 拖右端缩放：仅调整结束时间，snapToHour
        nextEndMs = Math.round((drag.origEndMs + deltaMs) / HOUR_MS) * HOUR_MS;
        nextStartMs = drag.origStartMs;
      }

      // 约束在时间轴范围内，且最短 1 小时
      const viewStartMs = viewStart.getTime();
      const viewEndMs = viewEnd.getTime();
      if (nextStartMs < viewStartMs) {
        nextStartMs = viewStartMs;
        if (drag.mode === 'move') {
          nextEndMs = nextStartMs + drag.durationMs;
        }
      }
      if (nextEndMs > viewEndMs) {
        nextEndMs = viewEndMs;
        if (drag.mode === 'move') {
          nextStartMs = nextEndMs - drag.durationMs;
        }
      }
      if (nextEndMs - nextStartMs < HOUR_MS) {
        nextEndMs = nextStartMs + HOUR_MS;
      }

      // 本地冲突预判（同设备重叠 → 红色，提交被拦截）
      const conflictWith = detectConflict(drag.rowTasks, drag.taskId, nextStartMs, nextEndMs);
      applyPreview({ taskId: drag.taskId, startMs: nextStartMs, endMs: nextEndMs, conflictWith });
    },
    [msPerPx, viewStart, viewEnd, applyPreview],
  );

  /** 拖拽提交：无本地冲突才调用 onTaskMove；失败回弹（清除预览即恢复 props 数据） */
  const commitDrag = useCallback(async () => {
    const drag = dragRef.current;
    const current = previewRef.current;
    if (!drag || !current) {
      return;
    }
    // 本地预判到冲突：不提交，回弹原位
    if (current.conflictWith) {
      dragRef.current = null;
      applyPreview(null);
      return;
    }
    // 提交（预览保留到 Promise 落定，避免闪烁；失败回弹）
    setCommitting(true);
    try {
      await onTaskMove(drag.taskId, new Date(current.startMs), new Date(current.endMs));
    } catch {
      // PATCH 失败（含 409）：回弹。错误 message 已由 axios 拦截器统一弹出
    } finally {
      dragRef.current = null;
      setCommitting(false);
      applyPreview(null);
    }
  }, [onTaskMove, applyPreview]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (dragRef.current) {
        updatePreview(event.clientX);
      }
    };
    const handleUp = () => {
      if (dragRef.current) {
        void commitDrag();
      }
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [updatePreview, commitDrag]);

  /** 条块 pointerdown：进入拖拽（move 或 resize-end 模式） */
  const handleBarPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    task: GanttTask,
    rowTasks: GanttTask[],
    mode: 'move' | 'resize-end',
  ) => {
    // 已完成/已取消的排程不可拖拽
    if (task.status === 'completed' || task.status === 'cancelled') {
      return;
    }
    if (committing || dragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const origStartMs = new Date(task.plannedStart).getTime();
    const origEndMs = new Date(task.plannedEnd).getTime();
    dragRef.current = {
      taskId: task.id,
      mode,
      startX: event.clientX,
      origStartMs,
      origEndMs,
      durationMs: origEndMs - origStartMs,
      rowTasks,
    };
    applyPreview({ taskId: task.id, startMs: origStartMs, endMs: origEndMs, conflictWith: null });
  };

  // ==================== 渲染 ====================

  if (rows.length === 0) {
    return (
      <div style={{ padding: '60px 0' }}>
        <Empty description="当前筛选条件下暂无排程" />
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
      {/* 时间轴表头：天为主刻度 + 8 小时次刻度 */}
      <div style={{ display: 'flex', background: '#fafafa' }}>
        <div
          style={{
            width: LABEL_WIDTH,
            flexShrink: 0,
            padding: '8px 12px',
            fontWeight: 600,
            fontSize: 12,
            color: '#8c8c8c',
          }}
        >
          设备
        </div>
        <div
          ref={timelineRef}
          style={{ flex: 1, position: 'relative', height: 44, minWidth: 0 }}
        >
          {/* 次刻度线（8 小时） */}
          {minorTicks.map((tick) => (
            <div
              key={`minor-${tick}`}
              style={{
                position: 'absolute',
                left: `${toPercent(tick)}%`,
                top: 24,
                bottom: 0,
                width: 1,
                background: '#f0f0f0',
              }}
            />
          ))}
          {/* 主刻度（天）：竖线加粗 + 日期标签 */}
          {dayTicks.map((tick) => (
            <div
              key={`major-${tick.time}`}
              style={{
                position: 'absolute',
                left: `${toPercent(tick.time)}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: '#d9d9d9',
                zIndex: 1,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  fontSize: 12,
                  color: '#595959',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {tick.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 设备行 + 排程条块 */}
      {rows.map((row) => (
        <div
          key={row.equipmentId}
          style={{ display: 'flex', borderTop: '1px solid #f0f0f0' }}
        >
          {/* 左侧设备标签 */}
          <div
            style={{
              width: LABEL_WIDTH,
              flexShrink: 0,
              height: ROW_HEIGHT,
              lineHeight: `${ROW_HEIGHT}px`,
              padding: '0 12px',
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              borderRight: '1px solid #f0f0f0',
            }}
            title={row.label}
          >
            {row.label}
          </div>

          {/* 时间轴条块区域 */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              height: ROW_HEIGHT,
              minWidth: 0,
            }}
          >
            {row.tasks.map((task) => {
              // 拖拽中的条块使用预览时间
              const isDragging = preview?.taskId === task.id;
              const startMs = isDragging ? preview.startMs : new Date(task.plannedStart).getTime();
              const endMs = isDragging ? preview.endMs : new Date(task.plannedEnd).getTime();
              const conflictTask = isDragging ? preview.conflictWith : null;
              // 静态冲突高亮（后端 409 返回的冲突对 / 父组件传入 conflicts）
              const hasStaticConflict = (task.conflicts?.length ?? 0) > 0;

              const leftPercent = Math.max(toPercent(startMs), 0);
              const widthPercent = Math.max(((endMs - startMs) / totalMs) * 100, 0.5);
              const backgroundColor = conflictTask
                ? '#ff4d4f'
                : hasStaticConflict
                  ? '#ffa39e'
                  : GANTT_BAR_COLOR_MAP[task.status];
              const isDraggable =
                task.status === 'planned' || task.status === 'in_progress';

              const tooltipTitle = (
                <div style={{ whiteSpace: 'pre-line' }}>
                  {`${task.orderNo} · ${task.productName}\n${formatDateTime(new Date(startMs))} ~ ${formatDateTime(new Date(endMs))}\n状态：${task.status}`}
                  {conflictTask
                    ? `\n⚠ 与工单 ${conflictTask.orderNo} 排程冲突（不可提交）`
                    : hasStaticConflict
                      ? '\n⚠ 存在排程冲突'
                      : ''}
                </div>
              );

              return (
                <Tooltip key={task.id} title={tooltipTitle}>
                  <div
                    role="button"
                    tabIndex={0}
                    style={{
                      position: 'absolute',
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                      top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                      height: BAR_HEIGHT,
                      backgroundColor,
                      borderRadius: 4,
                      opacity: task.status === 'cancelled' ? 0.6 : 1,
                      cursor: isDraggable ? (conflictTask ? 'not-allowed' : 'grab') : 'default',
                      zIndex: isDragging ? 10 : 1,
                      boxShadow: isDragging ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 6px',
                      overflow: 'hidden',
                      userSelect: 'none',
                      touchAction: 'none',
                    }}
                    onPointerDown={(event) => handleBarPointerDown(event, task, row.tasks, 'move')}
                    onClick={() => onTaskClick?.(task)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        onTaskClick?.(task);
                      }
                    }}
                  >
                    {/* 产品名（左侧，空间足够时显示） */}
                    {widthPercent > 12 && (
                      <span
                        style={{
                          fontSize: 11,
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {task.productName}
                      </span>
                    )}
                    {/* 工单号（右上角，架构文档约定） */}
                    <span
                      style={{
                        fontSize: 11,
                        color: '#fff',
                        marginLeft: 'auto',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.orderNo}
                    </span>
                    {/* 右端缩放手柄 */}
                    {isDraggable && (
                      <span
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: 8,
                          cursor: 'ew-resize',
                          touchAction: 'none',
                        }}
                        onPointerDown={(event) =>
                          handleBarPointerDown(event, task, row.tasks, 'resize-end')
                        }
                      />
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default SimpleGantt;

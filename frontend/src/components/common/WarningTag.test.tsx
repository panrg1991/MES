/**
 * 组件测试：src/components/common/WarningTag.tsx
 * ---------------------------------------------------------------------------
 * 示例性组件测试，验证 Testing Library 链路可用，并锁定预警等级的展示口径
 * （与后端 evaluateWarning 派生字段配套，文案/颜色不可随意改动）。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WarningTag from './WarningTag';
import { WARNING_LEVEL_MAP } from '@/utils/constants';

describe('WarningTag', () => {
  it('critical 等级展示「严重缺料」', () => {
    render(<WarningTag level="critical" />);

    const tag = screen.getByText('严重缺料');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveClass('ant-tag');
  });

  it('warning 等级展示「库存预警」', () => {
    render(<WarningTag level="warning" />);

    expect(screen.getByText('库存预警')).toBeInTheDocument();
  });

  it('文案与颜色取自 WARNING_LEVEL_MAP（单一数据源）', () => {
    render(<WarningTag level="critical" />);

    const tag = screen.getByText(WARNING_LEVEL_MAP.critical.label);
    // antd 依据 color 生成 ant-tag-<color> 类名
    expect(tag.className).toContain('ant-tag-error');
  });

  it('未知等级退化为原样展示且不抛错', () => {
    render(<WarningTag level={'unknown' as never} />);

    expect(screen.getByText('unknown')).toBeInTheDocument();
  });
});

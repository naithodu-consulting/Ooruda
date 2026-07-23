import type { TooltipProps } from 'recharts';
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';

// Re-exported for use in all chart tabs as the `content` prop of <Tooltip>.
// Renders inside the React tree so Tailwind CSS vars resolve correctly.
export type ChartTooltipProps = TooltipProps<ValueType, NameType>;

// Shared contentStyle for tabs that still use the default Recharts tooltip —
// Recharts inline styles can't use CSS vars, so we keep neutral grays.
// Prefer using the ChartTooltip component below for full theme support.
export const TOOLTIP_STYLE = {
  contentStyle: {
    fontSize: 12,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    color: '#111827',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    padding: '8px 12px',
  } as React.CSSProperties,
  labelStyle: {
    fontWeight: 700,
    fontSize: 12,
    color: '#374151',
    marginBottom: 4,
  } as React.CSSProperties,
  itemStyle: {
    fontSize: 12,
    color: '#374151',
    padding: '1px 0',
    fontWeight: 500,
  } as React.CSSProperties,
};

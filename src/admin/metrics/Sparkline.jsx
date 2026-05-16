import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { chartTokens } from "./chartTokens";

// Tiny inline trend chart used inside KPI cards. Renders into whatever space
// it's given (height via prop, width: 100% via ResponsiveContainer). No axes,
// no tooltips -- just the shape of the trend.
export function Sparkline({ data, dataKey = "y", color, height = 36, fill }) {
  const t = chartTokens();
  const stroke = color || t.ink;
  const safeData = Array.isArray(data) && data.length ? data : [{ y: 0 }, { y: 0 }];
  const fillColor = fill || stroke;
  return (
    <div className="km-sparkline" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={safeData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`spark-${stroke.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} stopOpacity={0.32} />
              <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#spark-${stroke.replace(/[^a-z0-9]/gi, "")})`}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

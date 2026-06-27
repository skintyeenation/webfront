'use client';

// Governance hierarchy — a top-down org chart with smooth (cubic-bezier)
// connectors, mirroring the app's DeviceNetworkMap (d3 linkVertical) style.
//   Chief  →  Councillors + Band Manager  →  IT + Management
interface Person {
  _id: string;
  name: string;
  role?: string;
  title?: string;
  avatarLetter?: string;
}

const R = 26; // node radius
const ROW_H = 132; // vertical gap between levels
const NODE_W = 132; // horizontal slot per node
const PAD = 28;
const LABEL_H = 78;

const ROLE_COLOR: Record<string, string> = {
  Chief: '#00B8EC',
  Council: '#7E57C2',
  'Band Manager': '#EC6A37',
  IT: '#5C6BC0',
  Management: '#9ECD3B',
  Staff: '#90A4AE',
};
const colorFor = (role?: string) => ROLE_COLOR[role ?? ''] ?? '#90A4AE';
const initialsOf = (p: Person) =>
  (p.avatarLetter ??
    (p.name || '?')
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join('')).toUpperCase();

// Smooth vertical link (same shape as d3-shape linkVertical).
const linkPath = (sx: number, sy: number, tx: number, ty: number) => {
  const my = (sy + ty) / 2;
  return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
};

export function GovernanceOrgChart({ roster }: { roster: Person[] }) {
  const chief =
    roster.find((p) => p.role === 'Chief' && !/^skin tyee/i.test(p.name)) ??
    roster.find((p) => p.role === 'Chief');
  const councillors = roster.filter((p) => p.role === 'Council');
  const it = roster.find((p) => p.role === 'IT');
  const bandManager = roster.find((p) => p.role === 'Band Manager');
  const management = roster.filter((p) => p.role === 'Management');

  const row1 = [...councillors, ...(bandManager ? [bandManager] : [])];
  const row2 = [...(it ? [it] : []), ...management];

  if (!chief) return null;

  const cols = Math.max(row1.length, row2.length, 3);
  const W = cols * NODE_W + PAD * 2;
  const H = PAD + R + ROW_H * 2 + LABEL_H;

  const xFor = (i: number, n: number) =>
    n <= 1 ? W / 2 : PAD + NODE_W / 2 + (W - PAD * 2 - NODE_W) * (i / (n - 1));

  const chiefX = W / 2;
  const chiefY = PAD + R;
  const y1 = chiefY + ROW_H;
  const y2 = y1 + ROW_H;
  const bmX = bandManager ? xFor(row1.length - 1, row1.length) : chiefX;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[#f7fafb] p-4">
      <svg width={W} height={H} role="img" aria-label="Governance hierarchy">
        {/* Chief -> row 1 */}
        {row1.map((p, i) => (
          <path
            key={`e1-${p._id}`}
            d={linkPath(chiefX, chiefY + R, xFor(i, row1.length), y1 - R)}
            fill="none"
            stroke="#c4d2d6"
            strokeWidth={2}
          />
        ))}
        {/* Band Manager -> row 2 */}
        {bandManager &&
          row2.map((p, i) => (
            <path
              key={`e2-${p._id}`}
              d={linkPath(bmX, y1 + R, xFor(i, row2.length), y2 - R)}
              fill="none"
              stroke="#c4d2d6"
              strokeWidth={2}
            />
          ))}

        <OrgNode x={chiefX} y={chiefY} p={chief} />
        {row1.map((p, i) => (
          <OrgNode key={p._id} x={xFor(i, row1.length)} y={y1} p={p} />
        ))}
        {row2.map((p, i) => (
          <OrgNode key={p._id} x={xFor(i, row2.length)} y={y2} p={p} />
        ))}
      </svg>
    </div>
  );
}

function OrgNode({ x, y, p }: { x: number; y: number; p: Person }) {
  const color = colorFor(p.role);
  const first = (p.name || '').split(/\s+/)[0];
  const last = (p.name || '').split(/\s+/).slice(1).join(' ');
  return (
    <g>
      <circle cx={x} cy={y} r={R} fill="#fff" stroke={color} strokeWidth={3} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={700} fill={color}>
        {initialsOf(p)}
      </text>
      <text x={x} y={y + R + 15} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#1d1d1d">
        {first}
      </text>
      {last && (
        <text x={x} y={y + R + 29} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#1d1d1d">
          {last}
        </text>
      )}
      <text x={x} y={y + R + (last ? 44 : 30)} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>
        {p.role}
      </text>
    </g>
  );
}

'use client';

import { LODGING_PLACE_COLORS, type LodgingBuilding, type LodgingPlaceView } from '@smis-mentor/shared';

interface Props {
  building: LodgingBuilding;
  places: LodgingPlaceView[];
  selected?: string | null;
  onPlace: (id: string) => void;
}

/** 지하 1층 — 배치도 좌표 그대로 SVG 로 그린다 */
export default function LodgingB1Map({ building, places, selected, onPlace }: Props) {
  const [vx, vy, vw, vh] = building.b1.viewBox;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-3">
      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        className="h-auto w-full min-w-[640px]"
        role="img"
        aria-label="지하 1층 배치도"
      >
        <text x={vx + vw - 40} y={vy + 50} textAnchor="end" className="fill-gray-400" fontSize={22} fontWeight={700}>
          지하 1층
        </text>
        {building.b1.gray.map(([x0, y0, x1, y1], i) => (
          <rect key={i} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#E4E4E1" stroke="#C8CDD3" />
        ))}
        {places.map((p) => {
          const [x0, y0, x1, y1] = p.box;
          const c = LODGING_PLACE_COLORS[p.kind] ?? LODGING_PLACE_COLORS.etc;
          const cx = (x0 + x1) / 2;
          const cy = (y0 + y1) / 2;
          const narrow = x1 - x0 < 60;
          const small = x1 - x0 < 110;
          const on = selected === p.id;
          const title = p.purpose ? `${p.name} · ${p.purpose}` : p.name;
          return (
            <g key={p.id} className="cursor-pointer" onClick={() => onPlace(p.id)}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={y1 - y0}
                rx={3}
                fill={c.bg}
                stroke={on ? '#2563eb' : 'rgba(0,0,0,.18)'}
                strokeWidth={on ? 4 : 1}
              />
              {narrow ? (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(-90 ${cx} ${cy})`}
                  fontSize={11}
                  fill={c.ink}
                >
                  {p.name}
                </text>
              ) : (
                <>
                  <text
                    x={cx}
                    y={p.cap ? cy - 8 : cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={small ? 9 : 14}
                    fontWeight={600}
                    fill={c.ink}
                  >
                    {title}
                  </text>
                  {p.cap && (
                    <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill={c.ink} opacity={0.7}>
                      {p.area}㎡ / {p.cap}명
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

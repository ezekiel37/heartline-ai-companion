import { useId } from "react";
import { CATALOG_BY_ID, type CatalogItem } from "@/lib/avatar/catalog";
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES, type AvatarConfig } from "@/lib/avatar/config";

// Layered 2D avatar drawn entirely in SVG. Back-to-front:
// background → hair (back) → body → bottoms → shoes → top/dress →
// necklace → head & face → hair (front) → earrings/glasses → headwear.
// If a slot is empty the figure gets neutral basics, so it is always clothed.

const CX = 100;
const BODY: Record<AvatarConfig["bodyType"], { s: number; w: number; h: number }> = {
  slim: { s: 33, w: 23, h: 27 },
  average: { s: 37, w: 29, h: 32 },
  curvy: { s: 35, w: 26, h: 39 },
  athletic: { s: 43, w: 30, h: 31 },
};

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function torsoPath(b: { s: number; w: number; h: number }, bottom: number) {
  const { s, w, h } = b;
  const hipY = Math.min(bottom, 205);
  const hip = bottom > 190 ? w + ((h - w) * (hipY - 185)) / 20 : w;
  return `M ${CX - s} 124 Q ${CX - s} 115 ${CX - s + 8} 115 L ${CX + s - 8} 115 Q ${CX + s} 115 ${CX + s} 124 L ${CX + w} 185 L ${CX + hip} ${bottom} L ${CX - hip} ${bottom} L ${CX - w} 185 Z`;
}

// Zoomed views: "head" for chat, "upper" and "feet" so small items
// (necklaces, glasses, headwear, shoes) are visible in the shop.
const CROPS = {
  full: [0, 0, 200, 320],
  head: [45, 0, 110, 110],
  upper: [35, 0, 130, 150],
  feet: [50, 258, 100, 54],
} as const;
export type AvatarCrop = keyof typeof CROPS;

export function Avatar({
  config,
  size = 200,
  className,
  crop = "full",
}: {
  config: AvatarConfig;
  size?: number;
  className?: string;
  crop?: AvatarCrop;
}) {
  const uid = useId().replace(/:/g, "");
  const skin = SKIN_TONES[config.skinTone];
  const hair = HAIR_COLORS[config.hairColor];
  const eye = EYE_COLORS[config.eyeColor];
  const body = BODY[config.bodyType];
  const item = (slot: keyof AvatarConfig["outfit"]) => {
    const id = config.outfit[slot];
    return id ? CATALOG_BY_ID.get(id) : undefined;
  };
  const dress = item("dress");
  const top = dress ? undefined : item("top");
  const bottom = dress ? undefined : item("bottom");
  const shoes = item("shoes");
  const accessory = item("accessory");
  const headwear = item("headwear");
  const legX = body.h / 2 + 2;
  const armX = body.s + 6;

  const fill = (i: CatalogItem) => (i.pattern ? `url(#${uid}-${i.id})` : i.color);

  return (
    <svg
      viewBox={CROPS[crop].join(" ")}
      width={size}
      height={(size * CROPS[crop][3]) / CROPS[crop][2]}
      className={className}
      role="img"
      aria-label="Your partner's avatar"
    >
      <defs>
        {[dress, top, bottom].filter((i): i is CatalogItem => !!i?.pattern).map((i) => (
          <pattern key={i.id} id={`${uid}-${i.id}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill={i.color} />
            <circle cx="4" cy="4" r="3" fill={i.accent ?? "#fff"} />
            <circle cx="12" cy="12" r="3" fill={i.accent ?? "#fff"} />
            <path d="M12 1 L15 4 L12 7 L9 4 Z" fill={shade(i.color, 60)} />
            <path d="M4 9 L7 12 L4 15 L1 12 Z" fill={shade(i.color, 60)} />
          </pattern>
        ))}
      </defs>

      <rect x={2} y={2} width={196} height={316} rx={28} fill="var(--accent-soft, #fde8ef)" />

      <HairBack style={config.hairStyle} color={hair} />

      {/* Body */}
      <g stroke={skin} strokeLinecap="round" fill="none">
        <line x1={CX - legX} y1={205} x2={CX - legX} y2={292} strokeWidth={15} />
        <line x1={CX + legX} y1={205} x2={CX + legX} y2={292} strokeWidth={15} />
        <line x1={CX - body.s + 4} y1={124} x2={CX - armX} y2={212} strokeWidth={13} />
        <line x1={CX + body.s - 4} y1={124} x2={CX + armX} y2={212} strokeWidth={13} />
      </g>
      <rect x={CX - 8} y={96} width={16} height={24} rx={6} fill={shade(skin, -12)} />
      <path d={torsoPath(body, 205)} fill={skin} />

      {/* Bottoms */}
      {!dress && <Bottom item={bottom} fill={bottom ? fill(bottom) : "#5b6475"} body={body} legX={legX} />}

      {/* Shoes */}
      <Shoes item={shoes} legX={legX} />

      {/* Top or dress */}
      {dress ? (
        <Dress item={dress} fill={fill(dress)} body={body} armX={armX} />
      ) : (
        <Top item={top} fill={top ? fill(top) : "#9aa3b2"} body={body} armX={armX} />
      )}

      {accessory?.style === "necklace" && (
        <g>
          <path d={`M ${CX - 14} 116 Q ${CX} 138 ${CX + 14} 116`} stroke={accessory.color} strokeWidth={2.5} fill="none" />
          <circle cx={CX} cy={131} r={3.5} fill={accessory.color} />
        </g>
      )}

      {/* Head */}
      <ellipse cx={CX - 31} cy={72} rx={6} ry={9} fill={shade(skin, -8)} />
      <ellipse cx={CX + 31} cy={72} rx={6} ry={9} fill={shade(skin, -8)} />
      {config.faceShape === "round" && <circle cx={CX} cy={68} r={33} fill={skin} />}
      {config.faceShape === "oval" && <ellipse cx={CX} cy={68} rx={30} ry={36} fill={skin} />}
      {config.faceShape === "square" && <rect x={CX - 31} y={33} width={62} height={70} rx={18} fill={skin} />}

      <Face style={config.eyes} eye={eye} hair={hair} skin={skin} />
      <HairFront style={config.hairStyle} color={hair} hidden={headwear?.style === "gele"} />

      {accessory?.style === "earrings" && (
        <g fill="none" stroke={accessory.color} strokeWidth={2}>
          <circle cx={CX - 32} cy={86} r={5} />
          <circle cx={CX + 32} cy={86} r={5} />
        </g>
      )}
      {accessory?.style === "glasses" && (
        <g fill="none" stroke={accessory.color} strokeWidth={2}>
          <circle cx={CX - 12} cy={68} r={8} />
          <circle cx={CX + 12} cy={68} r={8} />
          <path d={`M ${CX - 4} 67 Q ${CX} 64 ${CX + 4} 67`} />
        </g>
      )}

      <Headwear item={headwear} />
    </svg>
  );
}

function Face({ style, eye, hair, skin }: { style: AvatarConfig["eyes"]; eye: string; hair: string; skin: string }) {
  return (
    <g>
      <path d={`M ${CX - 19} 58 Q ${CX - 12} 54 ${CX - 5} 58`} stroke={hair} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <path d={`M ${CX + 5} 58 Q ${CX + 12} 54 ${CX + 19} 58`} stroke={hair} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      {[-12, 12].map((dx) =>
        style === "smile" ? (
          <path key={dx} d={`M ${CX + dx - 5} 69 Q ${CX + dx} 64 ${CX + dx + 5} 69`} stroke="#2b1a12" strokeWidth={2.2} fill="none" strokeLinecap="round" />
        ) : (
          <g key={dx}>
            <ellipse cx={CX + dx} cy={68} rx={style === "almond" ? 6 : 5} ry={style === "almond" ? 3.6 : 5} fill="#fff" />
            <circle cx={CX + dx} cy={68} r={2.8} fill={eye} />
            <circle cx={CX + dx + 1} cy={67} r={0.9} fill="#fff" />
          </g>
        ),
      )}
      <path d={`M ${CX} 72 Q ${CX - 4} 82 ${CX + 2} 82`} stroke={shade(skin, -35)} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <path d={`M ${CX - 9} 89 Q ${CX} 96 ${CX + 9} 89`} stroke={shade(skin, -55)} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <circle cx={CX - 19} cy={82} r={5} fill="#e57373" opacity={0.18} />
      <circle cx={CX + 19} cy={82} r={5} fill="#e57373" opacity={0.18} />
    </g>
  );
}

function HairBack({ style, color }: { style: AvatarConfig["hairStyle"]; color: string }) {
  switch (style) {
    case "afro":
      return <circle cx={CX} cy={58} r={50} fill={color} />;
    case "puff":
      return <circle cx={CX} cy={20} r={22} fill={color} />;
    case "bun":
      return <circle cx={CX} cy={27} r={15} fill={color} />;
    case "braids":
      return (
        <g fill={color}>
          {[-30, -22, -14, 14, 22, 30].map((dx) => (
            <rect key={dx} x={CX + dx - 3.5} y={50} width={7} height={dx < -20 || dx > 20 ? 120 : 112} rx={3.5} />
          ))}
        </g>
      );
    case "locs":
      return (
        <g fill={color}>
          {[-34, -26, -18, 18, 26, 34].map((dx) => (
            <rect key={dx} x={CX + dx - 5} y={48} width={10} height={86} rx={5} />
          ))}
        </g>
      );
    case "bob":
      return <path d={`M ${CX - 38} 104 Q ${CX - 44} 26 ${CX} 26 Q ${CX + 44} 26 ${CX + 38} 104 Z`} fill={color} />;
    default:
      return null;
  }
}

function HairFront({ style, color, hidden }: { style: AvatarConfig["hairStyle"]; color: string; hidden: boolean }) {
  if (hidden || style === "bald") return null;
  const cap = (top: number) => (
    <path d={`M ${CX - 31} 62 Q ${CX - 32} ${top} ${CX} ${top} Q ${CX + 32} ${top} ${CX + 31} 62 Q ${CX + 22} 44 ${CX} 44 Q ${CX - 22} 44 ${CX - 31} 62 Z`} fill={color} />
  );
  switch (style) {
    case "low_cut":
      return cap(31);
    case "fade":
      return (
        <g>
          {cap(26)}
          <path d={`M ${CX - 31} 62 Q ${CX - 31} 50 ${CX - 24} 42`} stroke={color} strokeWidth={3} opacity={0.5} fill="none" />
          <path d={`M ${CX + 31} 62 Q ${CX + 31} 50 ${CX + 24} 42`} stroke={color} strokeWidth={3} opacity={0.5} fill="none" />
        </g>
      );
    case "afro":
      return <path d={`M ${CX - 33} 60 Q ${CX - 30} 30 ${CX} 30 Q ${CX + 30} 30 ${CX + 33} 60 Q ${CX + 20} 42 ${CX} 44 Q ${CX - 20} 42 ${CX - 33} 60 Z`} fill={color} />;
    case "braids":
      return (
        <g>
          {cap(30)}
          {[-16, -6, 4, 14].map((dx) => (
            <path key={dx} d={`M ${CX + dx} 33 L ${CX + dx * 1.6} 50`} stroke={shade(color, 40)} strokeWidth={1.2} />
          ))}
        </g>
      );
    case "bob":
      return <path d={`M ${CX - 32} 66 Q ${CX - 30} 30 ${CX} 30 Q ${CX + 30} 30 ${CX + 32} 66 Q ${CX + 10} 46 ${CX - 32} 66 Z`} fill={color} />;
    default:
      return cap(30); // puff, bun, locs: hair pulled back from the hairline
  }
}

function Top({ item, fill, body, armX }: { item?: CatalogItem; fill: string; body: { s: number; w: number; h: number }; armX: number }) {
  const style = item?.style ?? "tee";
  const color = item?.color ?? "#9aa3b2";
  const long = style === "hoodie" || style === "kaftan" || style === "shirt";
  const sleeveEnd = long ? 205 : 148;
  const sx = (side: -1 | 1) => CX + side * (body.s - 4);
  const ex = (side: -1 | 1) => CX + side * (body.s - 4 + ((armX - body.s + 4) * (sleeveEnd - 124)) / 88);
  const bottom = style === "kaftan" ? 252 : style === "hoodie" ? 210 : 200;
  return (
    <g>
      {style === "hoodie" && <path d={`M ${CX - 22} 118 Q ${CX} 96 ${CX + 22} 118 Z`} fill={shade(color, -25)} />}
      {([-1, 1] as const).map((side) => (
        <line key={side} x1={sx(side)} y1={124} x2={ex(side)} y2={sleeveEnd} stroke={fill} strokeWidth={style === "blouse" ? 15 : 16} strokeLinecap="round" />
      ))}
      {style === "blouse" &&
        ([-1, 1] as const).map((side) => <circle key={side} cx={CX + side * (body.s - 2)} cy={124} r={11} fill={fill} />)}
      <path d={style === "kaftan" ? `${torsoPath(body, 205)} M ${CX - body.h - 2} 200 L ${CX + body.h + 2} 200 L ${CX + body.h + 6} ${bottom} L ${CX - body.h - 6} ${bottom} Z` : torsoPath(body, bottom)} fill={fill} />
      {style === "blouse" && <path d={`M ${CX - body.w} 186 L ${CX + body.w} 186 L ${CX + body.h + 8} 206 L ${CX - body.h - 8} 206 Z`} fill={fill} />}
      {style === "shirt" && (
        <g>
          <path d={`M ${CX - 10} 115 L ${CX} 128 L ${CX + 10} 115 L ${CX + 16} 122 L ${CX} 134 L ${CX - 16} 122 Z`} fill={item?.accent ?? shade(color, -20)} />
          {[142, 156, 170, 184].map((y) => <circle key={y} cx={CX} cy={y} r={1.6} fill={item?.accent ?? shade(color, -40)} />)}
        </g>
      )}
      {style === "kaftan" && <path d={`M ${CX - 9} 116 L ${CX} 140 L ${CX + 9} 116`} stroke={item?.accent ?? "#e8c36a"} strokeWidth={3} fill="none" />}
      {style === "hoodie" && (
        <g>
          <rect x={CX - 18} y={176} width={36} height={20} rx={6} fill={shade(color, -18)} />
          <line x1={CX - 6} y1={118} x2={CX - 6} y2={140} stroke={shade(color, -40)} strokeWidth={1.5} />
          <line x1={CX + 6} y1={118} x2={CX + 6} y2={140} stroke={shade(color, -40)} strokeWidth={1.5} />
        </g>
      )}
      {style === "tee" && <path d={`M ${CX - 10} 115 Q ${CX} 124 ${CX + 10} 115`} stroke={shade(color, -30)} strokeWidth={2} fill="none" />}
    </g>
  );
}

function Bottom({ item, fill, body, legX }: { item?: CatalogItem; fill: string; body: { s: number; w: number; h: number }; legX: number }) {
  const style = item?.style ?? "shorts";
  if (style === "skirt") {
    return <path d={`M ${CX - body.w - 1} 188 L ${CX + body.w + 1} 188 L ${CX + body.h + 14} 252 L ${CX - body.h - 14} 252 Z`} fill={fill} />;
  }
  const end = style === "shorts" ? 238 : 286;
  return (
    <g>
      <path d={`M ${CX - body.w - 1} 188 L ${CX + body.w + 1} 188 L ${CX + body.h + 1} 210 L ${CX - body.h - 1} 210 Z`} fill={fill} />
      {[-1, 1].map((side) => (
        <line key={side} x1={CX + side * legX} y1={205} x2={CX + side * legX} y2={end} stroke={fill} strokeWidth={19} strokeLinecap="square" />
      ))}
      <line x1={CX} y1={196} x2={CX} y2={212} stroke={shade(item?.color ?? "#5b6475", -30)} strokeWidth={1.2} />
    </g>
  );
}

function Dress({ item, fill, body, armX }: { item: CatalogItem; fill: string; body: { s: number; w: number; h: number }; armX: number }) {
  const hem = item.style === "gown" ? 292 : 254;
  return (
    <g>
      {[-1, 1].map((side) => (
        <line key={side} x1={CX + side * (body.s - 4)} y1={124} x2={CX + side * (body.s - 1 + (armX - body.s) * 0.2)} y2={140} stroke={fill} strokeWidth={15} strokeLinecap="round" />
      ))}
      <path d={torsoPath(body, 190)} fill={fill} />
      <path d={`M ${CX - body.w} 186 L ${CX + body.w} 186 L ${CX + body.h + (item.style === "gown" ? 26 : 18)} ${hem} L ${CX - body.h - (item.style === "gown" ? 26 : 18)} ${hem} Z`} fill={fill} />
      <path d={`M ${CX - body.w} 188 L ${CX + body.w} 188`} stroke={item.accent ?? shade(item.color, -30)} strokeWidth={4} />
    </g>
  );
}

function Shoes({ item, legX }: { item?: CatalogItem; legX: number }) {
  const color = item?.color ?? "#444";
  const style = item?.style ?? "sneakers";
  return (
    <g>
      {[-1, 1].map((side) => {
        const x = CX + side * legX;
        if (style === "heels") {
          return (
            <g key={side}>
              <path d={`M ${x - 7} 290 L ${x + 9 * side} 296 L ${x + 9 * side} 300 L ${x - 7} 300 Z`} fill={color} />
              <rect x={side < 0 ? x + 3 : x - 5} y={298} width={2.5} height={8} fill={shade(color, -40)} />
            </g>
          );
        }
        if (style === "sandals") {
          return (
            <g key={side}>
              <rect x={x - 9} y={298} width={18} height={4} rx={2} fill={color} />
              <path d={`M ${x - 7} 297 L ${x + 7} 292`} stroke={color} strokeWidth={3} />
            </g>
          );
        }
        return (
          <g key={side}>
            <path d={`M ${x - 9} 290 L ${x + 6} 290 Q ${x + 14 * (side > 0 ? 1 : 0.4)} 294 ${x + 13} 300 L ${x - 9} 300 Z`} fill={color} />
            <rect x={x - 9} y={299} width={22} height={3} rx={1.5} fill={item?.accent ?? "#ddd"} />
          </g>
        );
      })}
    </g>
  );
}

function Headwear({ item }: { item?: CatalogItem }) {
  if (!item) return null;
  if (item.style === "cap") {
    return (
      <g fill={item.color}>
        <path d={`M ${CX - 33} 52 Q ${CX - 32} 22 ${CX} 22 Q ${CX + 32} 22 ${CX + 33} 52 Z`} />
        <path d={`M ${CX + 10} 50 Q ${CX + 40} 46 ${CX + 50} 54 L ${CX + 10} 54 Z`} fill={shade(item.color, -20)} />
      </g>
    );
  }
  if (item.style === "fila") {
    return <path d={`M ${CX - 32} 50 Q ${CX - 36} 14 ${CX + 6} 16 Q ${CX + 36} 20 ${CX + 32} 50 Z`} fill={item.color} />;
  }
  // gele: a tall, folded head wrap
  return (
    <g>
      <path d={`M ${CX - 40} 56 Q ${CX - 54} 8 ${CX} 6 Q ${CX + 54} 8 ${CX + 40} 56 Q ${CX} 44 ${CX - 40} 56 Z`} fill={item.color} />
      {[-24, -8, 8, 24].map((dx) => (
        <path key={dx} d={`M ${CX + dx} 50 Q ${CX + dx * 1.4} 26 ${CX + dx * 0.6} 12`} stroke={item.accent ?? shade(item.color, -30)} strokeWidth={2} fill="none" />
      ))}
    </g>
  );
}

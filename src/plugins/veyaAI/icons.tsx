/*
 * VEYA-AI – icons.tsx
 * Custom icon set (source: assets/veya-icons.json) – replaces all emojis in the UI.
 * Line icons 24×24, stroke 1.8, with a lime drop as the brand mark.
 */

import { React } from "@webpack/common";

import { VEYA_COLORS } from "./brand";

type Circle = [number, number, number];
interface IconDef { d: string; dot?: Circle; fill?: Circle[]; ring?: Circle[]; ringOpacity?: number; }

export type VeyaIconName = "chat" | "plug" | "palette" | "spark" | "tool" | "brush" | "key" | "import" | "export" | "search" | "save" | "eye" | "folder" | "trash" | "close" | "check" | "warn" | "link" | "next" | "back" | "send" | "launch" | "wait" | "spinner" | "error" | "done" | "info" | "store" | "summary" | "translate" | "reply" | "refresh" | "shield" | "globe" | "code" | "power" | "copy" | "uninstall";

const ICONS: Record<VeyaIconName, IconDef> = {"chat":{"d":"M7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 4v-4h.5A2.5 2.5 0 0 1 5 12.5v-6A2.5 2.5 0 0 1 7.5 4z M9 9.5h6","dot":[21.2,3.2,1.6]},"plug":{"d":"M9 3v4M15 3v4M7 7h10v3a5 5 0 0 1-10 0V7zM12 15v6","dot":[19.5,4.5,1.8]},"palette":{"d":"M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z","fill":[[10,7.5,1.1],[14.5,7.5,1.1]],"dot":[7.5,11.5,1.6]},"spark":{"d":"M11 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z","dot":[18.5,19,2]},"tool":{"d":"M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z","dot":[19.5,19.5,1.8]},"brush":{"d":"M19 3.5 10.5 12M10.5 12l1.5 1.5M9.3 13.3c-2 0-3.5 1.5-3.5 3.5 0 1.5-1 2.5-2.3 3 3 .6 7.3-.4 7.3-4 0-1-.6-2-1.5-2.5z","dot":[5.5,5.5,1.8]},"key":{"d":"M11 12l8-8M16 7l2.5 2.5M14 9l2 2","ring":[[8,15,4]],"dot":[19.5,19.5,1.8]},"import":{"d":"M12 3v11M7.5 9.5 12 14l4.5-4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"},"export":{"d":"M12 14V3M7.5 7.5 12 3l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"},"search":{"d":"M20 20l-4.5-4.5","ring":[[11,11,6]]},"save":{"d":"M6 4h10l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 4v4.5h6V4M8 20v-5.5h8V20"},"eye":{"d":"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z","dot":[12,12,2.6]},"folder":{"d":"M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7z"},"trash":{"d":"M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"},"close":{"d":"M6 6l12 12M18 6 6 18"},"check":{"d":"M5 12.5l4.5 4.5L19 7.5"},"warn":{"d":"M12 4 21 19.5H3L12 4zM12 10v4","fill":[[12,16.8,1.1]]},"link":{"d":"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"},"next":{"d":"M5 12h13M13 6l6 6-6 6"},"back":{"d":"M19 12H6M11 6l-6 6 6 6"},"send":{"d":"M12 19V6M6 11l6-6 6 6"},"launch":{"d":"M7 17 17 7M9 7h8v8","dot":[5.5,18.5,1.8]},"wait":{"d":"","ring":[[12,12,3.5]]},"spinner":{"d":"M12 4a8 8 0 0 1 8 8","ring":[[12,12,8]],"ringOpacity":0.2},"error":{"d":"M9 9l6 6M15 9l-6 6","ring":[[12,12,8.5]]},"done":{"d":"M8 12.3l2.8 2.8L16 9.6","ring":[[12,12,8.5]],"dot":[19.5,4.5,1.8]},"info":{"d":"M12 11v5.5","ring":[[12,12,8.5]],"fill":[[12,7.8,1.15]]},"store":{"d":"M5 8h14l-1 12H6L5 8zM9 8V6.5a3 3 0 0 1 6 0V8","dot":[20,4,1.7]},"summary":{"d":"M5 6h14M5 10h14M5 14h9M5 18h6","dot":[18,17.5,2]},"translate":{"d":"M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.6 5.5 7M11 5c-.6 3.4-3 6.4-6.5 8M13 20l4-9 4 9M14.4 17h5.2"},"reply":{"d":"M10 8 5 12.5l5 4.5M5 12.5h9a5 5 0 0 1 5 5V19"},"refresh":{"d":"M19.5 12A7.5 7.5 0 1 1 17 6.4M19.5 4v4.5H15","dot":[12,12,1.8]},"shield":{"d":"M12 3 19.5 6v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3zM9 12l2.2 2.2L15.5 10"},"globe":{"d":"M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5M12 3.5C9.6 5.8 8.4 8.7 8.4 12s1.2 6.2 3.6 8.5","ring":[[12,12,8.5]]},"code":{"d":"M9 8l-4 4 4 4M15 8l4 4-4 4","dot":[12,19.5,1.6]},"power":{"d":"M12 3.5v7M7 6.2a7.5 7.5 0 1 0 10 0"},"copy":{"d":"M9 9h9.5a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 19V9.5M15.5 9V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5H8.5"},"uninstall":{"d":"M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11l4 4M14 11l-4 4"}};

export function VIcon({ name, size = 16, dot = true, style, className }: {
    name: VeyaIconName;
    size?: number;
    /** Show the lime drop (on a lime background: false) */
    dot?: boolean | string;
    style?: React.CSSProperties;
    className?: string;
}) {
    const x = ICONS[name];
    if (!x) return null;
    const dotColor = typeof dot === "string" ? dot : VEYA_COLORS.accent;
    return (
        <svg
            width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
            style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
        >
            {x.ring?.map(([cx, cy, r], i) => <circle key={"r" + i} cx={cx} cy={cy} r={r} strokeOpacity={x.ringOpacity} />)}
            {x.d && <path d={x.d} />}
            {x.fill?.map(([cx, cy, r], i) => <circle key={"f" + i} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />)}
            {x.dot && dot !== false && <circle cx={x.dot[0]} cy={x.dot[1]} r={x.dot[2]} fill={dotColor} stroke="none" />}
        </svg>
    );
}

/** Icon + text side by side (for buttons) */
export function IconLabel({ icon, children, size = 14, dot }: { icon: VeyaIconName; children?: React.ReactNode; size?: number; dot?: boolean | string; }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <VIcon name={icon} size={size} dot={dot} />
            {children}
        </span>
    );
}

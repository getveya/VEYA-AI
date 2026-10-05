/*
 * VEYA-AI – brand.tsx
 * Brand colours + liquid-goo logo as a React component
 */

import { React } from "@webpack/common";

export const VEYA_COLORS = {
    accent:       "#ccff00",
    accentLight:  "#e6ff7a",
    accentDeep:   "#7ddb00",
    accentSoft:   "rgba(204,255,0,0.12)",
    accentBorder: "rgba(204,255,0,0.30)",
    onAccent:     "#050505",
    ink:          "#050505",
    danger:       "#ff4d4d",
    success:      "#ccff00",
};

export const VEYA_GRADIENT = "linear-gradient(135deg,#e6ff5c 0%,#ccff00 55%,#7ddb00 100%)";

let uid = 0;

/** The VEYA-AI liquid-goo logo. `mono` = single colour (e.g. black on lime). */
export function VeyaLogo({ size = 24, mono }: { size?: number; mono?: string; }) {
    const id = React.useMemo(() => `veya${++uid}`, []);
    const fill = mono ?? `url(#${id}g)`;
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-label="VEYA-AI" style={{ flexShrink: 0, display: "block" }}>
            <defs>
                <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#F0FF8A" />
                    <stop offset="0.5" stopColor="#CCFF00" />
                    <stop offset="1" stopColor="#5FC400" />
                </linearGradient>
                <filter id={`${id}f`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3.5" />
                    <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
                </filter>
            </defs>
            <g filter={`url(#${id}f)`} fill={fill}>
                <path d="M26 28 L50 72 L74 28" fill="none" stroke={fill} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="26" cy="28" r="11" />
                <circle cx="74" cy="28" r="11" />
                <circle cx="50" cy="73" r="9" />
                <circle cx="85" cy="15" r="5.5" />
            </g>
            {!mono && size >= 28 && (
                <>
                    <ellipse cx="22" cy="23" rx="4.5" ry="2.4" transform="rotate(-35 22 23)" fill="#fff" fillOpacity="0.75" />
                    <ellipse cx="70" cy="23" rx="4" ry="2.2" transform="rotate(-35 70 23)" fill="#fff" fillOpacity="0.6" />
                </>
            )}
        </svg>
    );
}

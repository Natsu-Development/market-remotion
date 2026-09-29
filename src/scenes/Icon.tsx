import React from 'react';

/**
 * Icons are drawn rather than typed. Symbol glyphs like ✓ and ⚠ are missing
 * from several weights of the Vietnamese subsets and silently fall back to a
 * different face, which reads as a bug at this size.
 */
export type IconName = 'check' | 'warning' | 'cross' | 'up' | 'down';

export const Icon: React.FC<{name: IconName; size: number; color: string}> = ({name, size, color}) => {
  const common = {
    stroke: color,
    strokeWidth: 2.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block'}}>
      {name === 'check' ? <path d="M5 12.5 10 17.5 19 7" {...common} /> : null}
      {name === 'cross' ? <path d="M6.5 6.5 17.5 17.5 M17.5 6.5 6.5 17.5" {...common} /> : null}
      {name === 'up' ? <path d="M12 19V5 M6 11l6-6 6 6" {...common} /> : null}
      {name === 'down' ? <path d="M12 5v14 M6 13l6 6 6-6" {...common} /> : null}
      {name === 'warning' ? (
        <>
          <path d="M12 4.2 21.2 20H2.8z" {...common} />
          <path d="M12 10v4.4" {...common} />
          <circle cx={12} cy={17.4} r={0.9} fill={color} stroke="none" />
        </>
      ) : null}
    </svg>
  );
};

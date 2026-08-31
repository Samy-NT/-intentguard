"use client";

export function HeroSceneFallback() {
  const nodes = [
    [18, 64],
    [31, 33],
    [45, 55],
    [53, 21],
    [63, 45],
    [73, 25],
    [80, 59],
    [66, 76],
    [39, 79],
    [24, 48],
  ];

  const paths = [
    [0, 2],
    [1, 2],
    [2, 4],
    [3, 4],
    [4, 6],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 2],
    [9, 2],
    [4, 8],
  ];

  return (
    <div className="aurel-hero-fallback" aria-hidden="true">
      <svg viewBox="0 0 100 100" role="img" focusable="false">
        <defs>
          <radialGradient id="aurel-fallback-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fafaf9" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#d6d3d1" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        <g className="aurel-fallback-lines">
          {paths.map(([a, b], index) => (
            <line
              key={`${a}-${b}`}
              x1={nodes[a][0]}
              y1={nodes[a][1]}
              x2={nodes[b][0]}
              y2={nodes[b][1]}
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </g>
        <g>
          <circle className="aurel-fallback-boundary" cx="55" cy="52" r="32" />
          <circle className="aurel-fallback-boundary aurel-fallback-boundary-alt" cx="55" cy="52" r="22" />
        </g>
        <g className="aurel-fallback-nodes">
          {nodes.map(([x, y], index) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={index === 4 ? 2.2 : 1.35} />
          ))}
        </g>
        <circle className="aurel-fallback-core" cx="63" cy="45" r="7.5" fill="url(#aurel-fallback-core)" />
        <path
          className="aurel-fallback-threat"
          d="M18 64 C31 62 38 55 45 55 C52 54 57 49 63 45"
          pathLength="1"
        />
        <circle className="aurel-fallback-containment" cx="76" cy="63" r="8.5" />
      </svg>
    </div>
  );
}

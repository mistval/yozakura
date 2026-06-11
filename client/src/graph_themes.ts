import type { Theme } from 'reagraph';
import { useResolvedTheme } from './hooks/Theme.js';

function makeTheme(
  bg: string,
  nodeFill: string,
  activeFill: string,
  labelColor: string,
  edgeFill: string,
  ringFill: string
): Theme {
  return {
    canvas: { background: bg },
    node: {
      fill: nodeFill,
      activeFill,
      opacity: 1,
      selectedOpacity: 1,
      inactiveOpacity: 0.2,
      label: { color: labelColor, stroke: bg, activeColor: activeFill },
    },
    ring: { fill: ringFill, activeFill },
    edge: {
      fill: edgeFill,
      activeFill,
      opacity: 1,
      selectedOpacity: 1,
      inactiveOpacity: 0.1,
      label: { stroke: bg, color: labelColor, activeColor: activeFill, fontSize: 6 },
    },
    arrow: { fill: edgeFill, activeFill },
    lasso: {
      background: `${activeFill}22`,
      border: `1px solid ${activeFill}`,
    },
    cluster: {
      stroke: edgeFill,
      opacity: 1,
      selectedOpacity: 1,
      inactiveOpacity: 0.1,
      label: { stroke: bg, color: labelColor },
    },
  };
}

export const GRAPH_THEMES = {
  light: makeTheme('#f1f5f9', '#7CA0AB', '#059669', '#0f172a', '#cbd5e1', '#e2e8f0'),
  dark: makeTheme('#0f172a', '#64748b', '#10b981', '#f1f5f9', '#334155', '#475569'),
  black: makeTheme('#000000', '#555555', '#c0c0c0', '#d0d0d0', '#222222', '#2b2b2b'),
  firmament: makeTheme('#05070b', '#4a5d77', '#2b9f80', '#8dc9cf', '#202c3d', '#2b384b'),
  tempest: makeTheme('#070a0f', '#58718e', '#4f9d92', '#d3d9e2', '#293548', '#334358'),
  neon: makeTheme('#0f0935', '#8f62b8', '#4db0ba', '#e8dbf6', '#3b2c53', '#4b3768'),
  stormy: makeTheme('#c7cfd8', '#748496', '#5f8782', '#29323d', '#aebbc8', '#9eacba'),
  oceanic: makeTheme('#d2deea', '#6884a2', '#548992', '#223447', '#a8bfd4', '#98b0c7'),
  littoral: makeTheme('#f7ecd8', '#5b87a8', '#5d8f79', '#2e3d4a', '#cfbb97', '#bba780'),
  winnipesaukee: makeTheme('#070e16', '#6d98be', '#4d9a83', '#d6e8f6', '#28425d', '#355674'),
  christmas: makeTheme('#f2f3ef', '#b7353b', '#2a9161', '#322a2a', '#dcc0bd', '#cda7a3'),
  smokies: makeTheme('#f8efe3', '#bd8f5d', '#6e9e64', '#4c3620', '#e6c9a8', '#d9b48b'),
  sakura: makeTheme('#fdebf1', '#c96f98', '#69a579', '#4f0014', '#e6bfd0', '#d89bb4'),
  agape: makeTheme('#f6e6c8', '#aa7639', '#618b53', '#2a0d00', '#ddb887', '#cda06a'),
  yozakura: makeTheme('#0d101a', '#b96b95', '#5f9b73', '#ffd8e6', '#43304b', '#59405d'),
  mercurial: makeTheme('#151107', '#a07a3e', '#8da66e', '#f5e7c1', '#5a4727', '#6b562f'),
  mpk: makeTheme('#040805', '#5da97f', '#54b07a', '#d7ffe3', '#244734', '#2f6046'),
};

export function useGraphTheme(): Theme {
  const resolvedTheme = useResolvedTheme();
  return GRAPH_THEMES[resolvedTheme] ?? GRAPH_THEMES.light;
}

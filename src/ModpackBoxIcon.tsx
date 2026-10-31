import React from 'react';

/**
 * Иконка вкладки «Сборки»: закрытая картонная коробка с упаковочной лентой,
 * рукой-отверстием и наклейкой «верх/низ». Рисунок цветной, поэтому цвет темы
 * не наследует — как и раньше, при неактивном пункте просто глушится opacity.
 *
 * Пути лежат списком и рисуются по порядку: сначала силуэт, затем грани,
 * лента и наклейки. Порядок важен — он и есть картинка.
 */
const LAYERS: Array<[fill: string, d: string]> = [
  ['#57371f', 'M12 3h4v1h4v1h4v1h4v1h1v17h-2v1h-2v1h-2v1h-2v1h-3v1h-4v-1h-4v-1H6v-1H3V9h1V7h4V5h4z'],
  ['#ddb477', 'M12 4h4v1h4v1h4v1h4v2h-3v1h-3v1h-3v1h-4v-1h-4v-1H7V9H4V8h4V6h4z'],
  ['#bf8b4f', 'M4 10h3v1h4v1h4v1h3v15h-4v-1h-4v-1H6v-1H4z'],
  ['#97632f', 'M18 13h2v-1h3v-1h3v-1h2v13h-2v1h-2v1h-2v1h-2v1h-2z'],
  ['#ad773b', 'M19 14h2v-1h3v-1h2v10h-2v1h-2v1h-3z'],
  ['#d3a265', 'M4 10h3v1h4v1h4v1h2v2h-3v-1h-4v-1H6v-1H4zM5 14h1v8H5z'],
  ['#a7713b', 'M7 24h3v1h4v1h3v1h-3v-1h-4v-1H7zM15 16h1v2h-1zM6 19h1v2H6z'],
  ['#b78a43', 'M18 5h2v1h4v1h-2v1h-3v1h-3v1h-3v1H9v-1H7V9h3V8h3V7h3V6h2z'],
  ['#efd193', 'M18 5h2v1h2v1h-3v1h-3v1h-3v1h-3V9h3V8h3V7h2z'],
  ['#e6c484', 'M9 11h3v1h1v14h-3V15H9z'],
  ['#f4dca7', 'M10 12h1v13h-1z'],
  ['#cfaa69', 'M12 13h1v13h-1z'],
  ['#75491f', 'M22 14h3v1h1v2h-2v1h-3v-3h1z'],
  ['#39291d', 'M22 15h3v1h-2v1h-1z'],
  ['#966735', 'M5 16h4v1h1v7H6v-1H5z'],
  ['#f4ead3', 'M5 16h3v1h1v6H6v-1H5z'],
  ['#544434', 'M6 18h1v-1h1v2H7v2H6z'],
  ['#6f4929', 'M20 20h2v-1h3v4h-2v1h-3z'],
  ['#efe5ca', 'M20 20h2v-1h3v3h-2v1h-3z'],
  ['#554331', 'M21 20h1v2h-1zM23 19h1v2h-1z'],
]

export const ModpackBoxIcon: React.FC<{ size?: number; opacity?: number }> = ({ size = 26, opacity = 1 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="2 2 29 26"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    role="img"
    aria-labelledby="modpack-box-title"
    style={{
      opacity,
      flexShrink: 0,
      imageRendering: 'pixelated',
      transition: 'opacity 0.15s ease'
    }}
  >
    <title id="modpack-box-title">Сборки</title>
    {LAYERS.map(([fill, d]) => (
      <path key={fill + d} fill={fill} d={d} />
    ))}
  </svg>
);

export default ModpackBoxIcon;

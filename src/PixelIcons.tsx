import React from 'react'

/**
 * Пиксельные иконки интерфейса: контурные, с crispEdges — вместо круглых
 * lucide-иконок там, где они встречаются рядом с блочной графикой.
 * Контур берёт currentColor, поэтому иконки наследуют цвет текста (тема).
 * Геометрия путей — из макетов 32x32 со штрихом 2.
 */

/** lucide рисует штрих 2 в viewBox 24: пересчитываем в наши 32, чтобы 
 *  толщина линии на экране после замены иконок не изменилась. */
const LUCIDE_SCALE = 32 / 24

export interface IconProps {
  size?: number | string
  strokeWidth?: number
  /** Перебивает currentColor, когда нужен фиксированный цвет. */
  color?: string
  className?: string
  style?: React.CSSProperties
}

/** Галочка — пиксельная контурная иконка */
export const Check: React.FC<IconProps> = ({ size = 16, strokeWidth = 2, color, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 32 32'
    shapeRendering='crispEdges'
    fill='none'
    stroke={color || 'currentColor'}
    strokeWidth={strokeWidth * LUCIDE_SCALE}
    strokeLinecap='square'
    strokeLinejoin='miter'
    className={className}
    style={style}
    aria-hidden='true'
    focusable='false'
  >
    <path d='M3 16H7V19H10V22H12V19H15V16H18V13H21V10H24V7H28V11H25V14H22V17H19V20H16V23H13V26H9V23H6V20H3Z' />
  </svg>
)

/** Часы — пиксельная контурная иконка */
export const Clock: React.FC<IconProps> = ({ size = 16, strokeWidth = 2, color, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 32 32'
    shapeRendering='crispEdges'
    fill='none'
    stroke={color || 'currentColor'}
    strokeWidth={strokeWidth * LUCIDE_SCALE}
    strokeLinecap='square'
    strokeLinejoin='miter'
    className={className}
    style={style}
    aria-hidden='true'
    focusable='false'
  >
    <path d='M11 3H21V5H25V7H27V11H29V21H27V25H25V27H21V29H11V27H7V25H5V21H3V11H5V7H7V5H11Z M16 8V17H22' />
  </svg>
)

/** Загрузка — пиксельная контурная иконка */
export const Download: React.FC<IconProps> = ({ size = 16, strokeWidth = 2, color, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 32 32'
    shapeRendering='crispEdges'
    fill='none'
    stroke={color || 'currentColor'}
    strokeWidth={strokeWidth * LUCIDE_SCALE}
    strokeLinecap='square'
    strokeLinejoin='miter'
    className={className}
    style={style}
    aria-hidden='true'
    focusable='false'
  >
    <path d='M13 3H19V14H24V17H21V20H18V23H14V20H11V17H8V14H13Z M4 23V29H28V23' />
  </svg>
)

/** Папка — пиксельная контурная иконка */
export const Folder: React.FC<IconProps> = ({ size = 16, strokeWidth = 2, color, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 32 32'
    shapeRendering='crispEdges'
    fill='none'
    stroke={color || 'currentColor'}
    strokeWidth={strokeWidth * LUCIDE_SCALE}
    strokeLinecap='square'
    strokeLinejoin='miter'
    className={className}
    style={style}
    aria-hidden='true'
    focusable='false'
  >
    <path d='M3 8H12V10H17V12H29V27H3Z M3 12H17' />
  </svg>
)

/** Настройки — пиксельная контурная иконка */
export const Settings: React.FC<IconProps> = ({ size = 16, strokeWidth = 2, color, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 32 32'
    shapeRendering='crispEdges'
    fill='none'
    stroke={color || 'currentColor'}
    strokeWidth={strokeWidth * LUCIDE_SCALE}
    strokeLinecap='square'
    strokeLinejoin='miter'
    className={className}
    style={style}
    aria-hidden='true'
    focusable='false'
  >
    <path d='M12 3H20V7H23V5H26V9H24V12H29V20H24V23H26V27H22V25H20V29H12V25H9V27H5V23H7V20H3V12H7V9H5V5H9V7H12Z M13 11H19V13H21V19H19V21H13V19H11V13H13Z' />
  </svg>
)

/** Бирка — пиксельная контурная иконка */
export const Tag: React.FC<IconProps> = ({ size = 16, strokeWidth = 2, color, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 32 32'
    shapeRendering='crispEdges'
    fill='none'
    stroke={color || 'currentColor'}
    strokeWidth={strokeWidth * LUCIDE_SCALE}
    strokeLinecap='square'
    strokeLinejoin='miter'
    className={className}
    style={style}
    aria-hidden='true'
    focusable='false'
  >
    <path d='M3 5H15V7H18V10H21V13H24V16H27V20H24V23H21V26H17V23H14V20H11V17H8V14H5V11H3Z M7 8H11V12H7Z' />
  </svg>
)

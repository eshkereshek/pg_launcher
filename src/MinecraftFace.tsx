import React, { useEffect, useState } from 'react';

export interface Account {
  id: string;
  name: string;
  type: 'offline' | 'elyby' | 'microsoft';
  token?: string;
  uuid?: string;
  skinUrl?: string;
}

const DEFAULT_STEVE_HEAD = './steve-head-Djx_sDkf.png';
const headCache = new Map<string, string>();

// Pre-extracted 8x8 base face RGB pixels from Steve skin as canonical underlay for transparent base pixels
const STEVE_BASE_TOP = [
  42,29,13, 42,29,13, 36,24,8,  42,29,13, 42,29,13, 36,24,8,  36,24,8,  31,16,11,
  42,29,13, 36,24,8,  47,31,15, 47,31,15, 42,29,13, 36,24,8,  36,24,8,  36,24,8,
  42,29,13, 47,31,15, 47,31,15, 38,26,11, 42,29,13, 36,24,8,  36,24,8,  36,24,8,
  36,24,8,  47,31,15, 42,29,13, 36,24,8,  42,29,13, 42,29,12, 47,31,15, 42,29,13,
  42,29,13, 47,31,15, 42,29,13, 38,26,10, 38,26,10, 47,31,15, 47,31,15, 42,29,13,
  42,29,13, 42,29,13, 38,26,10, 38,26,10, 47,31,15, 47,31,15, 47,31,15, 42,29,13,
  42,29,13, 38,26,10, 47,31,15, 41,28,12, 38,26,10, 31,16,10, 47,31,15, 42,29,13,
  42,29,13, 41,28,12, 38,26,10, 38,26,10, 38,26,10, 38,26,10, 42,29,13, 42,29,13
];

const STEVE_BASE_LEFT = [
  40,27,10, 40,27,10, 38,26,10, 39,27,11, 41,28,12, 50,35,16, 45,32,16, 45,32,16,
  40,27,10, 40,27,10, 38,26,10, 38,26,10, 44,30,14, 41,28,12, 43,30,13, 51,36,17,
  44,30,14, 38,24,11, 38,26,10, 41,28,12, 43,30,14, 40,27,11, 36,24,10, 41,28,12,
  40,27,10, 40,26,13, 45,29,14, 44,30,14, 40,27,10, 39,27,11, 44,30,14, 47,34,17,
  40,27,10, 40,27,10, 40,27,10, 38,26,12, 35,23,9,  135,88,58,156,99,69,58,40,20,
  40,27,10, 40,27,11, 40,26,13, 38,24,11, 44,30,17, 132,82,49,150,95,65,136,90,57,
  44,30,14, 40,27,10, 45,29,14, 98,67,47, 157,106,79,154,99,68,134,83,52,117,71,47,
  134,83,52,134,83,52,154,99,68,134,83,52,156,103,72,150,95,65,138,89,59,116,72,47
];

const STEVE_BASE_FRONT = [
  47,32,13,  43,30,13,  47,31,15,  40,28,11,  36,24,8,   38,26,10,  43,30,13,  42,29,13,
  43,30,13,  43,30,13,  43,30,13,  51,36,17,  66,42,18,  63,42,21,  44,30,14,  40,28,11,
  43,30,13,  182,137,108,189,142,114,198,150,128,189,139,114,189,142,116,172,118,90,52,37,18,
  170,125,103,180,132,109,170,125,102,173,128,109,156,114,92,187,137,114,156,105,76,156,105,76,
  180,132,109,255,255,255,82,61,137,181,123,103,187,137,114,82,61,137,255,255,255,170,125,102,
  156,99,70, 179,123,98,183,130,114,106,64,48, 106,64,48, 190,136,108,162,106,71,128,83,52,
  144,94,67, 150,95,64, 64,32,10,  135,74,58, 135,74,58, 64,32,10,  143,94,62, 129,83,57,
  111,69,44, 109,67,43, 64,32,10,  64,32,10,  64,32,10,  64,32,10,  131,85,59, 122,78,51
];

/**
 * Renders an isometric 3D Minecraft head with base layer (with Steve underlay for transparent parts)
 * and outer (hat/hair) layer onto an offscreen canvas and returns a PNG DataURL.
 */
function renderIsometricHead(skinImageData: ImageData, outW = 191, outH = 191): string {
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return DEFAULT_STEVE_HEAD;

  const out = ctx.createImageData(outW, outH);
  const outData = out.data;
  const sw = skinImageData.width;
  const sh = skinImageData.height;
  const sData = skinImageData.data;

  function getPixel(x: number, y: number) {
    if (x < 0 || x >= sw || y < 0 || y >= sh) return [0, 0, 0, 0];
    const idx = (y * sw + x) * 4;
    return [sData[idx], sData[idx + 1], sData[idx + 2], sData[idx + 3]];
  }

  function fillQuad(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    r: number,
    g: number,
    b: number,
    a: number
  ) {
    if (a < 10) return;
    const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x, p3.x)));
    const maxX = Math.min(outW - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x, p3.x)));
    const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y, p3.y)));
    const maxY = Math.min(outH - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y, p3.y)));

    const pts = [p0, p1, p2, p3];
    let crossSum = 0;
    for (let i = 0; i < 4; i++) {
      const aPt = pts[i], bPt = pts[(i + 1) % 4];
      crossSum += (bPt.x - aPt.x) * (bPt.y + aPt.y);
    }
    const clockwise = crossSum > 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = true;
        for (let i = 0; i < 4; i++) {
          const aPt = pts[i], bPt = pts[(i + 1) % 4];
          const cross = (bPt.x - aPt.x) * (py - aPt.y) - (bPt.y - aPt.y) * (px - aPt.x);
          if (clockwise ? (cross > 0) : (cross < 0)) { inside = false; break; }
        }
        if (inside) {
          const idx = (y * outW + x) * 4;
          const srcA = a / 255;
          const dstA = outData[idx + 3] / 255;
          const outA = srcA + dstA * (1 - srcA);
          if (outA > 0) {
            outData[idx] = Math.round((r * srcA + outData[idx] * dstA * (1 - srcA)) / outA);
            outData[idx + 1] = Math.round((g * srcA + outData[idx + 1] * dstA * (1 - srcA)) / outA);
            outData[idx + 2] = Math.round((b * srcA + outData[idx + 2] * dstA * (1 - srcA)) / outA);
            outData[idx + 3] = Math.round(outA * 255);
          }
        }
      }
    }
  }

  // Exact isometric dimensions matching steve-head-Djx_sDkf.png (191x191)
  const X0 = 95.5, Y0 = 10;
  const dx = 10, dy = 5.3125, dz = 10.625;

  // Check if skin has hat/outer layer
  let hasHat = false;
  let allOpaqueBlack = true;
  let totalHatPixels = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 32; x < 64; x++) {
      const p = getPixel(x, y);
      if (p[3] > 10) {
        hasHat = true;
        totalHatPixels++;
        if (p[0] !== 0 || p[1] !== 0 || p[2] !== 0) {
          allOpaqueBlack = false;
        }
      }
    }
  }
  // Ignore corrupted/solid black hat layers
  if (allOpaqueBlack && totalHatPixels > 300) {
    hasHat = false;
  }

  // 1. Base Layer
  // Top face (x: 8..15, y: 0..7)
  for (let ty = 0; ty < 8; ty++) {
    for (let tx = 0; tx < 8; tx++) {
      let [r, g, b, a] = getPixel(8 + tx, ty);
      if (a < 20) {
        const si = (ty * 8 + tx) * 3;
        r = STEVE_BASE_TOP[si]; g = STEVE_BASE_TOP[si + 1]; b = STEVE_BASE_TOP[si + 2]; a = 255;
      }
      const getTopP = (x: number, y: number) => ({
        x: (X0 - 8 * dx) + (x + y) * dx,
        y: (Y0 + 8 * dy) + (y - x) * dy
      });
      fillQuad(getTopP(tx, ty), getTopP(tx + 1, ty), getTopP(tx + 1, ty + 1), getTopP(tx, ty + 1), r, g, b, a);
    }
  }

  // Left face (character right cheek/ear, x: 0..7, y: 8..15) - shading 0.72
  for (let sy = 0; sy < 8; sy++) {
    for (let sx = 0; sx < 8; sx++) {
      let [r, g, b, a] = getPixel(sx, 8 + sy);
      if (a < 20) {
        const si = (sy * 8 + sx) * 3;
        r = STEVE_BASE_LEFT[si]; g = STEVE_BASE_LEFT[si + 1]; b = STEVE_BASE_LEFT[si + 2]; a = 255;
      }
      const getLeftP = (x: number, y: number) => ({
        x: (X0 - 8 * dx) + x * dx,
        y: (Y0 + 8 * dy) + x * dy + y * dz
      });
      fillQuad(getLeftP(sx, sy), getLeftP(sx + 1, sy), getLeftP(sx + 1, sy + 1), getLeftP(sx, sy + 1), Math.round(r * 0.72), Math.round(g * 0.72), Math.round(b * 0.72), a);
    }
  }

  // Right face (character front face with eyes, x: 8..15, y: 8..15) - shading 0.88
  for (let fy = 0; fy < 8; fy++) {
    for (let fx = 0; fx < 8; fx++) {
      let [r, g, b, a] = getPixel(8 + fx, 8 + fy);
      if (a < 20) {
        const si = (fy * 8 + fx) * 3;
        r = STEVE_BASE_FRONT[si]; g = STEVE_BASE_FRONT[si + 1]; b = STEVE_BASE_FRONT[si + 2]; a = 255;
      }
      const getFrontP = (x: number, y: number) => ({
        x: X0 + x * dx,
        y: (Y0 + 16 * dy) - x * dy + y * dz
      });
      fillQuad(getFrontP(fx, fy), getFrontP(fx + 1, fy), getFrontP(fx + 1, fy + 1), getFrontP(fx, fy + 1), Math.round(r * 0.88), Math.round(g * 0.88), Math.round(b * 0.88), a);
    }
  }

  // 2. Hat / Outer Layer (with 3D isometric extrusion)
  if (hasHat) {
    const ext = 0.5;
    const scale = 1 + 2 * ext / 8;
    const hdx = dx * scale;
    const hdy = dy * scale;
    const hdz = dz * scale;
    const hX0 = X0;
    const hY0 = Y0 - ext * 2 * dz;

    // Hat Top (x: 40..47, y: 0..7)
    for (let ty = 0; ty < 8; ty++) {
      for (let tx = 0; tx < 8; tx++) {
        const [r, g, b, a] = getPixel(40 + tx, ty);
        const getHatTopP = (x: number, y: number) => ({
          x: (hX0 - 8 * hdx) + (x + y) * hdx,
          y: (hY0 + 8 * hdy) + (y - x) * hdy
        });
        fillQuad(getHatTopP(tx, ty), getHatTopP(tx + 1, ty), getHatTopP(tx + 1, ty + 1), getHatTopP(tx, ty + 1), r, g, b, a);
      }
    }
    // Hat Left (x: 32..39, y: 8..15)
    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) {
        const [r, g, b, a] = getPixel(32 + sx, 8 + sy);
        const getHatLeftP = (x: number, y: number) => ({
          x: (hX0 - 8 * hdx) + x * hdx,
          y: (hY0 + 8 * hdy) + x * hdy + y * hdz
        });
        fillQuad(getHatLeftP(sx, sy), getHatLeftP(sx + 1, sy), getHatLeftP(sx + 1, sy + 1), getHatLeftP(sx, sy + 1), Math.round(r * 0.72), Math.round(g * 0.72), Math.round(b * 0.72), a);
      }
    }
    // Hat Right (x: 40..47, y: 8..15)
    for (let fy = 0; fy < 8; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const [r, g, b, a] = getPixel(40 + fx, 8 + fy);
        const getHatFrontP = (x: number, y: number) => ({
          x: hX0 + fx * hdx,
          y: (hY0 + 16 * hdy) - fx * hdy + fy * hdz
        });
        fillQuad(getHatFrontP(fx, fy), getHatFrontP(fx + 1, fy), getHatFrontP(fx + 1, fy + 1), getHatFrontP(fx, fy + 1), Math.round(r * 0.88), Math.round(g * 0.88), Math.round(b * 0.88), a);
      }
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Downloads a skin image URL either using Rust native fetch (zero CORS) or browser fetch
 */
async function fetchSkinImageSource(url: string): Promise<string> {
  // @ts-ignore
  if (window.electronAPI && typeof window.electronAPI.fetchImageData === 'function') {
    try {
      // @ts-ignore
      const dataUrl = await window.electronAPI.fetchImageData(url);
      if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
        return dataUrl;
      }
    } catch {}
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch {}

  return url;
}

/**
 * Gets candidate URLs for account in priority order
 */
function getCandidateSkinUrls(acc: Account, skinTimestamp?: number): string[] {
  const urls: string[] = [];
  const v = skinTimestamp ? `?v=${skinTimestamp}` : '';

  if (acc.type === 'elyby') {
    urls.push(`https://skinsystem.ely.by/skins/${encodeURIComponent(acc.name)}.png${v}`);
    urls.push(`https://minotar.net/skin/${encodeURIComponent(acc.name)}`);
  } else if (acc.type === 'microsoft') {
    urls.push(`https://minotar.net/skin/${encodeURIComponent(acc.name)}`);
  } else if (acc.type === 'offline') {
    if (acc.skinUrl) {
      // Convert legacy minotar helm url to raw skin url
      const cleanUrl = acc.skinUrl.replace(/\/helm\/([^/]+)\/\d+\.png/, '/skin/$1');
      urls.push(cleanUrl);
    }
  }

  if (acc.skinUrl) {
    const cleanUrl = acc.skinUrl.replace(/\/helm\/([^/]+)\/\d+\.png/, '/skin/$1');
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }

  return urls;
}

async function loadSkinTextureFromCandidates(urls: string[], cacheKey: string): Promise<string> {
  if (headCache.has(cacheKey)) return headCache.get(cacheKey)!;

  for (const url of urls) {
    try {
      const src = await fetchSkinImageSource(url);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Skin load failed: ' + url));
        img.src = src;
      });

      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const cCtx = c.getContext('2d');
      if (!cCtx) continue;

      // Handle legacy 64x32 vs modern 64x64 or HD skins
      if (img.height === 32 || (img.width > 0 && img.height === img.width / 2)) {
        cCtx.drawImage(img, 0, 0, 64, 32);
      } else {
        cCtx.drawImage(img, 0, 0, 64, 64);
      }

      const imgData = cCtx.getImageData(0, 0, 64, 64);
      const rendered = renderIsometricHead(imgData);
      headCache.set(cacheKey, rendered);
      return rendered;
    } catch {
      // Try next candidate url
      continue;
    }
  }

  return DEFAULT_STEVE_HEAD;
}

export const MinecraftFace: React.FC<{
  acc: Account;
  size?: number;
  skinTimestamp?: number;
  style?: React.CSSProperties;
}> = ({ acc, size = 32, skinTimestamp, style }) => {
  const [headUrl, setHeadUrl] = useState<string>(DEFAULT_STEVE_HEAD);

  useEffect(() => {
    let active = true;

    if (acc.type === 'offline' && !acc.skinUrl) {
      setHeadUrl(DEFAULT_STEVE_HEAD);
      return;
    }

    const candidateUrls = getCandidateSkinUrls(acc, skinTimestamp);
    if (candidateUrls.length === 0) {
      setHeadUrl(DEFAULT_STEVE_HEAD);
      return;
    }

    const cacheKey = `${acc.type}_${acc.name}_${candidateUrls[0]}_${skinTimestamp || ''}`;
    if (headCache.has(cacheKey)) {
      setHeadUrl(headCache.get(cacheKey)!);
      return;
    }

    loadSkinTextureFromCandidates(candidateUrls, cacheKey).then((url) => {
      if (active) {
        setHeadUrl(url);
      }
    });

    return () => {
      active = false;
    };
  }, [acc.name, acc.type, acc.skinUrl, skinTimestamp]);

  return (
    <img
      src={headUrl}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        imageRendering: 'pixelated',
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: 0,
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
        ...style
      }}
      alt={acc.name || 'Skin'}
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = DEFAULT_STEVE_HEAD;
      }}
    />
  );
};

export default MinecraftFace;

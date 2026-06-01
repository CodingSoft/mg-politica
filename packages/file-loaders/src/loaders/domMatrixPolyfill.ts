/**
 * Pure-JS DOMMatrix polyfill for environments where @napi-rs/canvas is unavailable
 * (e.g. Docker containers without native Skia binaries).
 *
 * Supports the subset of DOMMatrix used by pdfjs-dist 5.x for text extraction:
 * - new DOMMatrix() / new DOMMatrix(init) / new DOMMatrix(string)
 * - .inverse() / .invertSelf()
 * - .preMultiplySelf() / .multiplySelf()
 * - .translate() / .scale() / .rotate() / .rotateSelf()
 * - .a / .b / .c / .d / .e / .f (2D properties)
 * - .is2D / .isIdentity
 *
 * Visual canvas rendering won't work without @napi-rs/canvas,
 * but text extraction from PDFs works correctly.
 */

// Column-major layout used by DOMMatrix spec:
// m[0]=m11/a m[1]=m12/b m[2]=m13 m[3]=m14
// m[4]=m21/c m[5]=m22/d m[6]=m23 m[7]=m24
// m[8]=m31 m[9]=m32 m[10]=m33 m[11]=m34
// m[12]=m41/e m[13]=m42/f m[14]=m43 m[15]=m44

const initMatrix = () => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const parseMatrixInit = (init: any): Float64Array => {
  const m = initMatrix();
  if (init === undefined || init === null) return m;
  if (typeof init === 'string') {
    // Parse "matrix(a, b, c, d, e, f)" or "matrix3d(...)" or "none"
    const s = init.trim();
    if (s === 'none' || s === '') return m;
    const matrixMatch = s.match(
      /^matrix\(\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^)\s]+)\s*\)$/,
    );
    if (matrixMatch) {
      const [, a, b, c, d, e, f] = matrixMatch.map(Number);
      m[0] = a;
      m[1] = b;
      m[2] = 0;
      m[3] = 0;
      m[4] = c;
      m[5] = d;
      m[6] = 0;
      m[7] = 0;
      m[8] = 0;
      m[9] = 0;
      m[10] = 1;
      m[11] = 0;
      m[12] = e;
      m[13] = f;
      m[14] = 0;
      m[15] = 1;
      return m;
    }
    const matrix3dMatch = s.match(/^matrix3d\(([^)]+)\)$/);
    if (matrix3dMatch) {
      const vals = matrix3dMatch[1].split(',').map((v: string) => Number(v.trim()));
      for (let i = 0; i < 16 && i < vals.length; i++) m[i] = vals[i];
      return m;
    }
    // Try comma/space separated values
    const vals = s.split(/[\s,]+/).map(Number);
    if (vals.length === 6) {
      m[0] = vals[0]; // a/m11
      m[1] = vals[1]; // b/m12
      m[4] = vals[2]; // c/m21
      m[5] = vals[3]; // d/m22
      m[12] = vals[4]; // e/m41
      m[13] = vals[5]; // f/m42
    } else if (vals.length >= 16) {
      for (let i = 0; i < 16; i++) m[i] = vals[i];
    }
    return m;
  }
  if (Array.isArray(init) || ArrayBuffer.isView(init)) {
    const src = init as number[];
    if (src.length === 6) {
      m[0] = src[0]; // a/m11
      m[1] = src[1]; // b/m12
      m[4] = src[2]; // c/m21
      m[5] = src[3]; // d/m22
      m[12] = src[4]; // e/m41
      m[13] = src[5]; // f/m42
    } else {
      for (let i = 0; i < 16 && i < src.length; i++) m[i] = src[i];
    }
    return m;
  }
  // Handle DOMMatrix-like objects
  if (init && typeof init === 'object') {
    if ('_m' in init) {
      // DOMMatrixPolyfill instance
      const src = (init as DOMMatrixPolyfill)._m;
      for (let i = 0; i < 16; i++) m[i] = src[i];
      return m;
    }
    if ('m11' in init) {
      // Native DOMMatrix or any object with m11..m44 properties
      const o = init as any;
      m[0] = o.m11 ?? 0;
      m[1] = o.m12 ?? 0;
      m[2] = o.m13 ?? 0;
      m[3] = o.m14 ?? 0;
      m[4] = o.m21 ?? 0;
      m[5] = o.m22 ?? 0;
      m[6] = o.m23 ?? 0;
      m[7] = o.m24 ?? 0;
      m[8] = o.m31 ?? 0;
      m[9] = o.m32 ?? 0;
      m[10] = o.m33 ?? 0;
      m[11] = o.m34 ?? 0;
      m[12] = o.m41 ?? 0;
      m[13] = o.m42 ?? 0;
      m[14] = o.m43 ?? 0;
      m[15] = o.m44 ?? 0;
      return m;
    }
  }
  return m;
};

const multiply = (a: Float64Array, b: Float64Array): Float64Array => {
  // Column-major 4x4 matrix multiply: result = a * b
  // Element at row r, column c is stored at index [c*4 + r]
  // result[c*4+r] = sum_k a[k*4+r] * b[c*4+k]
  const r = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      r[c * 4 + row] =
        a[0 * 4 + row] * b[c * 4 + 0] +
        a[1 * 4 + row] * b[c * 4 + 1] +
        a[2 * 4 + row] * b[c * 4 + 2] +
        a[3 * 4 + row] * b[c * 4 + 3];
    }
  }
  return r;
};

type DOMMatrixLike = DOMMatrixPolyfill | string | number[] | Float64Array;

export class DOMMatrixPolyfill {
  _m: Float64Array;

  constructor(init?: any) {
    this._m = parseMatrixInit(init);
  }

  // 2D shortcut properties (column-major)
  get a() {
    return this._m[0];
  }
  set a(v) {
    this._m[0] = v;
  }
  get b() {
    return this._m[1];
  }
  set b(v) {
    this._m[1] = v;
  }
  get c() {
    return this._m[4];
  }
  set c(v) {
    this._m[4] = v;
  }
  get d() {
    return this._m[5];
  }
  set d(v) {
    this._m[5] = v;
  }
  get e() {
    return this._m[12];
  }
  set e(v) {
    this._m[12] = v;
  }
  get f() {
    return this._m[13];
  }
  set f(v) {
    this._m[13] = v;
  }

  // 3D properties
  get m11() {
    return this._m[0];
  }
  get m12() {
    return this._m[1];
  }
  get m13() {
    return this._m[2];
  }
  get m14() {
    return this._m[3];
  }
  get m21() {
    return this._m[4];
  }
  get m22() {
    return this._m[5];
  }
  get m23() {
    return this._m[6];
  }
  get m24() {
    return this._m[7];
  }
  get m31() {
    return this._m[8];
  }
  get m32() {
    return this._m[9];
  }
  get m33() {
    return this._m[10];
  }
  get m34() {
    return this._m[11];
  }
  get m41() {
    return this._m[12];
  }
  get m42() {
    return this._m[13];
  }
  get m43() {
    return this._m[14];
  }
  get m44() {
    return this._m[15];
  }

  get is2D() {
    return (
      this._m[2] === 0 &&
      this._m[3] === 0 &&
      this._m[6] === 0 &&
      this._m[7] === 0 &&
      this._m[8] === 0 &&
      this._m[9] === 0 &&
      this._m[10] === 1 &&
      this._m[11] === 0 &&
      this._m[14] === 0 &&
      this._m[15] === 1
    );
  }

  get isIdentity() {
    return (
      this._m[0] === 1 &&
      this._m[1] === 0 &&
      this._m[2] === 0 &&
      this._m[3] === 0 &&
      this._m[4] === 0 &&
      this._m[5] === 1 &&
      this._m[6] === 0 &&
      this._m[7] === 0 &&
      this._m[8] === 0 &&
      this._m[9] === 0 &&
      this._m[10] === 1 &&
      this._m[11] === 0 &&
      this._m[12] === 0 &&
      this._m[13] === 0 &&
      this._m[14] === 0 &&
      this._m[15] === 1
    );
  }

  multiply(other: DOMMatrixLike): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill('')._setMatrix(multiply(this._m, parseMatrixInit(other)));
  }

  multiplySelf(other: DOMMatrixLike): this {
    // multiplySelf: this = this * other
    this._m = multiply(this._m, parseMatrixInit(other));
    return this;
  }

  preMultiplySelf(other: DOMMatrixLike): this {
    // preMultiplySelf: this = other * this
    this._m = multiply(parseMatrixInit(other), this._m);
    return this;
  }

  inverse(): DOMMatrixPolyfill {
    const inv = this._inverse();
    return new DOMMatrixPolyfill('')._setMatrix(inv);
  }

  invertSelf(): this {
    this._m = this._inverse();
    return this;
  }

  translate(tx = 0, ty = 0, tz = 0): DOMMatrixPolyfill {
    const t = initMatrix();
    t[12] = tx;
    t[13] = ty;
    t[14] = tz;
    const result = new DOMMatrixPolyfill('');
    result._m = multiply(this._m, t);
    return result;
  }

  scale(
    scaleX = 1,
    scaleY?: number,
    scaleZ = 1,
    _originX = 0,
    _originY = 0,
    _originZ = 0,
  ): DOMMatrixPolyfill {
    const sy = scaleY ?? scaleX;
    const t = initMatrix();
    t[0] = scaleX;
    t[5] = sy;
    t[10] = scaleZ;
    const result = new DOMMatrixPolyfill('');
    result._m = multiply(this._m, t);
    return result;
  }

  rotate(rotX = 0, rotY?: number, rotZ?: number): DOMMatrixPolyfill {
    // DOMMatrix.rotate signature: rotate(rotX, rotY, rotZ)
    // If only 1 arg, it's a 2D rotation around Z axis
    let rz: number, ry: number, rx: number;
    if (rotY === undefined && rotZ === undefined) {
      rz = rotX;
      ry = 0;
      rx = 0;
    } else {
      rx = rotX;
      ry = rotY ?? 0;
      rz = rotZ ?? 0;
    }
    const result = this._clone();
    if (rz) result._rotateAxisAngle(0, 0, 1, rz);
    if (ry) result._rotateAxisAngle(0, 1, 0, ry);
    if (rx) result._rotateAxisAngle(1, 0, 0, rx);
    return result;
  }

  rotateSelf(rotX = 0, rotY?: number, rotZ?: number): this {
    let rz: number, ry: number, rx: number;
    if (rotY === undefined && rotZ === undefined) {
      rz = rotX;
      ry = 0;
      rx = 0;
    } else {
      rx = rotX;
      ry = rotY ?? 0;
      rz = rotZ ?? 0;
    }
    if (rz) this._rotateAxisAngle(0, 0, 1, rz);
    if (ry) this._rotateAxisAngle(0, 1, 0, ry);
    if (rx) this._rotateAxisAngle(1, 0, 0, rx);
    return this;
  }

  toString(): string {
    if (this.is2D) {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
    return `matrix3d(${Array.from(this._m).join(', ')})`;
  }

  setMatrixValue(init: string): this {
    this._m = parseMatrixInit(init);
    return this;
  }

  skewX(sx = 0): DOMMatrixPolyfill {
    const result = this._clone();
    const t = initMatrix();
    t[4] = Math.tan((sx * Math.PI) / 180);
    result._m = multiply(result._m, t);
    return result;
  }

  skewY(sy = 0): DOMMatrixPolyfill {
    const result = this._clone();
    const t = initMatrix();
    t[1] = Math.tan((sy * Math.PI) / 180);
    result._m = multiply(result._m, t);
    return result;
  }

  // --- internal helpers ---

  _setMatrix(m: Float64Array): this {
    this._m = m;
    return this;
  }

  _clone(): DOMMatrixPolyfill {
    const c = new DOMMatrixPolyfill();
    c._m = new Float64Array(this._m);
    return c;
  }

  _rotateAxisAngle(x: number, y: number, z: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len === 0) return;
    const nx = x / len,
      ny = y / len,
      nz = z / len;
    // Rotation matrix (column-major)
    const r = new Float64Array(16);
    r[0] = cos + nx * nx * (1 - cos);
    r[1] = ny * nx * (1 - cos) + nz * sin;
    r[2] = nz * nx * (1 - cos) - ny * sin;
    r[3] = 0;
    r[4] = nx * ny * (1 - cos) - nz * sin;
    r[5] = cos + ny * ny * (1 - cos);
    r[6] = nz * ny * (1 - cos) + nx * sin;
    r[7] = 0;
    r[8] = nx * nz * (1 - cos) + ny * sin;
    r[9] = ny * nz * (1 - cos) - nx * sin;
    r[10] = cos + nz * nz * (1 - cos);
    r[11] = 0;
    r[12] = 0;
    r[13] = 0;
    r[14] = 0;
    r[15] = 1;
    this._m = multiply(this._m, r);
  }

  _inverse(): Float64Array {
    const m = this._m;
    const inv = new Float64Array(16);

    inv[0] =
      m[5] * m[10] * m[15] -
      m[5] * m[11] * m[14] -
      m[9] * m[6] * m[15] +
      m[9] * m[7] * m[14] +
      m[13] * m[6] * m[11] -
      m[13] * m[7] * m[10];
    inv[4] =
      -m[4] * m[10] * m[15] +
      m[4] * m[11] * m[14] +
      m[8] * m[6] * m[15] -
      m[8] * m[7] * m[14] -
      m[12] * m[6] * m[11] +
      m[12] * m[7] * m[10];
    inv[8] =
      m[4] * m[9] * m[15] -
      m[4] * m[11] * m[13] -
      m[8] * m[5] * m[15] +
      m[8] * m[7] * m[13] +
      m[12] * m[5] * m[11] -
      m[12] * m[7] * m[9];
    inv[12] =
      -m[4] * m[9] * m[14] +
      m[4] * m[10] * m[13] +
      m[8] * m[5] * m[14] -
      m[8] * m[6] * m[13] -
      m[12] * m[5] * m[10] +
      m[12] * m[6] * m[9];
    inv[1] =
      -m[1] * m[10] * m[15] +
      m[1] * m[11] * m[14] +
      m[9] * m[2] * m[15] -
      m[9] * m[3] * m[14] -
      m[13] * m[2] * m[11] +
      m[13] * m[3] * m[10];
    inv[5] =
      m[0] * m[10] * m[15] -
      m[0] * m[11] * m[14] -
      m[8] * m[2] * m[15] +
      m[8] * m[3] * m[14] +
      m[12] * m[2] * m[11] -
      m[12] * m[3] * m[10];
    inv[9] =
      -m[0] * m[9] * m[15] +
      m[0] * m[11] * m[13] +
      m[8] * m[1] * m[15] -
      m[8] * m[3] * m[13] -
      m[12] * m[1] * m[11] +
      m[12] * m[3] * m[9];
    inv[13] =
      m[0] * m[9] * m[14] -
      m[0] * m[10] * m[13] -
      m[8] * m[1] * m[14] +
      m[8] * m[2] * m[13] +
      m[12] * m[1] * m[10] -
      m[12] * m[2] * m[9];
    inv[2] =
      m[1] * m[6] * m[15] -
      m[1] * m[7] * m[14] -
      m[5] * m[2] * m[15] +
      m[5] * m[3] * m[14] +
      m[13] * m[2] * m[7] -
      m[13] * m[3] * m[6];
    inv[6] =
      -m[0] * m[6] * m[15] +
      m[0] * m[7] * m[14] +
      m[4] * m[2] * m[15] -
      m[4] * m[3] * m[14] -
      m[12] * m[2] * m[7] +
      m[12] * m[3] * m[6];
    inv[10] =
      m[0] * m[5] * m[15] -
      m[0] * m[7] * m[13] -
      m[4] * m[1] * m[15] +
      m[4] * m[3] * m[13] +
      m[12] * m[1] * m[7] -
      m[12] * m[3] * m[5];
    inv[14] =
      -m[0] * m[5] * m[14] +
      m[0] * m[6] * m[13] +
      m[4] * m[1] * m[14] -
      m[4] * m[2] * m[13] -
      m[12] * m[1] * m[6] +
      m[12] * m[2] * m[5];
    inv[3] =
      -m[1] * m[6] * m[11] +
      m[1] * m[7] * m[10] +
      m[5] * m[2] * m[11] -
      m[5] * m[3] * m[10] -
      m[9] * m[2] * m[7] +
      m[9] * m[3] * m[6];
    inv[7] =
      m[0] * m[6] * m[11] -
      m[0] * m[7] * m[10] -
      m[4] * m[2] * m[11] +
      m[4] * m[3] * m[10] +
      m[8] * m[2] * m[7] -
      m[8] * m[3] * m[6];
    inv[11] =
      -m[0] * m[5] * m[11] +
      m[0] * m[7] * m[9] +
      m[4] * m[1] * m[11] -
      m[4] * m[3] * m[9] -
      m[8] * m[1] * m[7] +
      m[8] * m[3] * m[5];
    inv[15] =
      m[0] * m[5] * m[10] -
      m[0] * m[6] * m[9] -
      m[4] * m[1] * m[10] +
      m[4] * m[2] * m[9] +
      m[8] * m[1] * m[6] -
      m[8] * m[2] * m[5];

    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    if (det === 0) return initMatrix(); // Singular matrix, return identity
    det = 1 / det;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  }
}

/**
 * Install DOMMatrix/DOMPoint/DOMRect/Path2D polyfills on globalThis
 * if they don't already exist. Only needed for environments without
 * @napi-rs/canvas (e.g. Docker containers without native Skia binaries).
 */
export function polyfillDOMMatrixPureJS() {
  if (typeof globalThis.DOMMatrix !== 'undefined') return;

  globalThis.DOMMatrix = DOMMatrixPolyfill as any;

  // Minimal DOMPoint polyfill (used by pdfjs-dist)
  if (typeof globalThis.DOMPoint === 'undefined') {
    class DOMPointPolyfill {
      x: number;
      y: number;
      z: number;
      w: number;
      constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
      }
      matrixTransform(m: any): DOMPointPolyfill {
        const mat = m?._m || parseMatrixInit(m);
        return new DOMPointPolyfill(
          mat[0] * this.x + mat[4] * this.y + mat[8] * this.z + mat[12] * this.w,
          mat[1] * this.x + mat[5] * this.y + mat[9] * this.z + mat[13] * this.w,
          mat[2] * this.x + mat[6] * this.y + mat[10] * this.z + mat[14] * this.w,
          mat[3] * this.x + mat[7] * this.y + mat[11] * this.z + mat[15] * this.w,
        );
      }
    }
    globalThis.DOMPoint = DOMPointPolyfill as any;
  }

  // Minimal DOMRect polyfill
  if (typeof globalThis.DOMRect === 'undefined') {
    class DOMRectPolyfill {
      x: number;
      y: number;
      width: number;
      height: number;
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
      }
      get top() {
        return this.y;
      }
      get left() {
        return this.x;
      }
      get bottom() {
        return this.y + this.height;
      }
      get right() {
        return this.x + this.width;
      }
    }
    globalThis.DOMRect = DOMRectPolyfill as any;
  }

  // Minimal Path2D polyfill (stub — only needed so pdfjs-dist doesn't crash on import)
  if (typeof globalThis.Path2D === 'undefined') {
    class Path2DPolyfill {
      addPath(_path: any, _transform?: any) {
        // Stub — visual rendering won't work without @napi-rs/canvas
      }
    }
    globalThis.Path2D = Path2DPolyfill as any;
  }
}

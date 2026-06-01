// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DOMMatrixPolyfill, polyfillDOMMatrixPureJS } from './domMatrixPolyfill';

// Save original globals
const origDOMMatrix = globalThis.DOMMatrix;
const origDOMPoint = globalThis.DOMPoint;
const origDOMRect = globalThis.DOMRect;
const origPath2D = globalThis.Path2D;

// Force-polyfill: remove native DOMMatrix if present, then apply polyfill
beforeAll(() => {
  delete (globalThis as any).DOMMatrix;
  delete (globalThis as any).DOMPoint;
  delete (globalThis as any).DOMRect;
  delete (globalThis as any).Path2D;
  polyfillDOMMatrixPureJS();
});

afterAll(() => {
  if (origDOMMatrix !== undefined) globalThis.DOMMatrix = origDOMMatrix;
  else delete (globalThis as any).DOMMatrix;
  if (origDOMPoint !== undefined) globalThis.DOMPoint = origDOMPoint;
  else delete (globalThis as any).DOMPoint;
  if (origDOMRect !== undefined) globalThis.DOMRect = origDOMRect;
  else delete (globalThis as any).DOMRect;
  if (origPath2D !== undefined) globalThis.Path2D = origPath2D;
  else delete (globalThis as any).Path2D;
});

// Helper: compare with tolerance
function approxEqual(a: number, b: number, tolerance = 1e-10) {
  expect(Math.abs(a - b)).toBeLessThan(tolerance);
}

function expectMatrix2D(m: any, a: number, b: number, c: number, d: number, e: number, f: number) {
  approxEqual(m.a, a);
  approxEqual(m.b, b);
  approxEqual(m.c, c);
  approxEqual(m.d, d);
  approxEqual(m.e, e);
  approxEqual(m.f, f);
}

describe('DOMMatrix Polyfill', () => {
  describe('constructor', () => {
    it('should create identity matrix with no arguments', () => {
      const m = new DOMMatrixPolyfill();
      expect(m.isIdentity).toBe(true);
      expect(m.is2D).toBe(true);
      expectMatrix2D(m, 1, 0, 0, 1, 0, 0);
    });

    it('should create matrix from CSS matrix() string', () => {
      const m = new DOMMatrixPolyfill('matrix(2, 1, 0.5, 3, 10, 20)');
      expectMatrix2D(m, 2, 1, 0.5, 3, 10, 20);
    });

    it('should handle whitespace in CSS matrix() string', () => {
      const m = new DOMMatrixPolyfill('matrix( 2 , 1 , 0.5 , 3 , 10 , 20 )');
      expectMatrix2D(m, 2, 1, 0.5, 3, 10, 20);
    });

    it('should return identity for "none" string', () => {
      const m = new DOMMatrixPolyfill('none');
      expect(m.isIdentity).toBe(true);
    });

    it('should return identity for empty string', () => {
      const m = new DOMMatrixPolyfill('');
      expect(m.isIdentity).toBe(true);
    });

    it('should create matrix from array of 6 values', () => {
      const m = new DOMMatrixPolyfill([2, 1, 0.5, 3, 10, 20]);
      expectMatrix2D(m, 2, 1, 0.5, 3, 10, 20);
    });

    it('should create matrix from Float64Array of 6 values', () => {
      const m = new DOMMatrixPolyfill(new Float64Array([2, 1, 0.5, 3, 10, 20]));
      expectMatrix2D(m, 2, 1, 0.5, 3, 10, 20);
    });

    it('should create matrix from another DOMMatrixPolyfill instance', () => {
      const orig = new DOMMatrixPolyfill('matrix(2, 1, 0.5, 3, 10, 20)');
      const copy = new DOMMatrixPolyfill(orig);
      expectMatrix2D(copy, 2, 1, 0.5, 3, 10, 20);
    });

    it('should create matrix from object with m11..m44 properties', () => {
      const m = new DOMMatrixPolyfill({
        m11: 2,
        m12: 1,
        m13: 0,
        m14: 0,
        m21: 0.5,
        m22: 3,
        m23: 0,
        m24: 0,
        m31: 0,
        m32: 0,
        m33: 1,
        m34: 0,
        m41: 10,
        m42: 20,
        m43: 0,
        m44: 1,
      });
      expectMatrix2D(m, 2, 1, 0.5, 3, 10, 20);
    });

    it('should create matrix from matrix3d() string', () => {
      const m = new DOMMatrixPolyfill('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 10, 0, 1)');
      approxEqual(m.e, 5);
      approxEqual(m.f, 10);
    });
  });

  describe('2D properties', () => {
    it('a, b, c, d, e, f getters work', () => {
      const m = new DOMMatrixPolyfill('matrix(2, 3, 4, 5, 6, 7)');
      expect(m.a).toBe(2);
      expect(m.b).toBe(3);
      expect(m.c).toBe(4);
      expect(m.d).toBe(5);
      expect(m.e).toBe(6);
      expect(m.f).toBe(7);
    });

    it('a, b, c, d, e, f setters work', () => {
      const m = new DOMMatrixPolyfill();
      m.a = 2;
      m.b = 3;
      m.c = 4;
      m.d = 5;
      m.e = 6;
      m.f = 7;
      expectMatrix2D(m, 2, 3, 4, 5, 6, 7);
    });
  });

  describe('3D properties', () => {
    it('m11..m44 getters work on identity matrix', () => {
      const m = new DOMMatrixPolyfill();
      expect(m.m11).toBe(1);
      expect(m.m12).toBe(0);
      expect(m.m22).toBe(1);
      expect(m.m33).toBe(1);
      expect(m.m44).toBe(1);
      expect(m.m41).toBe(0);
    });

    it('m41/m42 map to e/f', () => {
      const m = new DOMMatrixPolyfill('matrix(1, 0, 0, 1, 10, 20)');
      expect(m.m41).toBe(10);
      expect(m.m42).toBe(20);
    });
  });

  describe('is2D and isIdentity', () => {
    it('identity is 2D and identity', () => {
      const m = new DOMMatrixPolyfill();
      expect(m.is2D).toBe(true);
      expect(m.isIdentity).toBe(true);
    });

    it('translated matrix is 2D but not identity', () => {
      const m = new DOMMatrixPolyfill('matrix(1, 0, 0, 1, 5, 10)');
      expect(m.is2D).toBe(true);
      expect(m.isIdentity).toBe(false);
    });
  });

  describe('multiply', () => {
    it('identity * matrix = matrix', () => {
      const identity = new DOMMatrixPolyfill();
      const m = new DOMMatrixPolyfill('matrix(2, 1, 0.5, 3, 10, 20)');
      const result = identity.multiply(m);
      expectMatrix2D(result, 2, 1, 0.5, 3, 10, 20);
    });

    it('matrix * identity = matrix', () => {
      const m = new DOMMatrixPolyfill('matrix(2, 1, 0.5, 3, 10, 20)');
      const identity = new DOMMatrixPolyfill();
      const result = m.multiply(identity);
      expectMatrix2D(result, 2, 1, 0.5, 3, 10, 20);
    });

    it('scale(2) * scale(3) = scale(6)', () => {
      const a = new DOMMatrixPolyfill();
      a.a = 2;
      a.d = 2;
      const b = new DOMMatrixPolyfill();
      b.a = 3;
      b.d = 3;
      const result = a.multiply(b);
      approxEqual(result.a, 6);
      approxEqual(result.d, 6);
    });

    it('multiplySelf: this = this * other', () => {
      const m = new DOMMatrixPolyfill();
      m.a = 2;
      m.d = 2;
      const other = new DOMMatrixPolyfill();
      other.a = 3;
      other.d = 3;
      m.multiplySelf(other);
      approxEqual(m.a, 6);
      approxEqual(m.d, 6);
    });

    it('preMultiplySelf: this = other * this', () => {
      const m = new DOMMatrixPolyfill();
      m.a = 2;
      m.d = 2;
      const other = new DOMMatrixPolyfill();
      other.a = 3;
      other.d = 3;
      m.preMultiplySelf(other);
      approxEqual(m.a, 6);
      approxEqual(m.d, 6);
    });

    it('multiplySelf vs preMultiplySelf differ with translation', () => {
      const m1 = new DOMMatrixPolyfill('matrix(2, 0, 0, 2, 0, 0)');
      const m2 = new DOMMatrixPolyfill('matrix(2, 0, 0, 2, 0, 0)');
      const translate = new DOMMatrixPolyfill('matrix(1, 0, 0, 1, 10, 20)');

      // multiplySelf: this * other = scale(2) * translate(10,20)
      // result: a=2, d=2, e=20, f=40
      m1.multiplySelf(translate);
      approxEqual(m1.a, 2);
      approxEqual(m1.d, 2);
      approxEqual(m1.e, 20);
      approxEqual(m1.f, 40);

      // preMultiplySelf: other * this = translate(10,20) * scale(2)
      // result: a=2, d=2, e=10, f=20
      m2.preMultiplySelf(translate);
      approxEqual(m2.a, 2);
      approxEqual(m2.d, 2);
      approxEqual(m2.e, 10);
      approxEqual(m2.f, 20);
    });
  });

  describe('inverse', () => {
    it('inverse of identity is identity', () => {
      const m = new DOMMatrixPolyfill();
      const inv = m.inverse();
      expect(inv.isIdentity).toBe(true);
    });

    it('inverse of scale(2) is scale(0.5)', () => {
      const m = new DOMMatrixPolyfill();
      m.a = 2;
      m.d = 2;
      const inv = m.inverse();
      approxEqual(inv.a, 0.5);
      approxEqual(inv.d, 0.5);
    });

    it('inverse of translate(10,20) is translate(-10,-20)', () => {
      const m = new DOMMatrixPolyfill('matrix(1, 0, 0, 1, 10, 20)');
      const inv = m.inverse();
      approxEqual(inv.e, -10);
      approxEqual(inv.f, -20);
    });

    it('invertSelf modifies in place', () => {
      const m = new DOMMatrixPolyfill('matrix(1, 0, 0, 1, 10, 20)');
      m.invertSelf();
      approxEqual(m.e, -10);
      approxEqual(m.f, -20);
    });

    it('inverse of singular matrix returns identity', () => {
      const m = new DOMMatrixPolyfill('matrix(0, 0, 0, 0, 0, 0)');
      const inv = m.inverse();
      expect(inv.isIdentity).toBe(true);
    });
  });

  describe('translate', () => {
    it('translates by tx, ty', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.translate(10, 20);
      approxEqual(result.e, 10);
      approxEqual(result.f, 20);
      expect(m.isIdentity).toBe(true);
    });

    it('translate after scale', () => {
      const m = new DOMMatrixPolyfill();
      m.a = 2;
      m.d = 2;
      const result = m.translate(10, 20);
      // scale(2) * translate(10,20) = e=20, f=40
      approxEqual(result.a, 2);
      approxEqual(result.d, 2);
      approxEqual(result.e, 20);
      approxEqual(result.f, 40);
    });
  });

  describe('scale', () => {
    it('scale(sx) scales both x and y by sx when only one arg', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.scale(3);
      approxEqual(result.a, 3);
      approxEqual(result.d, 3);
    });

    it('scale(sx, sy) scales x and y separately', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.scale(2, 3);
      approxEqual(result.a, 2);
      approxEqual(result.d, 3);
    });

    it('original not modified', () => {
      const m = new DOMMatrixPolyfill();
      m.scale(5);
      expect(m.isIdentity).toBe(true);
    });
  });

  describe('rotate', () => {
    it('rotate(90) rotates 90 degrees around Z', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.rotate(90);
      approxEqual(result.a, 0, 1e-10);
      approxEqual(result.b, 1, 1e-10);
      approxEqual(result.c, -1, 1e-10);
      approxEqual(result.d, 0, 1e-10);
    });

    it('rotate(180) rotates 180 degrees', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.rotate(180);
      approxEqual(result.a, -1, 1e-10);
      approxEqual(result.d, -1, 1e-10);
    });

    it('rotate(0) returns identity', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.rotate(0);
      expect(result.isIdentity).toBe(true);
    });
  });

  describe('toString', () => {
    it('returns CSS matrix() for 2D matrix', () => {
      const m = new DOMMatrixPolyfill('matrix(1, 0, 0, 1, 10, 20)');
      const s = m.toString();
      expect(s).toMatch(/^matrix\(/);
      expect(s).toContain('10');
      expect(s).toContain('20');
    });

    it('returns matrix3d() for 3D matrix', () => {
      const m = new DOMMatrixPolyfill([
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        2,
        0, // m33=2 makes it 3D
        0,
        0,
        0,
        1,
      ]);
      const s = m.toString();
      expect(s).toMatch(/^matrix3d\(/);
    });
  });

  describe('setMatrixValue', () => {
    it('parses CSS matrix() string', () => {
      const m = new DOMMatrixPolyfill();
      m.setMatrixValue('matrix(2, 1, 0.5, 3, 10, 20)');
      expectMatrix2D(m, 2, 1, 0.5, 3, 10, 20);
    });

    it('resets to identity for "none"', () => {
      const m = new DOMMatrixPolyfill('matrix(2, 1, 0.5, 3, 10, 20)');
      m.setMatrixValue('none');
      expect(m.isIdentity).toBe(true);
    });
  });

  describe('skewX and skewY', () => {
    it('skewX modifies c property', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.skewX(45);
      approxEqual(result.c, 1, 1e-10);
    });

    it('skewY modifies b property', () => {
      const m = new DOMMatrixPolyfill();
      const result = m.skewY(45);
      approxEqual(result.b, 1, 1e-10);
    });
  });

  describe('DOMPoint polyfill', () => {
    it('creates point with default values', () => {
      const DOMPoint = globalThis.DOMPoint as any;
      const p = new DOMPoint();
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
      expect(p.z).toBe(0);
      expect(p.w).toBe(1);
    });

    it('creates point with specified values', () => {
      const DOMPoint = globalThis.DOMPoint as any;
      const p = new DOMPoint(10, 20, 5, 1);
      expect(p.x).toBe(10);
      expect(p.y).toBe(20);
      expect(p.z).toBe(5);
      expect(p.w).toBe(1);
    });

    it('matrixTransform with identity returns same point', () => {
      const DOMPoint = globalThis.DOMPoint as any;
      const p = new DOMPoint(10, 20, 0, 1);
      const m = new DOMMatrixPolyfill();
      const result = p.matrixTransform(m);
      approxEqual(result.x, 10);
      approxEqual(result.y, 20);
    });

    it('matrixTransform with translation', () => {
      const DOMPoint = globalThis.DOMPoint as any;
      const p = new DOMPoint(5, 10, 0, 1);
      const m = new DOMMatrixPolyfill('matrix(1, 0, 0, 1, 100, 200)');
      const result = p.matrixTransform(m);
      approxEqual(result.x, 105);
      approxEqual(result.y, 210);
    });
  });

  describe('DOMRect polyfill', () => {
    it('creates rect with default values', () => {
      const DOMRect = globalThis.DOMRect as any;
      const r = new DOMRect();
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
      expect(r.width).toBe(0);
      expect(r.height).toBe(0);
    });

    it('computes top, left, bottom, right', () => {
      const DOMRect = globalThis.DOMRect as any;
      const r = new DOMRect(10, 20, 100, 50);
      expect(r.left).toBe(10);
      expect(r.top).toBe(20);
      expect(r.right).toBe(110);
      expect(r.bottom).toBe(70);
    });
  });

  describe('Path2D polyfill', () => {
    it('exists and has addPath method', () => {
      const Path2D = globalThis.Path2D as any;
      const p = new Path2D();
      expect(typeof p.addPath).toBe('function');
    });
  });

  describe('column-major correctness verification', () => {
    it('CSS matrix(2,0,0,1,10,20) → a=2,d=1,e=10,f=20', () => {
      const m = new DOMMatrixPolyfill('matrix(2, 0, 0, 1, 10, 20)');
      expect(m.a).toBe(2);
      expect(m.d).toBe(1);
      expect(m.e).toBe(10);
      expect(m.f).toBe(20);
    });

    it('CSS matrix(1,2,3,4,5,6) → standard DOMMatrix values', () => {
      const m = new DOMMatrixPolyfill('matrix(1, 2, 3, 4, 5, 6)');
      expect(m.a).toBe(1);
      expect(m.b).toBe(2);
      expect(m.c).toBe(3);
      expect(m.d).toBe(4);
      expect(m.e).toBe(5);
      expect(m.f).toBe(6);
    });

    it('translate(10,20) then scale(2) gives correct result', () => {
      const m = new DOMMatrixPolyfill();
      const translated = m.translate(10, 20);
      const scaled = translated.scale(2);
      approxEqual(scaled.a, 2);
      approxEqual(scaled.d, 2);
      approxEqual(scaled.e, 10);
      approxEqual(scaled.f, 20);
    });
  });
});

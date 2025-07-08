/* To rebuild math-dist.js:

    npm ci
    npx rollup -c

*/

import acos from "@stdlib/math/base/special/acos";
import acosh from "@stdlib/math/base/special/acosh";
import asin from "@stdlib/math/base/special/asin";
import asinh from "@stdlib/math/base/special/asinh";
import atan from "@stdlib/math/base/special/atan";
import atanh from "@stdlib/math/base/special/atanh";
import atan2 from "@stdlib/math/base/special/atan2";
import cbrt from "@stdlib/math/base/special/cbrt";
import cos from "@stdlib/math/base/special/cos";
import cosh from "@stdlib/math/base/special/cosh";
import exp from "@stdlib/math/base/special/exp";
import expm1 from "@stdlib/math/base/special/expm1";
import log from "@stdlib/math/base/special/ln";      // ln because stdlib.log() has 2 args
import log1p from "@stdlib/math/base/special/log1p";
import log10 from "@stdlib/math/base/special/log10";
import log2 from "@stdlib/math/base/special/log2";
import sin from "@stdlib/math/base/special/sin";
import sinh from "@stdlib/math/base/special/sinh";
import tan from "@stdlib/math/base/special/tan";
import tanh from "@stdlib/math/base/special/tanh";

if (typeof globalThis.CroquetMath === "undefined") globalThis.CroquetMath = {};

Object.assign(globalThis.CroquetMath, { acos, acosh, asin, asinh, atan, atanh, atan2, cbrt, cos, cosh, exp, expm1, log, log1p, log10, log2, sin, sinh, tan, tanh });

// workaround for iOS Safari bug giving inconsistent results for stdlib's pow()
//globalThis.CroquetMath.pow = require("@stdlib/math/base/special/pow");
const mathPow = Math.pow; // the "native" method
function isInfinite(x) { return x === Infinity || x === -Infinity; }
function isInteger(x) { return Number.isInteger(x); }
globalThis.CroquetMath.pow = (x, y) => {
    if (isNaN(x) || isNaN(y)) return NaN;
    if (isInfinite(x) || isInfinite(y)) return mathPow(x, y);
    if (x === 0 || y === 0) return mathPow(x, y);
    if (x < 0 && !isInteger(y)) return NaN;

    // removed:   if (isInteger(x) && isInteger(y)) return mathPow(x, y);
    // ...because it turns out that even on integer cases, the base Math.pow can be inconsistent across browsers (e.g., 5,-4 giving 0.0016 or 0.0015999999999999999).
    // nonetheless, we handle integer powers 1 to 4 explicitly, so that at least these will avoid the rounding errors that tend to emerge when calculating via logs.
    if (y === 1) return x;
    if (y === 2) return x*x;
    if (y === 3) return x*x*x;
    if (y === 4) return x*x*x*x;

    // remaining cases:
    // x -ve, y integer other than those handled above
    // x +ve, y anything other than integers handled above
    let signResult = 1;
    if (x < 0) {
        x *= -1;
        signResult = mathPow(-1, y);
    }
    const absPow = globalThis.CroquetMath.exp(globalThis.CroquetMath.log(x) * y);
    return absPow * signResult;
    };

// if someone can figure out how to make this work properly with exports
// then please change the import in vm.js to the proper
// import * as CroquetMath from "@croquet/math";

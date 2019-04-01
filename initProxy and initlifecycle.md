
### 2.1 Object.defineProperty和Proxy

// 如何判断浏览器支持原生proxy

```
// 是否支持Symbol 和 Reflect
var hasSymbol =
    typeof Symbol !== 'undefined' && isNative(Symbol) &&
    typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys);
function isNative (Ctor) {
    // Proxy本身是构造函数，且Proxy.toString === 'function Proxy() { [native code] }'
    return typeof Ctor === 'function' && /native code/.test(Ctor.toString())
}
``` 
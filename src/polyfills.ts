// Fonctions absentes d'iOS 15.0 à 15.3 (ajoutées en 15.4), utilisées par Angular.
// Voir .browserslistrc : iOS 15 fait partie des navigateurs visés par le build.

if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    configurable: true,
    writable: true,
    value: (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k),
  });
}

function at<T>(this: ArrayLike<T>, i: number): T | undefined {
  const n = Math.trunc(i) || 0;
  return this[n < 0 ? this.length + n : n];
}

for (const proto of [Array.prototype, String.prototype]) {
  if (!('at' in proto)) {
    Object.defineProperty(proto, 'at', { configurable: true, writable: true, value: at });
  }
}

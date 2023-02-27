export function isObject(value: unknown): value is Record<any, any> {
  return typeof value === 'object' && value !== null
}

export function isFunction(value: unknown): Boolean {
  return typeof value === 'function'
}

export function isArray(value) {
  return Array.isArray(value)
}
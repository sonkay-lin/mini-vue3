import { isFunction, isObject } from "@vue/shared"
import { ReactiveEffect } from "./effect"
import { isReactive } from "./reactive"

function traversal(value, set = new Set()) {
  if (!isObject(value)) return value
  //解决循环引用的问题
  if (set.has(value)) {
    return value
  }
  for(let key in value) {
    traversal(value[key], set)
  }
  return value
}

export function watch(source, cb) {
  let getter
  //处理用户传入对象或者函数
  if (isReactive(source)) {
    //如果是对象递归收集对象的属性
    getter = () => traversal(source)
  } else if (isFunction(source)) {
    getter = source
  } else {
    return
  }
  let cleanup
  function onCleanup(fn) {
    cleanup = fn
  }
  const job = () => {
    //cleanup第一次进来没有值，后续进来用于操作上次方法。使用场景：输入框搜索，每次结果获取结果清除上次的返回值
    cleanup && cleanup()
    //当执行调度函数后依赖的值已经改变通过effect.run()获取最新的值
    const newValue = effect.run()
    cb(newValue, oldValue, onCleanup)
    //执行完用户的回调后将新值赋值给旧值
    oldValue = newValue
  }
  //getter就是effect要依赖的属性，job就是调度函数，依赖的值改变就执行
  const effect = new ReactiveEffect(getter, job)
  //effect.run()就是执行getter也就是获取依赖的属性的值，所以这里拿到的是旧值
  let oldValue = effect.run()
}
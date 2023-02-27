import { isObject } from "@vue/shared"
import { track, trigger } from "./effect"

export function isReactive(value) {
  return value && value[ReactiveFlags.IS_REACTIVE]
}
export function reactive(target) {
  return createReactiveObject(target)
}
//响应式对象的标识
const enum ReactiveFlags {
  IS_REACTIVE = '__v_isReactive' //是否已经是响应式对象的标识
}
//用来搜集已经被代理过的对象
const reactiveMap = new WeakMap()
function createReactiveObject(target) {
  //若不是对象直接返回属性
  if (!isObject(target)) {
    return target
  }
  /**
   * 判断是否将生成的代理对象再代理，没被代理过的对象不会走get方法，被代理过的对象会获取属性进get方法，然后返回true
   * 出现场景：
   * const state = reactive({}); 
   * const state1 = reactive(state);
  */
  if (target[ReactiveFlags.IS_REACTIVE]) {
    return target
  }
  /**
   * 判断是否将一个对象重复代理，如果被代理了直接返回被代理过的对象
   * 出现场景:
   * const state = { name: 'lsk' }
   * const state1 = reactive(state)
   * const state2 = reactive(state)
  */
  const exisitingProxy = reactiveMap.get(target)
  if (exisitingProxy) {
    return exisitingProxy
  }
  //生成proxy实例
  const proxy = new Proxy(target, mutableHandlers)
  //将原对象和生成的代理对象生成映射表
  reactiveMap.set(target, proxy)
  return proxy
}
const mutableHandlers = {
  //获取proxy属性时进入get方法
  get(target, key, recevier) {
    //如果key值是__v_isReactive说明已经是个响应式数据
    if (key === ReactiveFlags.IS_REACTIVE) {
      return true
    }
    //通过Reflect获取proxy实例上的属性
    const result = Reflect.get(target, key, recevier)
    /**
     * 如果要获取的数据是个对象，那么就对它再次进行代理
     * vue2中直接对data中的数据进行递归，而vue3中采用懒递归，获取属性是对象再做递归
    */
    if (isObject(result)) {
      reactive(result)
    }
    //进行依赖收集
    track(target, 'get', key)
    //返回属性的值
    return result
  },
  //给proxy属性设置值时进入set方法
  set(target, key, value, recevier) {
    const oldValue = target[key]
    //通过Reflect给proxy实例上的属性赋值
    const result = Reflect.set(target, key, value, recevier)
    if (oldValue !== value) {
      //新值和旧值不一样，触发依赖
      trigger(target, 'set', key)
    }
    //返回赋值的结果
    return result
  }
}
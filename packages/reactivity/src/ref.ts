import { isArray, isObject } from "@vue/shared"
import { trackEffects, triggerEffects } from "./effect"
import { reactive } from "./reactive"

export function ref(value) {
  return new RefImpl(value)
}

function toReactive(value) {
  return isObject(value) ? reactive(value) : value
}

class RefImpl {
  dep = new Set() //依赖的属性
  _value          //proxy响应式数据
  rawValue        //原始类型的数据
  __v_isRef = true       //当前的类型是ref类型
  constructor(rawValue) {
    //保存原始类型
    this.rawValue = rawValue
    //如果传过来的值为object类型就使用reactive做代理
    this._value = toReactive(rawValue)
  }
  get value() {
    trackEffects(this.dep)
    //.value就返回被代理过的值
    return this._value
  }
  set value(newValue) {
    //.value赋值就保存原始类型和对数据做代理
    if (this.rawValue !== newValue) {
      this._value = toReactive(newValue)
      this.rawValue = newValue
      triggerEffects(this.dep)
    }
  }
}

class ObjectRefImpl {
  object
  key
  constructor(object, key) {
    /**
     * ObjectRefImpl实际上就是传入proxy对象，将proxy保存在this.object上
     * 然后通过getter/setter获取对象上的属性进行访问和修改
     */ 
    this.object = object
    this.key = key
  }
  get value() {
    return this.object[this.key]
  }
  set value(newValue) {
    this.object[this.key] = newValue
  }
}

export function toRef(object, key) {
  return new ObjectRefImpl(object, key)
}

export function toRefs(object) {
  const result = isArray(object) ? new Array(object.length) : {}
  for(let key in object) {
    result[key] = toRef(object, key)
  }
  return result
}

//proxyRefs的作用就是去掉.value操作 在模板语法中使用
export function proxyRefs(object) {
  return new Proxy(object, {
    get(target, key, recevier) {
      const result = Reflect.get(target, key, recevier)
      return result.__v_isRef ? result.value : result
    },
    set(target, key, value, recevier) {
      const oldValue = target[key]
      if (oldValue.__v_isRef) {
        oldValue.value = value
        return true
      } else {
        return Reflect.set(target, key, value, recevier)
      }
    }
  })
}
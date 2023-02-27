import { isFunction } from "@vue/shared";
import { isTracking, ReactiveEffect, trackEffects, triggerEffects } from "./effect";

export function computed(getterOrOptions) {
  const onlyGetter = isFunction(getterOrOptions)
  let getter
  let setter
  //处理用户传的是对象还是函数
  if (onlyGetter) {
    getter = getterOrOptions
    setter = () => {
      console.warn('is ReadOnly')
    }
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  return new ComputedRefImpl(getter, setter)
}

class ComputedRefImpl {
  _dirty = true          //用于判断是否重新计算
  __v_isRef = true       //当前的类型是ref类型
  __v_isReadOnly = true  //当前的computed是只读的
  dep = new Set()        //收集依赖的属性
  _value                 //缓存计算的结果
  effect                 //effect
  getter                 //用户的getter
  setter                 //用户的setter
  constructor(getter, setter) {
    this.getter = getter
    this.setter = setter
    //将用户的传入的getter放到effect中会收集依赖，当数据发生变化时执行scheduler函数
    this.effect = new ReactiveEffect(this.getter, () => {
      if (!this._dirty) {
        this._dirty = true
        triggerEffects(this.dep)
      }
    })
  }
  get value() {
    //依赖收集
    if (isTracking()) {
      trackEffects(this.dep)
    }
    //如果为脏值则重新执行用户的getter获取最新的值保存到_value上
    if (this._dirty) {
      this._dirty = false
      this._value = this.effect.run()
    }
    return this._value
  }
  set value(newValue) {
    //给computed赋值时调用setter但不改变this._value
    this.setter(newValue)
  }
}
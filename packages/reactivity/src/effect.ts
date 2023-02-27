/**
 * activeEffect保存当前执行的ReactiveEffect，用于处理嵌套effect执行栈,利用js是单线程执行的特点来实现
 * 组件就是基于effect来实现嵌套
 * effect(() => {       //parent = null 
 *  state.name = 'lsk'  //activeEffect = e1
 *  effect(() => {      //parent = e1
 *    state.age = 25    //activeEffect = e2
 *  })                  //e2执行完 activeEffect = parent = e1
 *  state.sex = 'man'   //activeEffect = e1
 * })                   //e1执行完 activeEffect = parent = null
*/
export let activeEffect = undefined
export function effect(fn, options: any = {}) {
  const _effect = new ReactiveEffect(fn, options.scheduler)
  //默认执行一次
  _effect.run()
  const runner = _effect.run.bind(_effect)
  //将effect实例挂载到run方法上，将run方法返回
  runner.effect = _effect
  return runner
}
export class ReactiveEffect{
  parent = null   //effect执行作用域的父effect
  fn = null       //用户传入的函数
  active = true   //是否是激活状态
  deps = []       //收集当前effect依赖了那些属性
  scheduler       //用户的调度函数
  constructor(fn, scheduler) {
    this.fn = fn
    this.scheduler = scheduler
  }
  run() {
    //非激活状态下只执行fn
    if (!this.active) {
      return this.fn()
    }
    try {
      this.parent = activeEffect
      //将当前的effect赋值给activeEffect
      activeEffect = this
      /**处理分支切换
       * 每次执行之前将清除上次收集依赖的属性，因为每次依赖的属性可能发生改变，需要清除上次收集的依赖
       * 出现场景：
       *  const state = reactive({ flag: true, name: 'zs', age: 20 })
       *  effect(() => {
       *    console.log('render')
       *    app.innerHTML = state.flag ? state.name : state.age
       *  })
       *  setTimeout(() => {
       *    state.flag = false
       *    setTimeout(() => {
       *      console.log('')
       *      state.name = 'ls'
       *    }, 1000)
       * }, 1000)
      */
      cleanupEffect(this)
      //然后用户的执行结果
      return this.fn()
    } finally {
      activeEffect = this.parent
    }
  }
  stop() {
    if (this.active) {
      this.active = false
      cleanupEffect(this)
    }
  }
}
//判断当前是否需要依赖收集
export function isTracking() {
  return activeEffect !== undefined
}
//用来存放target中的属性依赖了那些effect
/**
 * targetMap存放结构
 * targetMap: {
 *  key: { target },
 *  value: {
 *    map: {   //存放target的属性对应的effect
 *      key: 'target[key]',
 *      value: set[ReactiveEffect, ReactiveEffect] //去重后的effect
 *    }
 *  }
 * }
*/
const targetMap = new WeakMap()
//依赖收集
export function track(target, type, key) {
  //activeEffect = undefined说明当前属性不需要被收集
  if (!isTracking()) return
  //获取target在weakMap中的属性映射effect表
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }
  //获取当前key值对应的effect
  let dep = depsMap.get(key)
  if (!dep) {
    depsMap.set(key, (dep = new Set()))
  }
  trackEffects(dep)
}
//收集依赖
export function trackEffects(dep) {
  //判断将当前执行的effect是否已经收集过
  let shouldTrack = !dep.has(activeEffect)
  if (shouldTrack) {
    //将当前target属性所依赖的effect收集起来
    dep.add(activeEffect)
    //将effect所依赖的属性收集起来
    activeEffect.deps.push(dep)
  }
}
//实现依赖触发
export function trigger(target, type, key) {
  const depsMap = targetMap.get(target)
  //如果为空说明当前对象没有收集依赖
  if (!depsMap) return 
  //获取当前属性所有的effect
  let effects = depsMap.get(key)
  if (effects) {
    triggerEffects(effects)
  }
}
//触发依赖
export function triggerEffects(effects) {
  effects = new Set(effects)
  effects.forEach(effect => {
    /**
     * 如果当前执行的activeEffect不等于要触发的effect就执行run()，不然就会无限递归
     * 出现场景：
     * const state = reactive({ name: 'zs' })
     * effect(() => {
     *  state.name = 'ls'
     *  app.innerHTML = state.name
     * })
     * state.name = 'ls'
    */
    if (effect !== activeEffect) {
      //用户有传调度函数就执行
      if (effect.scheduler) {
        effect.scheduler()
      } else {
        effect.run()
      }
    }
  })
}
//清除effect中的依赖属性
function cleanupEffect(effect) {
  const { deps } = effect
  for(let i = 0; i < deps.length; i++) {
    deps[i].delete(effect)
  }
  effect.deps.length = 0
}
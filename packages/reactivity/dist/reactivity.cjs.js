'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var shared = require('@vue/shared');

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
let activeEffect = undefined;
function effect(fn, options = {}) {
    const _effect = new ReactiveEffect(fn, options.scheduler);
    //默认执行一次
    _effect.run();
    const runner = _effect.run.bind(_effect);
    //将effect实例挂载到run方法上，将run方法返回
    runner.effect = _effect;
    return runner;
}
class ReactiveEffect {
    constructor(fn, scheduler) {
        this.parent = null; //effect执行作用域的父effect
        this.fn = null; //用户传入的函数
        this.active = true; //是否是激活状态
        this.deps = []; //收集当前effect依赖了那些属性
        this.fn = fn;
        this.scheduler = scheduler;
    }
    run() {
        //非激活状态下只执行fn
        if (!this.active) {
            return this.fn();
        }
        try {
            this.parent = activeEffect;
            //将当前的effect赋值给activeEffect
            activeEffect = this;
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
            cleanupEffect(this);
            //然后用户的执行结果
            return this.fn();
        }
        finally {
            activeEffect = this.parent;
        }
    }
    stop() {
        if (this.active) {
            this.active = false;
            cleanupEffect(this);
        }
    }
}
//判断当前是否需要依赖收集
function isTracking() {
    return activeEffect !== undefined;
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
const targetMap = new WeakMap();
//依赖收集
function track(target, type, key) {
    //activeEffect = undefined说明当前属性不需要被收集
    if (!isTracking())
        return;
    //获取target在weakMap中的属性映射effect表
    let depsMap = targetMap.get(target);
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()));
    }
    //获取当前key值对应的effect
    let dep = depsMap.get(key);
    if (!dep) {
        depsMap.set(key, (dep = new Set()));
    }
    trackEffects(dep);
}
//收集依赖
function trackEffects(dep) {
    //判断将当前执行的effect是否已经收集过
    let shouldTrack = !dep.has(activeEffect);
    if (shouldTrack) {
        //将当前target属性所依赖的effect收集起来
        dep.add(activeEffect);
        //将effect所依赖的属性收集起来
        activeEffect.deps.push(dep);
    }
}
//实现依赖触发
function trigger(target, type, key) {
    const depsMap = targetMap.get(target);
    //如果为空说明当前对象没有收集依赖
    if (!depsMap)
        return;
    //获取当前属性所有的effect
    let effects = depsMap.get(key);
    if (effects) {
        triggerEffects(effects);
    }
}
//触发依赖
function triggerEffects(effects) {
    effects = new Set(effects);
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
                effect.scheduler();
            }
            else {
                effect.run();
            }
        }
    });
}
//清除effect中的依赖属性
function cleanupEffect(effect) {
    const { deps } = effect;
    for (let i = 0; i < deps.length; i++) {
        deps[i].delete(effect);
    }
    effect.deps.length = 0;
}

function isReactive(value) {
    return value && value["__v_isReactive" /* IS_REACTIVE */];
}
function reactive(target) {
    return createReactiveObject(target);
}
//用来搜集已经被代理过的对象
const reactiveMap = new WeakMap();
function createReactiveObject(target) {
    //若不是对象直接返回属性
    if (!shared.isObject(target)) {
        return target;
    }
    /**
     * 判断是否将生成的代理对象再代理，没被代理过的对象不会走get方法，被代理过的对象会获取属性进get方法，然后返回true
     * 出现场景：
     * const state = reactive({});
     * const state1 = reactive(state);
    */
    if (target["__v_isReactive" /* IS_REACTIVE */]) {
        return target;
    }
    /**
     * 判断是否将一个对象重复代理，如果被代理了直接返回被代理过的对象
     * 出现场景:
     * const state = { name: 'lsk' }
     * const state1 = reactive(state)
     * const state2 = reactive(state)
    */
    const exisitingProxy = reactiveMap.get(target);
    if (exisitingProxy) {
        return exisitingProxy;
    }
    //生成proxy实例
    const proxy = new Proxy(target, mutableHandlers);
    //将原对象和生成的代理对象生成映射表
    reactiveMap.set(target, proxy);
    return proxy;
}
const mutableHandlers = {
    //获取proxy属性时进入get方法
    get(target, key, recevier) {
        //如果key值是__v_isReactive说明已经是个响应式数据
        if (key === "__v_isReactive" /* IS_REACTIVE */) {
            return true;
        }
        //通过Reflect获取proxy实例上的属性
        const result = Reflect.get(target, key, recevier);
        /**
         * 如果要获取的数据是个对象，那么就对它再次进行代理
         * vue2中直接对data中的数据进行递归，而vue3中采用懒递归，获取属性是对象再做递归
        */
        if (shared.isObject(result)) {
            reactive(result);
        }
        //进行依赖收集
        track(target, 'get', key);
        //返回属性的值
        return result;
    },
    //给proxy属性设置值时进入set方法
    set(target, key, value, recevier) {
        const oldValue = target[key];
        //通过Reflect给proxy实例上的属性赋值
        const result = Reflect.set(target, key, value, recevier);
        if (oldValue !== value) {
            //新值和旧值不一样，触发依赖
            trigger(target, 'set', key);
        }
        //返回赋值的结果
        return result;
    }
};

function computed(getterOrOptions) {
    const onlyGetter = shared.isFunction(getterOrOptions);
    let getter;
    let setter;
    //处理用户传的是对象还是函数
    if (onlyGetter) {
        getter = getterOrOptions;
        setter = () => {
            console.warn('is ReadOnly');
        };
    }
    else {
        getter = getterOrOptions.get;
        setter = getterOrOptions.set;
    }
    return new ComputedRefImpl(getter, setter);
}
class ComputedRefImpl {
    constructor(getter, setter) {
        this._dirty = true; //用于判断是否重新计算
        this.__v_isRef = true; //当前的类型是ref类型
        this.__v_isReadOnly = true; //当前的computed是只读的
        this.dep = new Set(); //收集依赖的属性
        this.getter = getter;
        this.setter = setter;
        //将用户的传入的getter放到effect中会收集依赖，当数据发生变化时执行scheduler函数
        this.effect = new ReactiveEffect(this.getter, () => {
            if (!this._dirty) {
                this._dirty = true;
                triggerEffects(this.dep);
            }
        });
    }
    get value() {
        //依赖收集
        if (isTracking()) {
            trackEffects(this.dep);
        }
        //如果为脏值则重新执行用户的getter获取最新的值保存到_value上
        if (this._dirty) {
            this._dirty = false;
            this._value = this.effect.run();
        }
        return this._value;
    }
    set value(newValue) {
        //给computed赋值时调用setter但不改变this._value
        this.setter(newValue);
    }
}

function traversal(value, set = new Set()) {
    if (!shared.isObject(value))
        return value;
    //解决循环引用的问题
    if (set.has(value)) {
        return value;
    }
    for (let key in value) {
        traversal(value[key], set);
    }
    return value;
}
function watch(source, cb) {
    let getter;
    //处理用户传入对象或者函数
    if (isReactive(source)) {
        //如果是对象递归收集对象的属性
        getter = () => traversal(source);
    }
    else if (shared.isFunction(source)) {
        getter = source;
    }
    else {
        return;
    }
    let cleanup;
    function onCleanup(fn) {
        cleanup = fn;
    }
    const job = () => {
        //cleanup第一次进来没有值，后续进来用于操作上次方法。使用场景：输入框搜索，每次结果获取结果清除上次的返回值
        cleanup && cleanup();
        //当执行调度函数后依赖的值已经改变通过effect.run()获取最新的值
        const newValue = effect.run();
        cb(newValue, oldValue, onCleanup);
        //执行完用户的回调后将新值赋值给旧值
        oldValue = newValue;
    };
    //getter就是effect要依赖的属性，job就是调度函数，依赖的值改变就执行
    const effect = new ReactiveEffect(getter, job);
    //effect.run()就是执行getter也就是获取依赖的属性的值，所以这里拿到的是旧值
    let oldValue = effect.run();
}

function ref(value) {
    return new RefImpl(value);
}
function toReactive(value) {
    return shared.isObject(value) ? reactive(value) : value;
}
class RefImpl {
    constructor(rawValue) {
        this.dep = new Set(); //依赖的属性
        this.__v_isRef = true; //当前的类型是ref类型
        //保存原始类型
        this.rawValue = rawValue;
        //如果传过来的值为object类型就使用reactive做代理
        this._value = toReactive(rawValue);
    }
    get value() {
        trackEffects(this.dep);
        //.value就返回被代理过的值
        return this._value;
    }
    set value(newValue) {
        //.value赋值就保存原始类型和对数据做代理
        if (this.rawValue !== newValue) {
            this._value = toReactive(newValue);
            this.rawValue = newValue;
            triggerEffects(this.dep);
        }
    }
}
class ObjectRefImpl {
    constructor(object, key) {
        /**
         * ObjectRefImpl实际上就是传入proxy对象，将proxy保存在this.object上
         * 然后通过getter/setter获取对象上的属性进行访问和修改
         */
        this.object = object;
        this.key = key;
    }
    get value() {
        return this.object[this.key];
    }
    set value(newValue) {
        this.object[this.key] = newValue;
    }
}
function toRef(object, key) {
    return new ObjectRefImpl(object, key);
}
function toRefs(object) {
    const result = shared.isArray(object) ? new Array(object.length) : {};
    for (let key in object) {
        result[key] = toRef(object, key);
    }
    return result;
}
//proxyRefs的作用就是去掉.value操作 在模板语法中使用
function proxyRefs(object) {
    return new Proxy(object, {
        get(target, key, recevier) {
            const result = Reflect.get(target, key, recevier);
            return result.__v_isRef ? result.value : result;
        },
        set(target, key, value, recevier) {
            const oldValue = target[key];
            if (oldValue.__v_isRef) {
                oldValue.value = value;
                return true;
            }
            else {
                return Reflect.set(target, key, value, recevier);
            }
        }
    });
}

exports.computed = computed;
exports.effect = effect;
exports.proxyRefs = proxyRefs;
exports.reactive = reactive;
exports.ref = ref;
exports.toRef = toRef;
exports.toRefs = toRefs;
exports.watch = watch;

const path = require('path')

const packageFormats = process.env.FORMATS?.split(',')
const { SOURCE_MAP: sourcemap, TARGET: target } = process.env

// console.log(packageFormats, sourcemap, target)

const packagesDir = path.resolve(__dirname, 'packages')
const packageDir = path.resolve(packagesDir, target?.trim()) //打包的入口
const resolve = p => path.resolve(packageDir, p) //打包的目录解析文件
const name = path.basename(packageDir)?.trim() //取到打包的名字
console.log(name, target)
const pkg = require(resolve('package.json'))

const outputConfig = {
  'esm-bundler': {
    file: resolve(`dist/${name}.esm-bundler.js`),
    format: 'es'
  },
  'cjs': {
    file: resolve(`dist/${name}.cjs.js`),
    format: 'cjs'
  },
  'global': {
    file: resolve(`dist/${name}.global.js`),
    format: 'iife'
  }
}
console.log(outputConfig)

const packageConfigs = pkg.buildOptions.formats 

const ts = require('rollup-plugin-typescript2')
const json = require('@rollup/plugin-json')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const commonjs = require('@rollup/plugin-commonjs')

function createConfig(format, output) {
  output.sourcemap = sourcemap
  output.exports = 'named'
  let external = [] //外部模块 哪些模块不需要打包
  if (format === 'global') {
    output.name = pkg.buildOptions.name
  } else {
    external = [...Object.keys(pkg.dependencies)]
  }
  return {
    input: resolve('src/index.ts'),
    output,
    external,
    plugins: [
      ts(),
      json(),
      commonjs(),
      nodeResolve()
    ]
  }
}

export default packageConfigs.map(format => createConfig(format, outputConfig[format?.trim()]))
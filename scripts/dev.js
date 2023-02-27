const minimist = require('minimist') //专门解析命令行
const execa = require('execa')
const args = minimist(process.argv.slice(2))

//获取执行命令时打包的参数
const target = args._.length ? args._[0] : 'reactivity'
const { f: formats = 'global', s: sourcemap = false } = args

console.log(args, target, formats, sourcemap)

//execa 使用rollup打包
execa('rollup', 
  [
    '-wc', //监控模式
    '--environment', //环境变量
    [
      `TARGET: ${target}`,
      `FORMATS: ${formats}`,
      sourcemap ? `SOURCE_MAP: ${sourcemap}` : ''
    ].filter(Boolean).join(',')
  ], 
  {
    stdio: 'inherit', //这个子进程的输出是在当前命令行中输出
  }
)
const http = require('http')
const fs = require('fs')
const childProcess = require('child_process')
const args = process.argv.slice(2)
let proc

const spawnNodeStartProcess = function (callback) {
  console.log('Starting...')
  let deguOpts = {}
  if (fs.existsSync('.degu.json')) {
    deguOpts = require('.degu.json')
  }
  deguOpts.env = deguOpts.env || {}

  console.log('Installing dependencies...')
  childProcess
    .spawnSync('npm', ['install', '--production'], {
      detached: false,
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd()
    })

  proc = childProcess
    .spawn('npm', ['start', '--production'], {
      detached: false,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...deguOpts.env
      },
      cwd: process.cwd()
    })

  proc
    .once('close', function (status) {
      process.exit(status)
    })
}

const killNodeStartProcess = function () {
  console.log('Exiting...')
  if (!proc) {
    return
  }
  proc.kill()
}

const reloadNodeStartProcess = function () {
  if (!proc) {
    return
  }
  proc.removeAllListeners('close')
  proc.once('close', function (code, signal) {
    console.log('Reloading...')
    proc = null
    spawnNodeStartProcess()
  })
  proc.kill()
}

const gitUpdate = function (callback) {
  console.log('Update...')
  childProcess
    .spawn('git', ['pull'], {
      detached: false,
      stdio: 'inherit',
      cwd: process.cwd()
    })
    .on('close', function () {
      if (callback) {
        callback()
      }
    })
}

const gitInitSync = function (url) {
  console.log('Initialize...')
  if (!fs.existsSync('/app')) {
    return
  }
  if (fs.existsSync('/app/.git')) {
    childProcess.spawnSync('git',
      ['reset', '--hard', 'HEAD^1'],
      {
        detached: false,
        stdio: 'inherit',
        cwd: process.cwd()
      })
    childProcess.spawnSync('git',
      ['pull'],
      {
        detached: false,
        stdio: 'inherit',
        cwd: process.cwd()
      })
  } else {
    childProcess.spawnSync('git',
      ['clone', '--depth', '1', '--recurse-submodules', url, '/app'],
      {
        detached: false,
        stdio: 'inherit',
        cwd: process.cwd()
      })
  }
}

http.createServer(function (request, response) {
  if (request.method === 'POST') {
    if (request.url === '/$exit') {
      killNodeStartProcess()
    } else if (request.url === '/$git/update') {
      gitUpdate()
    } else if (request.url === '/$git/updateAndReload') {
      gitUpdate(reloadNodeStartProcess)
    } else if (request.url === '/$git/updateAndEit') {
      gitUpdate(killNodeStartProcess)
    } else if (request.url === '/$reload') {
      reloadNodeStartProcess()
    }
  }
  response.end('ok')
}).listen(8125)

if (args[0]) {
  gitInitSync(args[0])
}

spawnNodeStartProcess()

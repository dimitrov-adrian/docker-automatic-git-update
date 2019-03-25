const http = require('http')
const fs = require('fs')
const childProcess = require('child_process')
const args = process.argv.slice(2)
let proc

let deguOpts = {}

const reloadDeguFile = function() {
  deguOpts = {
    env: {},
    steps: [
      ['npm', 'install' ],
    ],
    main: ['npm', 'start'],
    api: {
      enable: true,
      prefix: '/',
      whitelist: [],
    }
  }

  const deguFile = '/app/.degu.json'
  if (fs.existsSync(deguFile)) {
    console.log(`Info: Load ${deguFile}`)
    deguOpts = {
      ...deguOpts,
      ...require(deguFile),
    }
  } else {
    console.log(`Info: No ${deguFile}`)
  }

  console.log('Degu Opts:', deguOpts)
}

const startManager = function(port) {
  console.log(`Info: Starting web management api on port ${port} ...`)
  const prefix = deguOpts.api.prefix || ''
  http.createServer(function (request, response) {

    const ip = request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      request.connection.socket.remoteAddress

    if (deguOpts.api.whitelist && deguOpts.api.whitelist.length > 0) {
      if (!deguOpts.api.whitelist.indexOf(ip)) {
        response.end('Error: IP not allowed')
        return
      }
    }

    if (request.method === 'POST') {
      if (request.url === prefix + 'reload-degu-file') {
        reloadDeguFile()
      } else if (request.url === prefix + 'restart') {
        response.end('OK: Queued.')
        restartMainProcess()
      } else if (request.url === prefix + 'exit') {
        response.end('OK: Queued.')
        killMainProcess()
      } else if (request.url === prefix + 'git/update') {
        response.end('OK: Queued.')
        gitUpdate()
      } else if (request.url === prefix + 'git/updateAndRestart') {
        response.end('OK: Queued.')
        gitUpdate(restartMainProcess)
      } else if (request.url === prefix + 'git/updateAndExit') {
        response.end('OK: Queued.')
        gitUpdate(killMainProcess)
      } else {
        response.end('Error: No such command.')
      }
    } else {
      response.end('Error: Method not allowed.')
    }
  }).listen(port)
}

const spawnMainProcess = function () {

  let i = 0;
  deguOpts.steps.forEach( function(step) {
    console.log(`Info: Execute steps ${++i}/${deguOpts.steps.length}`, step)
    result = childProcess
      .spawnSync(step[0], step.slice(1), {
        detached: false,
        stdio: 'inherit',
        env: process.env,
        cwd: process.cwd()
      })

    if (result.status > 0) {
      process.exit(result.status)
    }
  })

  proc = childProcess
    .spawn(deguOpts.main[0], deguOpts.main.slice(1), {
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

const killMainProcess = function () {
  console.log('Info: Exiting...')
  if (!proc) {
    return
  }
  proc.kill()
}

const restartMainProcess = function () {
  if (!proc) {
    return
  }
  proc.removeAllListeners('close')
  proc.once('close', function (code, signal) {
    console.log('Info: Restarting ...')
    spawnMainProcess()
  })
  proc.kill()
}

const gitUpdate = function (callback) {
  console.log('Info: Update ...')
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
  console.log('Info: Initialize codebase ...')

  if (fs.existsSync('/app/.git')) {

    result = childProcess.spawnSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: '/app',
      stdio: 'pipe',
      encoding: 'utf-8'
    });

    if (result.stdout) {
      result = String(result.stdout).trim()
      if (result !== url) {
        console.error('ERROR: remote of /app is different than input. (', result, '=/=', url, ')')
        process.exit(1)
      }
    }

    result = childProcess.spawnSync('git',
      ['reset', '--hard', 'origin'],
      {
        detached: false,
        stdio: 'inherit',
        cwd: process.cwd()
      })

    if (result.status > 0) {
      process.exit(result.status)
    }

    result = childProcess.spawnSync('git',
      ['pull'],
      {
        detached: false,
        stdio: 'inherit',
        cwd: process.cwd()
      })

    if (result.status > 0) {
      process.exit(result.status)
    }

  } else {
    result = childProcess.spawnSync('git',
      ['clone', '--depth', '1', '--recurse-submodules', url, '/app'],
      {
        detached: false,
        stdio: 'inherit',
        cwd: process.cwd()
      })

    if (result.status > 0) {
      process.exit(result.status)
    }

  }
}

if (fs.existsSync('/key')) {
  try {
    fs.chmodSync('/key', 0o400)
  } catch(err) {
    console.error('Warning: Cannot chmod key file "/key", ensure the passed key file have recommended modes 0400.')
  }
} else {
  console.error('Info: no key file "/key"')
}

if (args[0]) {
  gitInitSync(args[0])
}

reloadDeguFile()

if (fs.existsSync('/app/package.json')) {
  spawnMainProcess()
  if (deguOpts.api.enable) {
    startManager(8125)
  }
} else {
  console.error('No /app/package.json')
}

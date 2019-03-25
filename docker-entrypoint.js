const fs = require('fs')
const childProcess = require('child_process')

/**
 * argv
 */
const args = process.argv.slice(2)

/**
 * Main process holder.
 */
let mainProcess

/**
 * Return object of options from degu file
 *
 * @returns {{}}
 */
let deguOpts = {}

/**
 *
 */
const repositoryUrl = args[0]

/**
 * Reload degu (/app/.degu.json) and reset deguOpts
 * @returns {boolean}
 */
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
    deguFileOpts = { ...deguOpts, ...require(deguFile) }
    // Because have no recursive merge, and we have small ammount of keys,
    // no need of external library.
    if (deguFileOpts.env) {
      deguOpts.env = { ...deguOpts.env, ...deguFileOpts.env }
    }
    if (deguFileOpts.api) {
      deguOpts.api = { ...deguOpts.api, ...deguFileOpts.api }
    }
    deguOpts = { ...deguOpts, ...deguFileOpts }
    return true
  } else {
    console.log(`Info: No ${deguFile}`)
    return false
  }
}

/**
 * Chmodding /key file with proper modes.
 */
const chmodKeyFileSync = function() {
  if (fs.existsSync('/key')) {
    try {
      fs.chmodSync('/key', 0o400)
      return true
    } catch(err) {
      console.error('Warning: Cannot chmod key file "/key", ensure the passed key file have recommended modes 0400.')
      return false
    }
  } else {
    console.error('Info: No private key file "/key"')
    return false
  }
}

/**
 * Start web manager API
 *
 * @param port
 */
const startManagerApi = function(port) {

  const http = require('http')
  const prefix = deguOpts.api.prefix || ''
  console.log(`Info: Starting web management api on port ${port} ...`)

  http.createServer( (request, response) => {

    if (!deguOpts.api.enable) {
      return
    }

    const ip = request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      request.connection.socket.remoteAddress

    if (deguOpts.api.whitelist && deguOpts.api.whitelist.length > 0) {
      if (deguOpts.api.whitelist.indexOf(ip) === -1) {
        response.end('Error: IP not allowed')
        console.error(`Warning: Rejected API request ${request.url} from ${ip}`)
        return
      }
    }

    if (request.method !== 'POST') {
      response.end('Error: Method not allowed')
      return
    }

    if (request.url === prefix + 'reload-degu-file') {
      reloadDeguFile()
    } else if (request.url === prefix + 'restart') {
      response.end('OK: restart')
      restart()
    } else if (request.url === prefix + 'exit') {
      response.end('OK: exit')
      exit()
    } else if (request.url === prefix + 'git/update') {
      response.end('OK: git/update')
      gitUpdateSync()
    } else if (request.url === prefix + 'git/updateAndRestart') {
      response.end('OK: git/updateAndRestart')
      gitUpdateSync()
      restart()
    } else if (request.url === prefix + 'git/updateAndExit') {
      response.end('OK: git/updateAndExit')
      gitUpdateSync()
      exit()
    } else {
      response.end('Error: No such command.')
    }

  })
    .listen(port)
}

/**
 * Start main process.
 */
const start = function () {

  let i = 0
  deguOpts.steps
    .forEach( function(step) {
      console.log(`Info: Executing steps ${++i}/${deguOpts.steps.length} ...`, step)

      if (!Array.isArray(step)) {
        if (typeof step === "string") {
          step = step.split(' ')
        } else {
          return
        }
      }

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

  let mainCommand = deguOpts.main
  if (!Array.isArray(mainCommand)) {
    if (typeof mainCommand === "string") {
      mainCommand = mainCommand.split(' ')
    } else {
      return
    }
  }

  mainProcess = childProcess
    .spawn(mainCommand[0], mainCommand.slice(1), {
      detached: false,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...deguOpts.env
      },
      cwd: process.cwd()
    })

  mainProcess.on('close', (status) => {
    process.exit(status)
  })

}

/**
 * Exit main process.
 */
const exit = function () {
  console.log('Info: Exiting...')
  if (!mainProcess) {
    return
  }
  mainProcess.kill()
}

/**
 * Restart main process.
 */
const restart = function () {
  if (!mainProcess) {
    return
  }
  mainProcess.removeAllListeners('close')
  mainProcess.once('close', function (code, signal) {
    console.log('Info: Restarting ...')
    start()
  })
  mainProcess.kill()
}

/**
 * Git init
 * @param url
 */
const gitInitSync = function () {
  console.log('Info: Clone repository from remote ...')

  if (fs.existsSync('/app/.git')) {
    console.error('ERROR: /app repository directory')
    return false
  }

  chmodKeyFileSync()

  result = childProcess.spawnSync('git',
    ['clone', '--depth', '1', '--recurse-submodules', repositoryUrl, '/app'],
    {
      detached: false,
      stdio: 'inherit',
      cwd: process.cwd()
    })

  if (result.status) {
    process.exit(result.status)
  }

}

/**
 * Git update.
 * @param callback
 * @returns {boolean}
 */
const gitUpdateSync = function () {

  if (!fs.existsSync('/app/.git')) {
    console.log('ERROR: /app is not git repo.')
    return false
  }

  console.log('Info: Update repository from remote ...')

  result = childProcess.spawnSync('git', ['config', '--get', 'remote.origin.url'], {
    cwd: '/app',
    stdio: 'pipe',
    encoding: 'utf-8'
  })

  if (result.stdout) {
    result = String(result.stdout).trim()
    if (result !== repositoryUrl) {
      console.error('ERROR: Remote of /app (' + result + ') is different than local (' + repositoryUrl + ')')
      process.exit(1)
      return false
    }
  }

  chmodKeyFileSync()

  result = childProcess.spawnSync('git',
    ['reset', '--hard', 'origin'],
    {
      detached: false,
      stdio: 'inherit',
      cwd: process.cwd()
    })

  if (result.status > 0) {
    process.exit(result.status)
    return false
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
    return false
  }

  return true
}

/**
 * Main.
 */
// Reload file.
reloadDeguFile()

// Start web managemenet API.
if (deguOpts.api.enable) {
  startManagerApi(8125)
}

// Initialize or update the codebase.
if (args[0]) {
  if (fs.existsSync('/app/.git')) {
    gitUpdateSync()
  } else {
    gitInitSync()
  }
}

if (fs.existsSync('/app/package.json')) {
  start()
} else {
  console.error('ERROR: /app/package.json does not exists.')
}


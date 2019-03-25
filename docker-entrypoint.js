const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')

/**
 * Main process holder.
 */
let mainProcess

/**
 * Return object of options from degu file
 */
let deguOpts = {}

/**
 * Repository URI comes from env variable GIT_URI or as command to container.
 */
const repositoryUrl = process.env.GIT_URI || process.argv.slice(2).pop()

/**
 * App directory, defaults to /app, in some cases may need to set other.
 */
const appDir = process.env.APP_DIR || '/app'

/**
 * Degu options file.
 */
const deguFile = path.join(appDir, '.degu.json')

/**
 * Reload degu (/app/.degu.json) and reset deguOpts
 * @returns {boolean}
 */
const reloadDeguFile = function () {
  deguOpts = {
    env: {},
    steps: [
      ['npm', 'install']
    ],
    main: ['npm', 'start'],
    api: {
      port: 8125,
      enable: true,
      prefix: '/',
      whitelist: []
    },
    updateScheduler: {
      enable: false,
      interval: 3600,
      onUpdate: 'restart'
    }
  }

  if (fs.existsSync(deguFile)) {
    console.log(`Info: Load ${deguFile}`)
    let deguFileOpts = { ...deguOpts, ...require(deguFile) }
    // Because have no recursive merge, and we have small ammount of keys,
    // no need of external library.
    if (deguFileOpts.env) {
      deguOpts.env = { ...deguOpts.env, ...deguFileOpts.env }
    }
    if (deguFileOpts.api) {
      deguOpts.api = { ...deguOpts.api, ...deguFileOpts.api }
    }
    if (deguFileOpts.updateScheduler) {
      deguOpts.updateScheduler = { ...deguOpts.updateScheduler, ...deguFileOpts.updateScheduler }
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
const chmodKeyFileSync = function () {
  if (fs.existsSync('/key')) {
    try {
      fs.chmodSync('/key', 0o400)
      return true
    } catch (err) {
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
const startManagerApi = function () {
  if (!deguOpts.api.enable || !deguOpts.api.port) {
    return
  }

  const http = require('http')
  const prefix = deguOpts.api.prefix || ''
  console.log(`Info: Starting web management API on port ${deguOpts.api.port} ...`)

  http.createServer((request, response) => {
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
      let currentHash = getGitHashSync()
      gitUpdateSync()
      if (currentHash !== getGitHashSync()) {
        restart()
      }
    } else if (request.url === prefix + 'git/updateAndExit') {
      response.end('OK: git/updateAndExit')
      gitUpdateSync()
      exit()
    } else {
      response.end('Error: No such command.')
    }
  })
    .listen(deguOpts.api.port)
}

const startUpdateScheduler = function () {
  if (!deguOpts.updateScheduler.enable) {
    return
  }

  if (deguOpts.updateScheduler.interval < 60) {
    console.error('ERROR: Disable updateScheduler. Interval must be more than 60.')
  }
  console.log('Info: Setting up auto update scheduler to ', deguOpts.updateScheduler.interval + 's')

  setInterval(() => {
    console.log('Info: Triggering update scheduler check ...')
    let currentHash = getGitHashSync()
    gitUpdateSync()
    if (currentHash !== getGitHashSync()) {
      if (deguOpts.updateScheduler.onUpdate === 'restart') {
        restart()
      } else if (deguOpts.updateScheduler.onUpdate === 'exit') {
        exit()
      }
    }
  }, deguOpts.updateScheduler.interval * 1000)
}

/**
 * Start main process.
 */
const start = function () {
  let i = 0
  deguOpts.steps
    .forEach(function (step) {
      console.log(`Info: Executing steps ${++i}/${deguOpts.steps.length} ...`, step)

      if (!Array.isArray(step)) {
        if (typeof step === 'string') {
          step = step.split(' ')
        } else {
          return
        }
      }

      let result = childProcess
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
    if (typeof mainCommand === 'string') {
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
  mainProcess.once('close', function () {
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

  if (fs.existsSync(path.join(appDir, '.git'))) {
    console.error(`ERROR: ${appDir} repository directory`)
    return false
  }

  chmodKeyFileSync()
  let result = childProcess.spawnSync('git',
    ['clone', '--depth', '1', '--recurse-submodules', repositoryUrl, appDir],
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
 * Get current hash.
 * @returns {String}
 */
const getGitHashSync = function () {
  let result = childProcess.spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: appDir,
    stdio: 'pipe',
    encoding: 'utf-8'
  })

  if (result.stdout) {
    return String(result.stdout).trim()
  } else {
    return ''
  }
}

/**
 * Git update.
 * @param callback
 * @returns {boolean}
 */
const gitUpdateSync = function () {
  if (!fs.existsSync(path.join(appDir, '.git'))) {
    console.log(`ERROR: ${appDir} is not git repo.`)
    return false
  }

  console.log('Info: Update repository from remote ...')
  let result
  result = childProcess.spawnSync('git', ['config', '--get', 'remote.origin.url'], {
    cwd: appDir,
    stdio: 'pipe',
    encoding: 'utf-8'
  })

  if (result.stdout) {
    result = String(result.stdout).trim()
    if (result !== repositoryUrl) {
      console.error(`ERROR: Remote of ${appDir} (${result}) is different than local (${repositoryUrl})`)
      process.exit(1)
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

  return true
}

/**
 * Main.
 */
// Reload file.
reloadDeguFile()

// Initialize or update the codebase.
if (repositoryUrl) {
  if (fs.existsSync(path.join(appDir, '.git'))) {
    gitUpdateSync()
  } else {
    gitInitSync()
  }
} else {
  console.error('ERROR: No repository URL is provided.')
  process.exit(1)
}

if (fs.existsSync(path.join(appDir, 'package.json')) || fs.existsSync(deguFile)) {
  start()
} else {
  console.error('ERROR: package.json or .degu.json is required.')
  process.exit(1)
}

// Start web managemenet API.
startManagerApi()

// Start scheduled updates.
startUpdateScheduler()

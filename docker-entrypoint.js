const http = require('http')
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')

/**
 * Main process holder.
 */
let appProcess

/**
 * Return object of options from degu file
 */
const deguOpts = {
  env: {},
  steps: [
    ['npm', 'install']
  ],
  main: ['npm', 'start'],
  forever: false,
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

/**
 * Repository URI comes from env variable GIT_URI or as command to container.
 */
const repositoryUrl = process.env.GIT_URI || process.argv[2]

/**
 * Repository URI comes from env variable GIT_URI or as command to container.
 */
const repositoryBranch = process.env.GIT_BRANCH || process.argv[3] || 'master'

/**
 * App directory, defaults to /app, in some cases may need to set other.
 */
const appDir = process.env.APP_DIR || '/app'

/**
 * Degu options file.
 */
const deguFile = process.env.DEGU_FILE || path.join(appDir, '.degu.json')

/**
 * Reload degu (/app/.degu.json) and reset deguOpts
 * @returns {boolean}
 */
const loadDeguFileOpts = function () {
  if (fs.existsSync(deguFile)) {
    console.log(`Info: Load ${deguFile}`)
    let deguFileOpts = require(deguFile)
    Object.keys(deguFileOpts).map((key, index) => {
      if (deguOpts.hasOwnProperty(key)) {
        if (typeof deguOpts[key] === 'object') {
          deguOpts[key] = {
            ...deguOpts[key],
            ...deguFileOpts[key]
          }
        } else {
          deguOpts[key] = deguFileOpts[key]
        }
      }
    })
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
      fs.chmodSync('/key', 0o600)
      return true
    } catch (err) {
      console.error('Warning: Cannot chmod key file "/key", ensure the passed key file have recommended modes 0600.')
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

  const prefix = deguOpts.api.prefix || ''
  console.log(`Info: Starting web management API on port ${deguOpts.api.port} with prefix ${prefix} ...`)

  http.createServer((request, response) => {
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

    if (request.url === prefix + 'restart') {
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

/**
 * Start the update scheduler.
 */
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
 * Start app process.
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
          env: {
            ...process.env,
            ...deguOpts.env
          },
          cwd: appDir
        })
      if (result.status !== 0) {
        console.log('ERROR: Step failed. Status:', result.status, 'Signal:', result.signal)
        process.exit(1)
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

  appProcess = childProcess
    .spawn(mainCommand[0], mainCommand.slice(1), {
      detached: false,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...deguOpts.env
      },
      cwd: appDir
    })

  appProcess.on('exit', (status, signal) => {
    if (status !== 0 && !signal && deguOpts.forever) {
      setTimeout(start, 1000)
    } else {
      process.exit(status)
    }
  })
}

/**
 * Exit app process.
 */
const exit = function () {
  console.log('Info: Exiting...')
  if (!appProcess) {
    return
  }
  appProcess.kill()
}

/**
 * Restart app process.
 */
const restart = function () {
  if (!appProcess) {
    return
  }
  appProcess.removeAllListeners('exit')
  appProcess.once('exit', function () {
    console.log('Info: Restarting ...')
    start()
  })
  appProcess.kill()
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
    ['clone', '--depth', '1', '--recurse-submodules', '-b', repositoryBranch, '--single-branch', repositoryUrl, appDir],
    {
      detached: false,
      stdio: 'inherit',
      cwd: process.cwd()
    })

  if (result.status !== 0) {
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
      cwd: appDir
    })

  if (result.status !== 0) {
    process.exit(result.status)
  }

  result = childProcess.spawnSync('git',
    ['pull'],
    {
      detached: false,
      stdio: 'inherit',
      cwd: appDir
    })

  if (result.status !== 0) {
    process.exit(result.status)
  }

  return true
}

// Reload file.
loadDeguFileOpts()

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
  console.error(`ERROR: ${appDir}/package.json or ${deguFile} is required.`)
  process.exit(1)
}

// Start web managemenet API.
startManagerApi()

// Start scheduled updates.
startUpdateScheduler()

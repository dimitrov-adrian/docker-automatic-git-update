const fs = require('fs')
const http = require('http')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const childProcess = require('child_process')

/**
 * Start time
 */
const time = new Date()

/**
 * Run ID
 */
const runId = crypto.randomBytes(20).toString('hex')

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
  api: {
    enable: process.env.DEGU_API_ENABLE || true,
    port: process.env.DEGU_API_PORT || 8125,
    prefix: process.env.DEGU_API_PREFIX || '/',
    whitelist: process.env.DEGU_API_WHITELIST || []
  }
}

/**
 * Remote object containg information for the repo/archive url, etc.
 */
const remote = {
  /**
   * Type
   */
  type: process.env.REMOTE_TYPE || process.argv[2],

  /**
   * URL
   */
  url: process.env.REMOTE_URL || process.argv[3],

  /**
   * BRANCH
   */
  branch: process.env.REMOTE_BRANCH || process.argv[4]
}

if (!remote.branch && !remote.url && remote.type) {
  remote.url = remote.type
  remote.type = 'git'
}

if (!remote.branch) {
  remote.branch = 'master'
}

/**
 * App directory, defaults to /app, in some cases may need to set other.
 */
const appDir = process.env.APP_DIR || '/app'

/**
 * Degu options file.
 */
const deguFile = process.env.DEGU_FILE || path.join(appDir, '.degu.json')

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
 * Start app process.
 */
const start = function () {
  let i = 0
  deguOpts.steps
    .forEach(function (step) {
      console.log(`Info: Executing steps ${++i}/${deguOpts.steps.length} ...`, step)

      if (!Array.isArray(step)) {
        if (typeof step === 'string') {
          step = step.split(/\s+/)
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
      mainCommand = mainCommand.split(/\s+/)
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
    process.exit(status)
  })
}

/**
 * Exit app process.
 */
const exit = function (code) {
  console.log('Info: Exiting...')
  if (!appProcess) {
    return
  }
  appProcess.kill()
  process.exit(code || 0)
}

/**
 * Git init
 * @param url
 */
const gitInitSync = function () {
  console.log('Info: Clone repository from remote ...')
  chmodKeyFileSync()
  let result = childProcess.spawnSync('git',
    ['clone', '--depth', '1', '--recurse-submodules', '-b', remote.branch, '--single-branch', remote.url, appDir],
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
 * Git update.
 * @param callback
 * @returns {boolean}
 */
const gitUpdateSync = function () {
  console.log('Info: Update repository from remote ...')
  let result
  result = childProcess.spawnSync('git', ['config', '--get', 'remote.origin.url'], {
    cwd: appDir,
    stdio: 'pipe',
    encoding: 'utf-8'
  })

  if (result.stdout) {
    result = String(result.stdout).trim()
    if (result !== remote.url) {
      console.error(`ERROR: Remote of ${appDir} (${result}) is different than local (${remote.url})`)
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

/**
 * Sync download file
 * @param {*} uri
 */
const downloadFileSync = function (uri) {
  const basename = path.basename(uri)
  const tmpFilePath = path.join(os.tmpdir(), basename)
  let result = childProcess.spawnSync('curl',
    ['-#', '-L', '-o', tmpFilePath, uri],
    {
      detached: false,
      stdio: 'inherit'
    })
  return result.status === 0 ? tmpFilePath : false
}

/**
 * Download archived codebase, and extract to app directory.
 * @param uri
 * @returns {Promise<any>}
 */
const downloadArchivedCodebase = function () {
  if (fs.existsSync(appDir)) {
    console.error('ERROR: App directory already exists.')
    process.exit(1)
  }

  console.log('Info: Downloading code from', remote.url)
  let tmpFile = downloadFileSync(remote.url)
  if (!tmpFile) {
    console.error('ERROR: Downloading error', remote.url)
    process.exit(1)
  }
  console.log('Info: Downloading complete.')

  let ext = tmpFile.split('.').pop()
  let tmpDir = path.join(os.tmpdir(), 'appdir.tmp')
  fs.mkdirSync(tmpDir)

  if (ext === 'zip') {
    try {
      if (!/\.zip$/i.test(tmpFile)) {
        fs.renameSync(tmpFile, tmpFile + '.zip')
        tmpFile = tmpFile + '.zip'
      }
      let result = childProcess.spawnSync('unzip',
        ['-o', '-d', tmpDir, tmpFile],
        {
          detached: false,
          stdio: 'inherit'
        })
      if (result.status !== 0) {
        process.exit(result.status)
      }
    } catch (err) {
      console.error('ERROR:', err.toString())
      process.exit(1)
    }
  } else if (/^tar|t.z/i.test(ext)) {
    let result = childProcess.spawnSync('tar',
      ['-xvf', tmpFile, '-C', tmpDir],
      {
        detached: false,
        stdio: 'inherit'
      })
    if (result.status !== 0) {
      process.exit(result.status)
    }
  } else {
    console.error('ERROR: Unsupporteed archive type', ext, 'from', remote.url)
    process.exit(1)
  }

  let files = fs.readdirSync(tmpDir)
  if (files.length === 1) {
    if (fs.lstatSync(path.join(tmpDir, files[0])).isDirectory()) {
      fs.renameSync(path.join(tmpDir, files[0]), appDir)
    } else {
      fs.renameSync(tmpDir, files[0])
    }
  } else {
    fs.renameSync(tmpDir, files[0])
  }
}

/**
 *
 * @returns {*}
 */
const updateCodebase = function () {
  if (remote.type === 'git') {
    if (fs.existsSync(path.join(appDir, '.git'))) {
      gitUpdateSync()
    } else {
      gitInitSync()
    }
  } else if (remote.type === 'archive') {
    downloadArchivedCodebase()
  } else {
    fs.readdir(appDir, (err, files) => {
      if (!err && files.length > 0) {
        console.log('Warning: No supported remote is set, starting from directory', remote)
      } else {
        console.error('ERROR: No supported remote is set.', remote)
      }
    })
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

  let whitelist = deguOpts.api.whitelist
  if (typeof whitelist === 'string') {
    whitelist = whitelist.split(/[\s;,]+/)
  }
  http.createServer((request, response) => {
    const ip = request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      request.connection.socket.remoteAddress

    if (whitelist && whitelist.length > 0) {
      if (whitelist.indexOf(ip) === -1) {
        response.end('ERROR: IP not allowed.')
        console.error(`Warning: Rejected API request ${request.url} from ${ip}.`)
        return
      }
    }

    if (request.method === 'GET') {
      if (request.url === prefix + 'uptime') {
        response.end((((new Date()) - time) / 1000).toFixed(3).toString())
        return
      } else if (request.url === prefix + 'id') {
        response.end(runId)
        return
      }
    } else if (request.method === 'POST') {
      if (request.url === prefix + 'exit') {
        response.end('OK: Exiting ...')
        exit()
        return
      }
    }
    response.end('ERROR: No such command.')
  })
    .listen(deguOpts.api.port)
}

// Reload file.
loadDeguFileOpts()

// Update codebase.
updateCodebase()

// Check for package.json or .degu.json
if (!(fs.existsSync(path.join(appDir, 'package.json')) || fs.existsSync(deguFile))) {
  console.error(`ERROR: ${appDir}/package.json or ${deguFile} is required.`)
  process.exit(1)
}

// Start web managemenet API.
startManagerApi()

// Start main process.
start()

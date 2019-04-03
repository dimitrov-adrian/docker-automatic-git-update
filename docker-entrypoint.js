const childProcess = require('child_process')
const os = require('os')
const fs = require('fs')
const path = require('path')
const http = require('http')
const url = require('url')
const crypto = require('crypto')

/**
 * Main process holder.
 */
let appProcess

/**
 * Start time
 */
const time = new Date()

/**
 * Random generated run ID
 */
const runId = crypto.randomBytes(8).toString('hex')

/**
 * App directory, defaults to /app, in some cases may need to set other
 */
const appDir = process.env.APP_DIR || '/app'

/**
 * Degu options file.
 */
const deguFile = process.env.DEGU_FILE || path.join(appDir, '.degu.json')

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
  type: (process.env.REMOTE_TYPE || process.argv[2] || '').toLowerCase(),

  /**
   * URL
   */
  url: process.env.REMOTE_URL || process.argv[3] || '',

  /**
   * Branch (could be also inner directory)
   */
  branch: process.env.REMOTE_BRANCH || process.argv[4] || ''
}

if (!remote.branch && !remote.url && remote.type) {
  remote.url = remote.type
  remote.type = 'git'
} else if (remote.type && remote.type.split('.').length > 1 && remote.url) {
  remote.branch = remote.url
  remote.url = remote.type
  remote.type = 'git'
}

if (!remote.branch) {
  if (remote.type === 'git') {
    remote.branch = 'master'
  }
}

/**
 * Chmodding /ssh_key file with proper modes.
 */
const chmodKeyFileSync = function () {
  if (fs.existsSync('/ssh_key')) {
    try {
      fs.chmodSync('/ssh_key', 0o600)
      return true
    } catch (err) {
      console.error('Warning: Cannot chmod key file "/ssh_key", ensure the passed key file have recommended modes 0600.')
      return false
    }
  } else {
    console.error('Info: No private key file "/ssh_key"')
    return false
  }
}

/**
 * Sync download file
 * @param {*} uri
 */
const downloadFileSync = function (uri) {
  const basename = path.basename(uri)
  const tmpFilePath = path.join(os.tmpdir(), basename)
  let result = childProcess.spawnSync('wget',
    ['-c', '-O', tmpFilePath, uri],
    {
      detached: false,
      stdio: 'inherit'
    })
  return result.status === 0 ? tmpFilePath : false
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
    console.log(`Info: ${deguFile} not found, going defaults ...`)
    return false
  }
}

/**
 * Start app process.
 */
const start = function () {
  let i = 0
  let steps = Object.values(deguOpts.steps || [])
  steps
    .forEach(function (step) {
      console.log(`Info: Executing step ${++i}/${steps.length}`, step, '...')

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
        console.log('ERROR: Step failed. Status=', result.status, 'Signal=', result.signal)
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

  console.log('Info: Executing main process', mainCommand, '...')
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
    process.exit(status || 0)
  })
}

/**
 * Exit app process.
 */
const exit = function (code) {
  console.log('Info: Exiting ...')
  if (!appProcess) {
    return
  }
  appProcess.kill()
}

/**
 * Fetch codebase from GIT repository
 */
const updateCodebaseFromGit = function () {
  chmodKeyFileSync()
  if (fs.existsSync(path.join(appDir, '.git'))) {
    let result
    result = childProcess.spawnSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: appDir,
      stdio: 'pipe',
      encoding: 'utf-8'
    })

    if (result.status !== 0) {
      process.exit(result.status)
    }

    if (result.stdout) {
      result = String(result.stdout).trim()
      if (result !== remote.url) {
        console.error(`ERROR: Remote of ${appDir} (${result}) is different than local (${remote.url})`)
        process.exit(1)
      }
    }

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
  } else {
    let result = childProcess.spawnSync('git',
      ['clone', '--depth', '1', '--recurse-submodules', '-j8', '-b', remote.branch, '--single-branch', remote.url, appDir],
      {
        detached: false,
        stdio: 'inherit',
        cwd: process.cwd()
      })

    if (result.status !== 0) {
      process.exit(result.status)
    }
  }
}

/**
 * Fetch codebase from SVN repository
 */
const updateCodebaseFromSvn = function () {
  chmodKeyFileSync()

  let repositoryUrl = remote.url
  if (remote.branch) {
    repositoryUrl += '/' + remote.branch
  }

  let result = childProcess.spawnSync('svn',
    ['export', '--force', repositoryUrl, appDir],
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
 * Fetch codebase from archive URL
 */
const updateCodebaseFromArchive = function () {
  if (fs.existsSync(appDir)) {
    console.error('ERROR: App directory already exists.')
    process.exit(1)
  }

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
  } else if (!/\.(t.?z|tar(\.(z|lzma|xz|lz2?|bz2?|gz2?))?)$/i.test(ext)) {
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

  let branch = remote.branch
  if (!branch) {
    let deguFileBasename = path.basename(deguFile)
    let files = fs.readdirSync(tmpDir)
      .filter(item => {
        return item.charAt(0) !== '.' || item === deguFileBasename
      })
    if (files.length === 1) {
      console.log('Info: Detected inner directory as branch', files[0])
      branch = files[0]
    }
  }

  try {
    if (branch) {
      fs.renameSync(path.join(tmpDir, branch), appDir)
    } else {
      fs.renameSync(tmpDir, appDir)
    }
  } catch (err) {
    console.error('ERROR: While installing app directory', err.toString())
    process.exit(1)
  }
}

/**
 * Update codebase from remote.
 */
const updateCodebase = function () {
  if (remote.url) {
    console.log(`Info: Downloading codebase from remote ${remote.type} ${remote.url} ...`)
  }
  if (remote.type === 'git') {
    updateCodebaseFromGit()
  } else if (remote.type === 'archive') {
    updateCodebaseFromArchive()
  } else if (remote.type === 'svn') {
    updateCodebaseFromSvn()
  } else {
    let files = fs.readdirSync(appDir)
    if (files.length > 0) {
      console.log('Warning: No supported remote is set, starting from directory', remote)
    } else {
      console.error('ERROR: No supported remote is set.', remote)
      process.exit(1)
    }
  }
}

/**
 * Start web manager API
 */
const startManagerApi = function () {
  if (!deguOpts.api.enable || !deguOpts.api.port) {
    return
  }

  const prefix = '/' + (deguOpts.api.prefix || '/').replace(/^\//, '')
  console.log(`Info: Starting web management API port=${deguOpts.api.port} prefix=${prefix} ...`)

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
        console.error(`Warning: Rejected API request url=${request.url} ip=${ip}.`)
        return
      }
    }

    let reqUrl = url.parse(request.url, true)

    if (request.method === 'GET' && reqUrl.pathname === prefix) {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        runId: runId,
        uptime: (((new Date()) - time) / 1000).toFixed(3).toString(),
        env: process.env,
        deguOpts: deguOpts,
        remote: remote
      }, null, 2))
    } else if (request.method === 'POST' && reqUrl.pathname === prefix + 'exit') {
      response.end('OK: Exiting ...')
      console.log(`Info: Receiving exit signal delay=${reqUrl.query.delay || 0} code=${reqUrl.query.code || 0}`)
      if (reqUrl.query.delay) {
        setTimeout(() => {
          exit(reqUrl.query.code)
        }, reqUrl.query.delay * 1000)
      } else {
        exit(reqUrl.query.code)
      }
    } else {
      console.error(`Warning: Received invalid commant ${request.method} ${request.url}`)
      response.end('ERROR: No such command.')
    }
  })
    .listen(deguOpts.api.port)
}

console.log(`Info: App is starting up #${runId} ...`)

// Update codebase.
updateCodebase()

// Reload file.
loadDeguFileOpts()

// Check for package.json or .degu.json
if (!(fs.existsSync(path.join(appDir, 'package.json')) || fs.existsSync(deguFile))) {
  console.error(`ERROR: ${appDir}/package.json or ${deguFile} is required.`)
  process.exit(1)
}

// Start web managemenet API.
startManagerApi()

// Start main process.
start()

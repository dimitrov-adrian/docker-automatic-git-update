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
  },
  puller: {
    enable: process.env.DEGU_PULLER_ENABLE || false,
    interval: process.env.DEGU_PULLER_INTERVAL || '1h'
  }
}

/**
 * Remote object containg information for the repo/archive url, etc.
 */
const remote = {
  /**
   * Type
   */
  type: (process.env.REMOTE_TYPE || process.argv[2] || '').toUpperCase(),

  /**
   * URL
   */
  url: process.env.REMOTE_URL || process.argv[3] || '',

  /**
   * Branch (could be also inner directory)
   */
  branch: process.env.REMOTE_BRANCH || process.argv[4] || ''
}

/**
 * Remote type autoguessing
 */
if (!remote.branch && !remote.url && remote.type) {
  remote.url = remote.type
  remote.type = 'GIT'
} else if (remote.type && remote.type.split('.').length > 1 && remote.url) {
  remote.branch = remote.url
  remote.url = remote.type
  remote.type = 'GIT'
}
if (!remote.type && remote.url) {
  if (/\.(zip|t.?z|tar(\.(z|lzma|xz|lz2?|bz2?|gz2?))?)$/i.test(remote.url)) {
    remote.type = 'ARCHIVE'
  } else if (/\bsvn\b/i.test(remote.url)) {
    remote.type = 'SVN'
  } else {
    remote.type = 'GIT'
  }
}
/**
 * Branch autoguessing.
 */
if (!remote.branch) {
  if (remote.type === 'GIT') {
    remote.branch = 'master'
  }
}

/**
 * Hold local codebase revision id
 */
let revisionIdLocal = ''

/**
 * Calculate string interval in seconds.
 * @param {*} interval
 */
const calculateInterval = interval => interval
  .replace(/(\d+)h/i, (str, val) => val * 60 * 60)
  .replace(/(\d+)m/i, (str, val) => val * 60)
  .replace(/(\d+)s/i, (str, val) => val)
  .split(/[^\d]/)
  .reduce((a, b) => parseFloat(a) + parseFloat(b), 0)

/**
 * Preparing /ssh_key
 */
const checkPrivateKey = function () {
  let keysPath = '/ssh_key'
  let exists = fs.existsSync(keysPath)
  let isDir = exists && fs.lstatSync(keysPath).isDirectory()

  if (exists && isDir) {
    fs.chmodSync(keysPath, 0o700)
    keysPath = path.join(keysPath, process.env.HOSTNAME + '_id_rsa')
    exists = fs.existsSync(keysPath)
  }

  if (exists) {
    try {
      console.error(`Info: Found ssh private key file "${keysPath}"`)
      fs.chmodSync(keysPath, 0o600)
    } catch (err) {
      console.error(`Warning: Cannot chmod key file "${keysPath}", ensure the passed key file have recommended modes 0600.`)
    }
    return
  }

  console.error(`Info: No private key file "${keysPath}", generating one ...`)
  let result = childProcess.spawnSync('ssh-keygen',
    ['-b', 4096, '-t', 'rsa', '-f', keysPath, '-q', '-N', ''],
    {
      stdio: 'pipe',
      silent: true
    })
  if (result.status !== 0 || !fs.existsSync(keysPath + '.pub')) {
    console.log('ERROR: Could not generate ssh key file, try to provide via mounts.')
    process.exit(1)
  }
  fs.chmodSync(keysPath, 0o600)
  let publicKeyContent = fs.readFileSync(keysPath + '.pub')
  console.log('Info: Public ssh key is generated, copy it as deployment key if need.')
  console.log('-'.repeat(69))
  console.log(publicKeyContent.toString().match(/.{0,69}/g).join('\n').trim())
  console.log('-'.repeat(69))
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
      stdio: 'inherit'
    })
  return result.status === 0 ? tmpFilePath : false
}

/**
 * From URL content get hash by headers
 * @param {*} url
 * @returns {String}
 */
const getUrlHash = function (url) {
  let headers = childProcess.spawnSync('wget',
    ['-q', '-S', '--spider', url],
    {
      stdio: 'pipe',
      silent: true
    })
  headers = headers.output[2]
    .toString('utf8')
    .split('\n')
    .map(item => item.trim())
    .filter(item => /^etag|last-modified|content-length/i.test(item))
    .sort()
    .join('')
  return crypto.createHash('md5').update(headers).digest('hex')
}

/**
 * Reload degu (/app/.degu.json) and reset deguOpts
 * @returns {boolean}
 */
const loadDeguFileOpts = function () {
  if (fs.existsSync(deguFile)) {
    console.log(`Info: Load "${deguFile}"`)
    let deguFileOpts = require(deguFile)
    Object.keys(deguFileOpts).map((key, index) => {
      if (deguOpts.hasOwnProperty(key)) {
        if (Array.isArray(deguOpts[key])) {
          deguOpts[key] = deguFileOpts[key]
        } else if (typeof deguOpts[key] === 'object') {
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
    console.log(`Info: "${deguFile}" not found, going defaults ...`)
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
  if (!appProcess) {
    return
  }
  console.log('Info: Exiting ...')
  appProcess.kill(code || 0)
  process.exit(code || 0)
}

/**
 * Fetch codebase from GIT repository
 */
const updateCodebaseFromGit = function () {
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
        stdio: 'inherit',
        cwd: appDir
      })

    if (result.status !== 0) {
      process.exit(result.status)
    }

    result = childProcess.spawnSync('git',
      ['pull'],
      {
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
        stdio: 'inherit'
      })

    if (result.status !== 0) {
      process.exit(result.status)
    }
  }

  revisionIdLocal = childProcess.spawnSync('git',
    ['rev-parse', '@{u}'],
    {
      cwd: appDir
    })
    .stdout.toString().trim()
}

/**
 * Fetch codebase from SVN repository
 */
const updateCodebaseFromSvn = function () {
  let repositoryUrl = remote.url
  if (remote.branch) {
    repositoryUrl += '/' + remote.branch
  }

  let result = childProcess.spawnSync('svn',
    ['export', '--force', repositoryUrl, appDir],
    {
      stdio: 'inherit'
    })

  if (result.status !== 0) {
    process.exit(result.status)
  }

  revisionIdLocal = childProcess.spawnSync('svn',
    ['info', '--show-item', 'revision', remote.url],
    {
      cwd: appDir
    }).stdout.toString().trim()
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

  revisionIdLocal = getUrlHash(remote.url)
}

/**
 * Update codebase from remote.
 */
const updateCodebase = function () {
  if (remote.url) {
    console.log(`Info: Downloading codebase from remote ${remote.type} "${remote.url}" ...`)
  }
  if (remote.type === 'GIT') {
    updateCodebaseFromGit()
  } else if (remote.type === 'ARCHIVE') {
    updateCodebaseFromArchive()
  } else if (remote.type === 'SVN') {
    updateCodebaseFromSvn()
  } else if (fs.existsSync(appDir)) {
    let files = fs.readdirSync(appDir)
    if (files.length > 0) {
      console.log('Warning: No supported remote is set, starting from directory', remote)
    } else {
      console.error('ERROR: No supported remote is set.', remote)
      process.exit(1)
    }
  } else {
    console.error('ERROR: Unknown remote type', remote)
    console.error('ERROR: No app directory')
    process.exit(1)
  }

  console.log(`Info: Codebase revision: "${revisionIdLocal}"`)
}

/**
 * Start web manager API
 */
const startManagerApi = function () {
  if (!deguOpts.api.enable || !deguOpts.api.port) {
    return
  }

  const prefix = '/' + (deguOpts.api.prefix || '/').replace(/^\//, '')
  console.log(`Info: Starting status web server on http://0.0.0.0:${deguOpts.api.port}${prefix} ...`)

  const normalizeUrl = x => x.replace(/\/{2,}/g, '/').replace(/(^\/+|\/+$)/g, '')

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
        response.statusCode = 403
        response.end('Permission denied.')
        console.error(`Warning: Rejected API request url=${request.url} ip=${ip}.`)
        return
      }
    }

    let reqUrl = url.parse(request.url, true)
    reqUrl.pathname = normalizeUrl(reqUrl.pathname)

    if (request.method === 'GET' && reqUrl.pathname === normalizeUrl(prefix)) {
      let remoteSanitized = remote
      remoteSanitized.url = remoteSanitized.url.replace(/(\w+:\/\/)?([^/]*):([^/]*)@/, '$1$2:<password>@')
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        runId: runId,
        uptime: (((new Date()) - time) / 1000).toFixed(3).toString(),
        env: process.env,
        deguOpts: deguOpts,
        remote: remote,
        remoteRevision: revisionIdLocal
      }, null, 2))
    } else if (request.method === 'POST' && reqUrl.pathname === normalizeUrl(prefix + 'exit')) {
      response.end('OK: Exiting ...')
      console.log(`Info: Receiving exit signal delay=${reqUrl.query.delay || 0} code=${reqUrl.query.code || 0}`)
      if (reqUrl.query.delay) {
        setTimeout(() => {
          exit(reqUrl.query.code)
        }, calculateInterval(reqUrl.query.delay) * 1000)
      } else {
        exit(reqUrl.query.code)
      }
    } else {
      console.error(`Warning: Received invalid commant ${request.method} ${request.url}`)
      response.statusCode = 404
      response.end('ERROR: No such command.')
    }
  })
    .listen(deguOpts.api.port)
}

/**
 * Start web manager API
 */
const startPuller = function () {
  if (!remote.type || !remote.url || !deguOpts.puller.enable || !deguOpts.puller.interval) {
    return
  }

  /**
   * Check function
   */
  const checker = function () {
    let revisionIdRemote = ''

    if (remote.type === 'GIT') {
      revisionIdRemote = childProcess.spawnSync('git',
        ['ls-remote', 'origin', remote.branch],
        {
          cwd: appDir
        }).stdout.toString().trim()
      revisionIdRemote = (revisionIdRemote || '').split(/\s+/).shift()
    } else if (remote.type === 'ARCHIVE') {
      revisionIdRemote = getUrlHash(remote.url)
    } else if (remote.type === 'SVN') {
      revisionIdRemote = childProcess.spawnSync('svn',
        ['info', '--show-item', 'revision', remote.url],
        {
          cwd: appDir
        }).stdout.toString().trim()
    }

    if (revisionIdRemote && revisionIdLocal && revisionIdRemote !== revisionIdLocal) {
      console.log(`Info: Puller exit because of new codebase version new: ${revisionIdRemote}, old: ${revisionIdLocal}`)
      exit()
    }
  }

  // setup interval
  console.log(`Info: Starting codebase puller every ${deguOpts.puller.interval} ...`)
  setInterval(checker, calculateInterval(deguOpts.puller.interval) * 1000)
}

console.log(`Info: App is starting up #${runId} ...`)

// Check ssh_key
checkPrivateKey()

// Update codebase.
updateCodebase()

// Reload file.
loadDeguFileOpts()

// Check for package.json or .degu.json
if (!(fs.existsSync(path.join(appDir, 'package.json')) || fs.existsSync(deguFile))) {
  console.error(`ERROR: ${appDir}/package.json or ${deguFile} is required.`)
  process.exit(1)
}

// Start main process.
start()

// Start web managemenet API.
startManagerApi()

// Start the puller
startPuller()

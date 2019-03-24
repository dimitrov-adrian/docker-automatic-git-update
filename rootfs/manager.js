const http = require('http')
const childProcess = require('child_process')

http.createServer(function (request, response) {
  if (request.method === 'POST') {
    if (request.url === '/$exit') {
      childProcess.exec('kill -9 -1')
    } else if (request.url === '/$git/update') {
      childProcess.exec('git pull')
    }
  }

  response.end()
}).listen(8125)

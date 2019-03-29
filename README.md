# Degu

> ***This container is not intended for production use, it's just provide an easy way to deploy apps for testing purposes.***


Run node apps from git repository url

```
docker run dimitrovadrian/degu [git|archive] <URL> [branch]
```

Example:

```
docker run --rm -ti --name myapp \
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/key" \
    dimitrovadrian/degu \
    https://github.com/fhinkel/nodejs-hello-world
```

Binding directory to /app is possible but for caching purposes.

```
docker run --rm -ti --name myapp \
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/key" \
    -v "/tmp/app.cache:/app"
    dimitrovadrian/degu \
    https://github.com/fhinkel/nodejs-hello-world
```

Or use url to zip file

```
docker run --rm -ti --name myapp \
    -p 8080:8080 \
    -p 8125:8125 \
    dimitrovadrian/degu \
    archive https://github.com/fhinkel/nodejs-hello-world/archive/master.zip
```

App **must** have `package.json` or `.degu.json` file to run the main process.

### GIT ssh private key file
`/key`

provide as mount like: `-v "$HOME/.ssh/id_rsa_demo:/key"`

### API

API has very limited features

#### Endpoints
* `POST` `/<api.prefix>exit` - exit the app, restarting could be handled by docker restart policy
* `GET` `/<api.prefix>uptime` - get uptime in seconds
* `GET` `/<api.prefix>id` - current run ID


### Env

* `APP_DIR` the app directory, default is `/app`
* `DEGU_FILE` .degu.json file (full path), default is `<APP_DIR>/.degu.json`

Remote info, setting these variables will override command line args.
* `REMOTE_TYPE`
* `REMOTE_URL`
* `REMOTE_BRANCH`

API related options, if .degu.json file is provided then it's override env variables.
* `DEGU_API_ENABLE` default is `true`
* `DEGU_API_PORT` default is 8125
* `DEGU_API_PREFIX` default is `/`
* `DEGU_API_WHITELIST` empty, all is allowed

### /app/.degu.json file example

```json
{
  "env": {
    "VAR1": "VALUE1",
    "VAR2": "VALUE2"
  },
  "main": [ "npm", "start" ],
  "steps": [
    [ "npm", "install" ]
   ],
  "api": {
    "port": 8125,
    "enable": true,
    "prefix": "/",
    "whiteList": [
      "127.0.0.1"
    ]
  }
}

```

# Degu

---
> ***Notice*** *This container is not intended for production use, it's just provide an easy way to deploy apps for testing purposes.*
---

## Docker images

Tags:
* `latest`
* `node-11`
* `node-10` (latest)
* `node-8`


Run node apps directly from source URL (GIT, SVN or archive URL).

```
docker run dimitrovadrian/degu [git|svn|archive] <URL> [branch]
```

Example:

```
docker run --rm -ti --name myapp \
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/ssh_key" \
    dimitrovadrian/degu \
    https://github.com/fhinkel/nodejs-hello-world
```

Binding directory to /app is possible but for caching purposes.

```
docker run --rm -ti --name myapp \
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/ssh_key" \
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
`/ssh_key`

provide as mount like: `-v "$HOME/.ssh/id_rsa_demo:/ssh_key"`

### API

API has very limited features

#### Endpoints
* `POST` `/<api.prefix>exit` - exit the app, restarting could be handled by docker restart policy supported query options `delay` in seconds and `code` int
* `GET` `/<api.prefix>` - get info about current instance

Info example:

```
curl localhost:8125
```

Exit example:
```
curl -XPOST localhost:8125/exit?delay=10
```

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
* `DEGU_API_WHITELIST` IP whitelist (coma separated), by default all is allowed

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

## License
The degu project is free for use in any meaning.

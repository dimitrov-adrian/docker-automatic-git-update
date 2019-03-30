# Degu

![](https://img.shields.io/docker/build/dimitrovadrian/degu.svg)
![](https://img.shields.io/microbadger/layers/layers/dimitrovadrian/degu/latest.svg)
![](https://img.shields.io/microbadger/image-size/image-size/dimitrovadrian/degu/latest.svg)
![](https://img.shields.io/docker/stars/dimitrovadrian/degu.svg)

Run node apps directly from source URL (GIT, SVN or archive URL).


> ***Notice*** *This container is not intended for production use, it just provide an easy way to deploy apps for testing purposes.*


## Image tags
* `latest`
* `node-11`
* `node-10` (latest)
* `node-8`


## Usage


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
    -v "/tmp/app.cache:/app" \
    dimitrovadrian/degu \
    https://github.com/fhinkel/nodejs-hello-world
```

Or use URL to zip file (or tar files)

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

## License & Terms
**Degu** project is available under the terms of the GPL-v2 or later license.


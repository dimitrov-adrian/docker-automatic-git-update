# Degu

![](https://img.shields.io/microbadger/layers/dimitrovadrian/degu/latest.svg)
![](https://img.shields.io/microbadger/image-size/dimitrovadrian/degu/latest.svg)
![](https://img.shields.io/docker/pulls/dimitrovadrian/degu.svg)
![](https://img.shields.io/docker/stars/dimitrovadrian/degu.svg)

Run node apps directly from source remote URL.


> ***Notice*** *This container is not intended for production use, it just provide an easy way to deploy apps for testing purposes.*


## Image tags

Node images are base on [official node alpine images](https://hub.docker.com/_/node/)

* [`latest`](https://github.com/dimitrov-adrian/degu/blob/master/node/10-alpine/Dockerfile)
* [`node-11`](https://github.com/dimitrov-adrian/degu/blob/master/node/11-alpine/Dockerfile)
* [`node-10` (latest)](https://github.com/dimitrov-adrian/degu/blob/master/node/10-alpine/Dockerfile)
* [`node-8`](https://github.com/dimitrov-adrian/degu/blob/master/node/8-alpine/Dockerfile)


## Supported remote sources
* GIT
* SVN
* Archives: zip, tar, tar.gz, tar.bz2, tar.xz

It also supported to run the container without remote but mounted directory, anyway,
this is not the idea of the container.


## Usage

```
docker run dimitrovadrian/degu[:tag] [git|svn|archive] <URL> [branch]
```

* In SVN context, branch could be also passed to URL
* In archive URLs context, branch is representing inner path or directory name

Example:

```
docker run --rm -ti --name nodejshelloworld \
    --restart always
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/ssh_key" \
    dimitrovadrian/degu \
    https://github.com/fhinkel/nodejs-hello-world
```

Binding directory to /app is possible but for caching purposes.

```
docker run --rm -ti --name nodejshelloworld \
    --restart always
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/ssh_key" \
    -v "/tmp/app.cache:/app" \
    dimitrovadrian/degu \
    https://github.com/fhinkel/nodejs-hello-world
```

Archive url example:

```
docker run --rm -ti --name nodejshelloworld \
    -p 8080:8080 \
    dimitrovadrian/degu \
    archive https://github.com/fhinkel/nodejs-hello-world/archive/master.zip nodejs-hello-world-master
```

App **must** have `package.json` or `.degu.json` file to run the main process.


## GIT ssh private key file
`/ssh_key`

provide as mount like: `-v "$HOME/.ssh/id_rsa_demo:/ssh_key"`


## API

API has very limited features

#### Endpoints
* `POST` `/<api.prefix>exit` - exit the app, restarting could be handled by docker restart policy supported query options `delay` in seconds and `code` int
* `GET` `/<api.prefix>` - get info about current instance in JSON format

Info example:

```
curl localhost:8125
```

Exit example:
```
curl -XPOST localhost:8125/exit?delay=10
```

### Port

By default API server listen on 8125 port, but could be changed from `.degu.json` file
or by `DEGU_API_PORT` env

## Puller

Puller is checker that run in interval, it could be used if case that API request cannot be made. For archives it use combination of `Last-Modified`, `Etag`, `Content-Size` to do a checksum.


## Environment variables

* `TZ` set time zone, default is `Europe/London`
* `APP_DIR` the app directory, default is `/app`
* `DEGU_FILE` .degu.json file (full path), default is `<APP_DIR>/.degu.json`

Remote info, setting these variables will override command line args.
* `REMOTE_TYPE` default is argv[0]
* `REMOTE_URL` default is argv[1]
* `REMOTE_BRANCH` default is argv[2]

API related options, if .degu.json file is provided then it's override env variables.
* `DEGU_API_ENABLE` default is `true`
* `DEGU_API_PORT` default is 8125
* `DEGU_API_PREFIX` default is `/`
* `DEGU_API_WHITELIST` IP whitelist (coma separated), by default all is allowed

Puller related options, if .degu.json file is provided then it's override env variables.
* `DEGU_PULLER_ENABLE` default is `false`
* `DEGU_PULLER_INTERVAL` default is 21600 (6 hours)


## .degu.json file example

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
  },
  "puller": {
    "enable": true,
    "interval": 21600
  }
}

```


## License & Terms
This project is licensed under the [MIT](https://github.com/dimitrov-adrian/degu/blob/master/LICENSE.txt) License

Node.js official docker image [license](https://hub.docker.com/_/node/#license)

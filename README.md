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

App must have `package.json` or `.degu.json` file to run the main process.

### GIT ssh private key file
`/key`

### API
API has one simple POST method - exit, when is triggered, the container is exited,
so it docker could handle and start again.

Endpoints:
- `exit`

### /app/.degu.json file

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

# Degu

> ***This container is not intended for production use, it's just provide an easy way to deploy apps for testing purposes.***


Run node apps from git repository url

```
docker run dimitrovadrian/degu <git repo>
```

Example:

```
docker run --rm -ti --name myapp \
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/key" \
    dimitrovadrian/degu \
    https://github.com/nodejs/nodejs-hello-world
```

Binding directory to /app is possible but for caching purposes.

```
docker run --rm -ti --name myapp \
    -p 8080:8080 \
    -p 8125:8125 \
    -v "$HOME/.ssh/id_rsa_demo:/key" \
    -v "/tmp/app.cache:/app"
    dimitrovadrian/degu \
    https://github.com/nodejs/nodejs-hello-world
```

App must have `package.json` or `.degu.json` file to run the main

### GIT ssh private key file
`/key`

### API
Api is listening on port 8125

Endpoints:
- `reload-degu-file`
- `exit`
- `restart`
- `git/update`
- `git/updateAndExit`
- `git/updateAndRestart`

API endpoints could be used to notify the container to update and restart,
for example setting github webhooks to `git/updateAndRestart`

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
    "enable": true,
    "prefix": "/",
    "whiteList": [
      "127.0.0.1"
    ]
  },
  "updateScheduler": {
    "enable": false,
    "interval": 3600,
    "onUpdate": "restart"
  }
}

```

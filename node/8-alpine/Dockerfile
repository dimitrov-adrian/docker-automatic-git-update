FROM node:8-alpine

RUN apk add --no-cache xz bzip2 git openssh-client python make autoconf g++ gcc

RUN echo -e "CanonicalizeHostname yes\nHost *\n\tStrictHostKeyChecking no\n IdentityFile /ssh_key" > /etc/ssh/ssh_config

COPY docker-entrypoint.js /

ENTRYPOINT ["node", "/docker-entrypoint.js"]

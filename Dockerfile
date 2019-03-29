FROM node:10-alpine

RUN apk add --no-cache git openssh-client python make g++ gcc curl

RUN echo -e "CanonicalizeHostname yes\nHost *\n\tStrictHostKeyChecking no\n IdentityFile /ssh_key" > /etc/ssh/ssh_config

COPY docker-entrypoint.js /

ENTRYPOINT ["node", "/docker-entrypoint.js"]

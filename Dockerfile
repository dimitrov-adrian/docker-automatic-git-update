FROM node:10-alpine

RUN apk add --no-cache git openssh-client python make g++ gcc

RUN mkdir -p /root/.ssh &&\
    echo -e "CanonicalizeHostname yes\nHost *\n\tStrictHostKeyChecking no\n IdentityFile /key" > /root/.ssh/config

COPY docker-entrypoint.js /

WORKDIR /app

EXPOSE 8125

ENTRYPOINT ["node", "/docker-entrypoint.js"]

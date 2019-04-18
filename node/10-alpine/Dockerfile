FROM node:10-alpine

RUN apk add --no-cache tzdata xz bzip2 git subversion openssh-client python make autoconf g++ gcc

RUN echo -e "CanonicalizeHostname yes\nHost *\n\tStrictHostKeyChecking no\n IdentityFile /ssh_key/%h\n IdentityFile /ssh_key/%l_id_rsa\n IdentityFile /ssh_key/id_rsa\n IdentityFile /ssh_key" > /etc/ssh/ssh_config

COPY docker-entrypoint.js /

ENTRYPOINT ["node", "/docker-entrypoint.js"]

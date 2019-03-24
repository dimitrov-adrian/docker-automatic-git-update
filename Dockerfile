from node:10-alpine

MAINTAINER Adrian Dimitrov <dimitrov.adrian@gmail.com>
LABEL version="1.0" description=""

RUN apk add --no-cache git openssh-client

COPY rootfs /

WORKDIR /app

EXPOSE 8125

ENTRYPOINT ["/docker-entrypoint.sh"]

FROM node:10-alpine

RUN apk add --no-cache git openssh-client

COPY docker-entrypoint.js /

WORKDIR /app

EXPOSE 8125

ENTRYPOINT ["node", "/docker-entrypoint.js"]

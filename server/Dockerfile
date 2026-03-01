# syntax=docker/dockerfile:1.7

FROM golang:1.24-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/cookbookclub .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S app \
    && adduser -S -G app app \
    && mkdir -p /data \
    && chown -R app:app /data

WORKDIR /app
COPY --from=builder /out/cookbookclub /usr/local/bin/cookbookclub

USER app
EXPOSE 8080

ENV PORT=8080 \
    DB_PATH=/data/cookbookclub.db \
    UPLOAD_DIR=/data/uploads \
    FRONTEND_ORIGIN=*

VOLUME ["/data"]
ENTRYPOINT ["cookbookclub"]

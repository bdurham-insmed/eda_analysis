FROM golang:1.24-alpine AS builder

RUN apk add --no-cache gcc musl-dev librdkafka-dev

WORKDIR /app

COPY services/high_throughput/ ./

RUN go mod download

RUN CGO_ENABLED=1 go build -tags dynamic -o high_throughput .


FROM alpine:latest

RUN apk add --no-cache librdkafka

WORKDIR /app

COPY --from=builder /app/high_throughput .

CMD ["./high_throughput"]

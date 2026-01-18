FROM golang:1.24-alpine AS builder

RUN apk add --no-cache gcc musl-dev librdkafka-dev

WORKDIR /app

COPY services/metric_collector/ ./

RUN go mod download

RUN CGO_ENABLED=1 go build -tags dynamic -o metric_collector .


FROM alpine:latest

RUN apk add --no-cache librdkafka

WORKDIR /app

COPY --from=builder /app/metric_collector .

CMD ["./metric_collector"]

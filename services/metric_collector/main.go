package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/confluentinc/confluent-kafka-go/kafka"
)

func main() {
	brokerAddress := "kafka:9092"
	topic := "pipeline-events"

	r, err := kafka.NewConsumer(&kafka.ConfigMap{
		"bootstrap.servers": brokerAddress,
		"group.id":          "metric-collector",
		"auto.offset.reset": "earliest",
	})
	if err != nil {
		log.Printf("Failed to create Kafka consumer: %v", err)
		os.Exit(1)
	}

    defer func() {
        if r == nil {
            log.Println("Kafka consumer is nil, nothing to close")
            return
        }
        const maxRetries = 5
        var lastErr error
        for i := 0; i < maxRetries; i++ {
            if err := r.Close(); err != nil {
                lastErr = err
                log.Printf("failed to close consumer (attempt %d/%d): %v", i+1, maxRetries, err)
                time.Sleep(time.Duration(1<<i) * 100 * time.Millisecond) // exponential backoff
                continue
            }
            log.Println("Kafka consumer closed successfully")
            return
        }
        log.Fatalf("failed to close consumer after %d attempts, last error: %v", maxRetries, lastErr)
    }()

	err = r.SubscribeTopics([]string{topic}, nil)
	if err != nil {
		log.Fatalf("Failed to subscribe to topic %s: %v", topic, err)
	}

	fmt.Println("Starting to read messages from Kafka topic:", topic)

	for {
		_, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		ev := r.Poll(int(10 * 1000)) // Poll for up to 10 seconds
		cancel()
		if ev == nil {
			log.Printf("No message received in 10 seconds, retrying...")
			time.Sleep(time.Second)
			continue
		}

		switch m := ev.(type) {
		case *kafka.Message:
			fmt.Printf("message at offset %d: %s = %s\n", m.TopicPartition.Offset, string(m.Key), string(m.Value))
		case kafka.Error:
			log.Printf("Kafka error: %v", m)
			time.Sleep(time.Second)
		default:
			log.Printf("Ignored event: %v", m)
		}
	}
}

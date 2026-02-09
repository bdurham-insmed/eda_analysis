package main

import (
	"fmt"
	"sync"

	"github.com/confluentinc/confluent-kafka-go/kafka"
)

func main() {
	brokerAddress := "kafka:9092"
	topic := "high-throughput-topic"
	p, err := kafka.NewProducer(&kafka.ConfigMap{
		"bootstrap.servers":            brokerAddress,
		"client.id":                    "high-throughput-producer",
		"linger.ms":                    100,
		"batch.size":                   525000,
		"acks":                         "1",
		"compression.type":             "lz4",
		"queue.buffering.max.messages": 1000000,
	})
	if err != nil {
		panic(fmt.Sprintf("Producer not created: %s", err))
	}
	defer p.Close()

	go func() {
		for e := range p.Events() {
			if m, ok := e.(*kafka.Message); ok && m.TopicPartition.Error != nil {
				fmt.Printf("Delivery Error: %v\n", m.TopicPartition.Error)
			}
		}
	}()

	var wg sync.WaitGroup
	batch := 5000000
	for w := range [10]int{} {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := range batch {
				p.Produce(&kafka.Message{
					TopicPartition: kafka.TopicPartition{Topic: &topic, Partition: kafka.PartitionAny},
					Value:          fmt.Appendf(nil, "%d-%d", w+1, i),
				}, nil)
			}
		}(w)
	}
	wg.Wait()
	remaining := p.Flush(60 * 1000)
	if remaining > 0 {
		fmt.Printf("Warning: %d messages were not delivered\n", remaining)
	}
}

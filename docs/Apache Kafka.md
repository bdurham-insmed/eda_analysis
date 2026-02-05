# Apache Kafka

## What is Apache Kafka?

Apache Kafka is a distributed event streaming platform designed for high-throughput, fault-tolerant, and scalable real-time data pipelines and streaming applications. It enables the publishing, storing, and processing of streams of records in a fault-tolerant way.

## Core Concepts

- **Producer**: Sends data (messages) to Kafka topics.
- **Consumer**: Reads data from Kafka topics.
- **Topic**: A category or feed name to which records are sent.
- **Broker**: A Kafka server that stores data and serves clients.
- **Partition**: Topics are split into partitions for scalability and parallelism.
- **KRaft**: Manages Kafka brokers (Replaced Zookeeper in newer versions of Apache Kafka).

## Further Key Concepts
- **Consumer Group**: A group of consumers that work together to consume messages from topics.
- **Offset**: A unique identifier for each message within a partition, used to track consumption.
- **Replication**: Kafka replicates data across multiple brokers for fault tolerance.
- **Retention**: Kafka retains messages for a configurable period, allowing consumers to read them at their own pace.
- **Idempotency**: Ensures that messages are delivered exactly once, even in the presence of failures. Kafka supports idempotent producers to avoid duplicate messages.

## How Kafka Works

1. **Producers** write messages to topics.
2. **Kafka brokers** store these messages, partitioned and replicated for reliability.
3. **Consumers** subscribe to topics and process messages in real time or batch.
4. **Offsets** track the position of each consumer in a topic.

## Use Cases

- Real-time analytics and monitoring
- Event sourcing and log aggregation
- Data integration between microservices
- Stream processing (with Kafka Streams or external tools)
- Messaging backbone for distributed systems
- Exactly-once delivery guarantees in data pipelines
- Decoupling of data producers and consumers for scalability

Kafka is designed to handle very high throughput and can process millions of messages per second, making it suitable for large-scale data processing applications.

## Examples of Kafka Usage

Kafka can be integrated into various programming languages and frameworks. Below are examples:

### JavaScript / TypeScript (Node.js)

Use the `kafkajs` library for producing and consuming messages.

```javascript
const { Kafka } = require('kafkajs');
const kafka = new Kafka({ clientId: 'my-app', brokers: ['localhost:9092'] });
const producer = kafka.producer();
await producer.connect();
await producer.send({ topic: 'test-topic', messages: [{ value: 'Hello Kafka' }] });
```

### Python

Use the `confluent-kafka` or `kafka-python` library. 
`confluent-kafka` is used in this repo so here's an example with `kafka-python`:

```python
from kafka import KafkaProducer
producer = KafkaProducer(bootstrap_servers='localhost:9092')
producer.send('test-topic', b'Hello Kafka')
producer.flush()
```

### Go

Use the `segmentio/kafka-go` package.

```go
import "github.com/segmentio/kafka-go"
w := kafka.NewWriter(kafka.WriterConfig{
    Brokers: []string{"localhost:9092"},
    Topic:   "test-topic",
})
w.WriteMessages(context.Background(), kafka.Message{Value: []byte("Hello Kafka")})
```

---
### References and Further Reading
- [Apache Kafka Official Website](https://kafka.apache.org/)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [KafkaJS Library](https://kafka.js.org/)
- [kafka-python Library](https://kafka-python.readthedocs.io/en/master/)
- [confluent-kafka Python Library](https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html)
- [How LinkedIn uses Kafka](https://blog.bytebytego.com/p/how-linkedin-customizes-its-7-trillion)

For more details, see the [Apache Kafka documentation](https://kafka.apache.org/documentation/). 

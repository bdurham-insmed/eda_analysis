# State Tracker Service
This service consumes pipeline event messages from Apache Kafka and tracks the state of pipeline executions. It is designed for scalability and reliability in an event-driven architecture.

## Features
Consumes events from a Kafka topic
* Tracks and updates pipeline state
* Supports horizontal scaling via Kafka consumer groups
* Written in Python

## Kafka Consumer Overview
Kafka consumers read messages from Kafka topics. Key options and concepts:
* `Consumer Groups`: Multiple consumers in the same group share the workload. Each message is delivered to only one consumer in the group.
* `Offset Management`: Consumers track their position in the topic using offsets. Offsets can be committed automatically or manually.
* `Auto Commit`: By default, offsets are committed automatically at intervals. For more control, manual commit can be used.
* `Partition Assignment`: Kafka distributes topic partitions among consumers in a group for parallel processing.
* `Scaling`: To increase throughput, run multiple instances of this service. Kafka will balance partitions among them.

### Common Kafka Consumer Options
|Option|Description|
|------|-----------|
|group.id|Consumer group identifier|
|auto.offset.reset|Where to start if no offset is present (earliest, latest)|
|enable.auto.commit|Whether to commit offsets automatically (true/false)|
|max.poll.records|Max records returned in a single poll|
|session.timeout.ms|Consumer session timeout|

## Running the State Tracker Service
This service is intended to be run as part of a Docker Compose setup. 
Please refer to the main project README for instructions on setting up and running the entire system.
Ensure you have Docker and Docker Compose installed.
